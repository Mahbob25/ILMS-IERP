from decimal import Decimal
import uuid
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from sqlalchemy.orm import joinedload

from app.modules.lms.models import (
    LedgerEntry, LedgerEntryType, TeacherWallet, SectionContract,
    ContractStatus, CompensationModel,
)
from app.modules.academic.models import CourseSection, Enrollment, FinalGrade


async def record(
    db: AsyncSession,
    wallet_id: uuid.UUID,
    contract_id: Optional[uuid.UUID],
    entry_type: LedgerEntryType,
    total_amount: Decimal,
    available_delta: Decimal,
    frozen_delta: Decimal,
    reference_type: Optional[str],
    reference_id: Optional[uuid.UUID],
    narrative: Optional[str],
    created_by: uuid.UUID,
    force: bool = False,
) -> LedgerEntry:
    entry = LedgerEntry(
        wallet_id=wallet_id,
        contract_id=contract_id,
        type=entry_type,
        total_amount=total_amount,
        available_delta=available_delta,
        frozen_delta=frozen_delta,
        reference_type=reference_type,
        reference_id=reference_id,
        narrative=narrative,
        created_by=created_by,
    )
    db.add(entry)

    wallet_result = await db.execute(
        select(TeacherWallet)
        .where(TeacherWallet.id == wallet_id)
        .with_for_update()
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise ValueError(f"Wallet {wallet_id} not found")

    wallet.balance = Decimal(str(wallet.balance or 0)) + available_delta + frozen_delta
    wallet.frozen_balance = Decimal(str(wallet.frozen_balance or 0)) + frozen_delta

    if wallet.frozen_balance < 0:
        raise ValueError(
            f"Invariant violation: frozen_balance ({wallet.frozen_balance}) cannot be negative"
        )
    if not force and wallet.frozen_balance > wallet.balance:
        raise ValueError(
            f"Invariant violation: frozen_balance ({wallet.frozen_balance}) exceeds balance ({wallet.balance})"
        )

    await db.flush()
    return entry


async def get_wallet_summary(
    db: AsyncSession, wallet_id: uuid.UUID
) -> dict:
    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.id == wallet_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        return {"total_balance": 0, "total_frozen": 0, "total_available": 0, "sections": []}

    total_balance = Decimal(str(wallet.balance or 0))
    total_frozen = Decimal(str(wallet.frozen_balance or 0))
    total_available = total_balance - total_frozen

    entries_result = await db.execute(
        select(LedgerEntry)
        .options(
            joinedload(LedgerEntry.contract)
            .joinedload(SectionContract.section)
            .joinedload(CourseSection.course)
        )
        .where(LedgerEntry.wallet_id == wallet_id)
        .order_by(LedgerEntry.created_at)
    )
    entries = entries_result.scalars().all()

    contract_groups: dict[uuid.UUID, dict] = {}
    for entry in entries:
        cid = entry.contract_id
        if cid is None:
            continue
        if cid not in contract_groups:
            contract_groups[cid] = {
                "credited": Decimal("0"),
                "frozen": Decimal("0"),
            }
        contract_groups[cid]["credited"] += (
            Decimal(str(entry.available_delta)) + Decimal(str(entry.frozen_delta))
        )
        contract_groups[cid]["frozen"] += Decimal(str(entry.frozen_delta))

    sections = []
    for cid, agg in contract_groups.items():
        contract_entry = next((e for e in entries if e.contract_id == cid), None)
        if not contract_entry or not contract_entry.contract:
            continue
        contract = contract_entry.contract
        section = contract.section
        course = section.course if section else None
        sections.append({
            "contract_id": str(cid),
            "section_name": str(section.id) if section else None,
            "course_name": course.name if course else None,
            "model": contract.compensation_model.value if contract.compensation_model else None,
            "status": contract.status.value if contract.status else None,
            "credited": float(agg["credited"]),
            "frozen": float(agg["frozen"]),
            "available": float(agg["credited"] - agg["frozen"]),
        })

    return {
        "total_balance": float(total_balance),
        "total_frozen": float(total_frozen),
        "total_available": float(total_available),
        "sections": sections,
    }


async def get_or_create_wallet(
    db: AsyncSession, teacher_id: uuid.UUID, lock: bool = False
) -> TeacherWallet:
    query = select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    if lock:
        query = query.with_for_update()
    result = await db.execute(query)
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = TeacherWallet(
            teacher_id=teacher_id,
            balance=Decimal("0"),
            frozen_balance=Decimal("0"),
        )
        db.add(wallet)
        await db.flush()
        if lock:
            result = await db.execute(
                select(TeacherWallet)
                .where(TeacherWallet.id == wallet.id)
                .with_for_update()
            )
            wallet = result.scalar_one_or_none()
    return wallet


async def assign_contract(
    db: AsyncSession,
    section_id: uuid.UUID,
    teacher_id: uuid.UUID,
    compensation_model: CompensationModel,
    fixed_amount: Optional[Decimal] = None,
    percentage: Optional[Decimal] = None,
    holdback_rate: Optional[Decimal] = None,
) -> SectionContract:
    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()

    if compensation_model == CompensationModel.FIXED:
        if fixed_amount is None or fixed_amount <= 0:
            raise ValueError("fixed_amount is required and must be positive for FIXED contracts")
    elif compensation_model == CompensationModel.PERCENTAGE:
        if percentage is None or percentage <= 0:
            raise ValueError("percentage is required and must be positive for PERCENTAGE contracts")

    hb = holdback_rate if holdback_rate is not None else Decimal("0.20")
    if hb < 0 or hb > 1:
        raise ValueError("holdback_rate must be between 0 and 1")

    if not contract:
        contract = SectionContract(
            section_id=section_id,
            teacher_id=teacher_id,
            compensation_model=compensation_model,
            holdback_rate=hb,
            status=ContractStatus.ASSIGNED,
        )
        db.add(contract)
    else:
        contract.teacher_id = teacher_id
        contract.compensation_model = compensation_model
        contract.holdback_rate = hb
        contract.status = ContractStatus.ASSIGNED

    if compensation_model == CompensationModel.FIXED:
        contract.fixed_amount = fixed_amount
        contract.percentage = None
    else:
        contract.percentage = percentage
        contract.fixed_amount = None

    await db.flush()

    section_result = await db.execute(
        select(CourseSection).where(CourseSection.id == section_id)
    )
    section = section_result.scalar_one_or_none()
    if section:
        section.teacher_id = teacher_id
        if percentage is not None:
            section.teacher_percentage = percentage

    await db.flush()
    return contract


async def activate_contract(
    db: AsyncSession,
    contract_id: uuid.UUID,
    activated_by: uuid.UUID,
) -> SectionContract:
    result = await db.execute(
        select(SectionContract).where(SectionContract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"Contract {contract_id} not found")
    if contract.status != ContractStatus.ASSIGNED:
        raise ValueError(
            f"Only ASSIGNED contracts can be activated, current: {contract.status.value}"
        )
    if not contract.teacher_id:
        raise ValueError("Cannot activate a contract without a teacher")
    if not contract.compensation_model:
        raise ValueError("Cannot activate a contract without a compensation model")

    section_result = await db.execute(
        select(CourseSection).where(CourseSection.id == contract.section_id)
    )
    section = section_result.scalar_one_or_none()
    if not section:
        raise ValueError(f"Section {contract.section_id} not found")
    if section.price is None:
        raise ValueError("Cannot activate a section without a price. Set the price before activating.")
    if section.start_date is None:
        raise ValueError("Cannot activate a section without a start date. Set the start date before activating.")
    if section.class_time is None:
        raise ValueError("Cannot activate a section without a class time. Set the class time before activating.")

    wallet = await get_or_create_wallet(db, contract.teacher_id)

    if contract.compensation_model == CompensationModel.FIXED:
        fee = Decimal(str(contract.fixed_amount or 0))
        holdback = Decimal(str(contract.holdback_rate))
        available = fee * (Decimal("1") - holdback)
        frozen = fee * holdback
        await record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id,
            entry_type=LedgerEntryType.ACTIVATION_CREDIT,
            total_amount=fee,
            available_delta=available,
            frozen_delta=frozen,
            reference_type=None,
            reference_id=None,
            narrative=f"Activation credit (fixed): {fee}",
            created_by=activated_by,
        )

    contract.status = ContractStatus.ACTIVE
    contract.updated_at = datetime.now(timezone.utc)
    section.status = "active"

    await db.flush()
    return contract


async def finalize_grades_for_section(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> SectionContract:
    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"No contract found for section {section_id}")
    if contract.status != ContractStatus.ACTIVE:
        raise ValueError(
            f"Only ACTIVE contracts can be finalized, current: {contract.status.value}"
        )

    enrolled_count = await db.scalar(
        select(sa_func.count(Enrollment.id))
        .where(
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        )
    )
    graded_count = await db.scalar(
        select(sa_func.count(FinalGrade.id))
        .where(FinalGrade.section_id == section_id)
    )

    if enrolled_count and enrolled_count > (graded_count or 0):
        missing = enrolled_count - (graded_count or 0)
        raise ValueError(
            f"Cannot finalize grades: {missing} of {enrolled_count} students are missing final scores"
        )

    contract.status = ContractStatus.GRADES_SUBMITTED
    contract.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return contract


async def settle_contract(
    db: AsyncSession,
    contract_id: uuid.UUID,
    settled_by: uuid.UUID,
) -> SectionContract:
    result = await db.execute(
        select(SectionContract).where(SectionContract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"Contract {contract_id} not found")
    if contract.status != ContractStatus.GRADES_SUBMITTED:
        raise ValueError(
            f"Only GRADES_SUBMITTED contracts can be settled, current: {contract.status.value}"
        )
    if not contract.teacher_id:
        raise ValueError("Cannot settle a contract without a teacher")

    wallet = await get_or_create_wallet(db, contract.teacher_id)

    frozen_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(LedgerEntry.frozen_delta), 0))
        .where(
            LedgerEntry.contract_id == contract_id,
            LedgerEntry.wallet_id == wallet.id,
        )
    )
    total_frozen = Decimal(str(frozen_result.scalar() or 0))

    if total_frozen > 0:
        await record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id,
            entry_type=LedgerEntryType.GRADE_UNFREEZE,
            total_amount=total_frozen,
            available_delta=total_frozen,
            frozen_delta=-total_frozen,
            reference_type="section",
            reference_id=contract.section_id,
            narrative=f"Grade unfreeze: {total_frozen}",
            created_by=settled_by,
        )

    contract.status = ContractStatus.SETTLED
    contract.updated_at = datetime.now(timezone.utc)

    section_result = await db.execute(
        select(CourseSection).where(CourseSection.id == contract.section_id)
    )
    section = section_result.scalar_one_or_none()
    if section:
        section.status = "completed"

    await db.flush()
    return contract


