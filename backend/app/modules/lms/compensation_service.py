from decimal import Decimal
import uuid
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.modules.lms.models import (
    SectionContract, CompensationAmendmentRequest, AmendmentStatus, ContractStatus,
    CompensationModel, LedgerEntryType, TeacherWallet,
)
from app.modules.lms.ledger_service import record as ledger_record


async def create_amendment(
    db: AsyncSession,
    contract_id: uuid.UUID,
    requested_fixed_amount: Optional[Decimal],
    requested_percentage: Optional[Decimal],
    reason: Optional[str],
    requested_by: uuid.UUID,
) -> CompensationAmendmentRequest:
    contract_result = await db.execute(
        select(SectionContract).where(SectionContract.id == contract_id)
    )
    contract = contract_result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"Contract {contract_id} not found")

    if contract.status not in (ContractStatus.ASSIGNED, ContractStatus.ACTIVE):
        raise ValueError(
            f"Amendments only allowed on ASSIGNED or ACTIVE contracts, "
            f"current status: {contract.status.value}"
        )

    if contract.compensation_model == CompensationModel.FIXED:
        if requested_fixed_amount is None:
            raise ValueError("fixed_amount is required for FIXED contracts")
        if requested_percentage is not None:
            raise ValueError("percentage must not be provided for FIXED contracts")
        previous_fixed = Decimal(str(contract.fixed_amount)) if contract.fixed_amount else None
        previous_pct = None
    elif contract.compensation_model == CompensationModel.PERCENTAGE:
        if requested_percentage is None:
            raise ValueError("percentage is required for PERCENTAGE contracts")
        if requested_fixed_amount is not None:
            raise ValueError("fixed_amount must not be provided for PERCENTAGE contracts")
        previous_fixed = None
        previous_pct = Decimal(str(contract.percentage)) if contract.percentage else None
    else:
        raise ValueError(f"Unexpected compensation model: {contract.compensation_model}")

    amendment = CompensationAmendmentRequest(
        contract_id=contract_id,
        previous_fixed_amount=previous_fixed,
        requested_fixed_amount=requested_fixed_amount,
        previous_percentage=previous_pct,
        requested_percentage=requested_percentage,
        reason=reason,
        requested_by=requested_by,
        status=AmendmentStatus.PENDING,
    )
    db.add(amendment)
    await db.flush()
    return amendment


async def approve_amendment(
    db: AsyncSession,
    request_id: uuid.UUID,
    reviewer_id: uuid.UUID,
) -> CompensationAmendmentRequest:
    now = datetime.now(timezone.utc)

    result = await db.execute(
        update(CompensationAmendmentRequest)
        .where(
            CompensationAmendmentRequest.id == request_id,
            CompensationAmendmentRequest.status == AmendmentStatus.PENDING,
        )
        .values(
            status=AmendmentStatus.APPROVED,
            reviewed_by=reviewer_id,
            reviewed_at=now,
        )
        .returning(CompensationAmendmentRequest)
    )
    amendment = result.scalar_one_or_none()
    if not amendment:
        pre_check = await db.execute(
            select(CompensationAmendmentRequest)
            .where(CompensationAmendmentRequest.id == request_id)
        )
        existing = pre_check.scalar_one_or_none()
        if not existing:
            raise ValueError(f"Amendment request {request_id} not found")
        raise ValueError(
            f"Only PENDING amendments can be approved, current: {existing.status.value}"
        )

    contract_result = await db.execute(
        select(SectionContract).where(SectionContract.id == amendment.contract_id)
    )
    contract = contract_result.scalar_one_or_none()
    if not contract:
        raise ValueError(f"Contract {amendment.contract_id} not found")

    holdback = Decimal(str(contract.holdback_rate))

    if contract.compensation_model == CompensationModel.FIXED:
        old_val = Decimal(str(contract.fixed_amount or 0))
        new_val = Decimal(str(amendment.requested_fixed_amount or 0))
        delta = new_val - old_val
        await db.execute(
            update(SectionContract)
            .where(SectionContract.id == contract.id)
            .values(fixed_amount=amendment.requested_fixed_amount)
        )
    elif contract.compensation_model == CompensationModel.PERCENTAGE:
        old_val = Decimal(str(contract.percentage or 0))
        new_val = Decimal(str(amendment.requested_percentage or 0))
        delta = new_val - old_val
        await db.execute(
            update(SectionContract)
            .where(SectionContract.id == contract.id)
            .values(percentage=amendment.requested_percentage)
        )
    else:
        delta = Decimal("0")

    if contract.status == ContractStatus.ACTIVE and delta != 0:
        available_delta = delta * (Decimal("1") - holdback)
        frozen_delta = delta * holdback
        wallet_result = await db.execute(
            select(TeacherWallet)
            .where(TeacherWallet.teacher_id == contract.teacher_id)
            .with_for_update()
        )
        wallet = wallet_result.scalar_one_or_none()
        if not wallet:
            raise ValueError(f"No wallet found for teacher {contract.teacher_id}")
        entry = await ledger_record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id,
            entry_type=LedgerEntryType.AMENDMENT_ADJUSTMENT,
            total_amount=abs(delta),
            available_delta=available_delta,
            frozen_delta=frozen_delta,
            reference_type=None,
            reference_id=None,
            narrative=f"Amendment adjustment: {old_val} → {new_val}",
            created_by=reviewer_id,
        )
        amendment.ledger_entry_id = entry.id

    await db.flush()
    return amendment


async def reject_amendment(
    db: AsyncSession,
    request_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    review_notes: Optional[str] = None,
) -> CompensationAmendmentRequest:
    result = await db.execute(
        select(CompensationAmendmentRequest)
        .where(CompensationAmendmentRequest.id == request_id)
    )
    amendment = result.scalar_one_or_none()
    if not amendment:
        raise ValueError(f"Amendment request {request_id} not found")
    if amendment.status != AmendmentStatus.PENDING:
        raise ValueError(
            f"Only PENDING amendments can be rejected, current: {amendment.status.value}"
        )

    now = datetime.now(timezone.utc)
    amendment.status = AmendmentStatus.REJECTED
    amendment.reviewed_by = reviewer_id
    amendment.reviewed_at = now
    amendment.review_notes = review_notes

    await db.flush()
    return amendment