async def cancel_contract(
    db: AsyncSession,
    contract_id: uuid.UUID,
    cancelled_by: uuid.UUID,
    reason: Optional[str] = None,
    force: bool = False,
) -> SectionContract:
    result = await db.execute(
        select(SectionContract).where(SectionContract.id == contract_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"Contract {contract_id} not found")
    if contract.status == ContractStatus.SETTLED:
        raise ValueError("Cannot cancel a SETTLED contract")
    if not contract.teacher_id:
        contract.status = ContractStatus.CANCELLED
        contract.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return contract

    wallet = await get_or_create_wallet(db, contract.teacher_id, lock=True)

    agg_result = await db.execute(
        select(
            sa_func.coalesce(sa_func.sum(LedgerEntry.available_delta), 0),
            sa_func.coalesce(sa_func.sum(LedgerEntry.frozen_delta), 0),
        )
        .where(
            LedgerEntry.contract_id == contract_id,
            LedgerEntry.wallet_id == wallet.id,
        )
    )
    row = agg_result.one()
    net_available = Decimal(str(row[0] or 0))
    net_frozen = Decimal(str(row[1] or 0))
    total_to_reverse = abs(net_available) + abs(net_frozen)

    if total_to_reverse > 0:
        wallet_balance = Decimal(str(wallet.balance or 0))
        frozen_balance = Decimal(str(wallet.frozen_balance or 0))
        available_balance = wallet_balance - frozen_balance
        if net_available > 0 and available_balance < net_available and not force:
            shortfall = net_available - available_balance
            raise ValueError(
                f"Cannot cancel: teacher wallet has insufficient available balance. "
                f"Net available to reverse: {net_available}, "
                f"Wallet total balance: {wallet_balance}, "
                f"Frozen balance: {frozen_balance}, "
                f"Available balance: {available_balance}, "
                f"Shortfall: {shortfall}. "
                f"Use force_cancellation=true to proceed and create a receivable."
            )

        await record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id,
            entry_type=LedgerEntryType.REVERSAL,
            total_amount=total_to_reverse,
            available_delta=-net_available,
            frozen_delta=-net_frozen,
            reference_type=None,
            reference_id=None,
            narrative=reason or f"Cancellation reversal for contract {contract_id}",
            created_by=cancelled_by,
            force=force,
        )

    contract.status = ContractStatus.CANCELLED
    contract.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return contract


async def deactivate_contract(
    db: AsyncSession,
    contract: SectionContract,
    reason: str,
    deactivated_by: uuid.UUID,
) -> SectionContract:
    if contract.status != ContractStatus.ACTIVE:
        raise ValueError(
            f"Only ACTIVE contracts can be deactivated, current: {contract.status.value}"
        )
    if not contract.teacher_id:
        raise ValueError("Cannot deactivate a contract without a teacher")

    wallet = await get_or_create_wallet(db, contract.teacher_id)

    agg_result = await db.execute(
        select(
            sa_func.coalesce(sa_func.sum(LedgerEntry.available_delta), 0),
            sa_func.coalesce(sa_func.sum(LedgerEntry.frozen_delta), 0),
        )
        .where(
            LedgerEntry.contract_id == contract.id,
            LedgerEntry.wallet_id == wallet.id,
            LedgerEntry.type == LedgerEntryType.ACTIVATION_CREDIT,
        )
    )
    row = agg_result.one()
    net_available = Decimal(str(row[0] or 0))
    net_frozen = Decimal(str(row[1] or 0))
    total_to_reverse = abs(net_available) + abs(net_frozen)

    if total_to_reverse > 0:
        wallet_balance = Decimal(str(wallet.balance or 0))
        frozen_balance = Decimal(str(wallet.frozen_balance or 0))
        available_balance = wallet_balance - frozen_balance
        if net_available > 0 and available_balance < net_available:
            raise ValueError(
                "Cannot deactivate: teacher has withdrawn funds or has insufficient available balance. "
                f"Net available to reverse: {net_available}, "
                f"Wallet total balance: {wallet_balance}, "
                f"Frozen balance: {frozen_balance}, "
                f"Available balance: {available_balance}. "
                "Activation credit cannot be recovered from wallet."
            )

        await record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id,
            entry_type=LedgerEntryType.DEACTIVATION_REVERSAL,
            total_amount=total_to_reverse,
            available_delta=-net_available,
            frozen_delta=-net_frozen,
            reference_type=None,
            reference_id=None,
            narrative=f"Deactivation reversal: {reason}",
            created_by=deactivated_by,
        )

    contract.status = ContractStatus.ASSIGNED
    contract.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return contract
