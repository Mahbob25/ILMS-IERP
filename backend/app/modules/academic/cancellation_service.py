from dataclasses import dataclass
from decimal import Decimal
import uuid
from datetime import timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import joinedload
from app.core.timezone import utcnow
from app.modules.academic.models import (
    CourseSection, SectionCancellation, PendingRefund, Refund,
    Enrollment,
)
from app.modules.lms.models import Payment, LedgerEntry
from app.modules.lms.ledger_service import cancel_contract as ledger_cancel_contract, get_or_create_wallet


@dataclass
class CancellationPrecondition:
    can_cancel: bool
    warnings: list[str]
    has_attendance_records: bool
    has_final_grades: bool
    has_certificates: bool


@dataclass
class ImpactPreview:
    section_id: uuid.UUID
    course_name: str
    teacher_name: str
    teacher_wallet_reversal_amount: Decimal
    teacher_wallet_balance: Decimal
    teacher_wallet_frozen_balance: Decimal
    teacher_wallet_available_balance: Decimal
    shortfall: Decimal
    enrolled_count: int
    payments_collected: Decimal
    has_attendance_records: bool
    has_final_grades: bool
    has_certificates: bool


async def can_cancel_section(section: CourseSection) -> CancellationPrecondition:
    warnings = []

    if section.status in ("completed", "cancelled"):
        return CancellationPrecondition(
            can_cancel=False,
            warnings=["Section is already completed or cancelled"],
            has_attendance_records=False,
            has_final_grades=False,
            has_certificates=False,
        )

    has_attendance_records = bool(section.attendance_sessions)
    has_final_grades = bool(section.final_grades)
    has_certificates = bool(section.certificates)

    if has_attendance_records:
        warnings.append("Section has attendance records")
    if has_final_grades:
        warnings.append("Section has final grades (grades will be kept as educational records)")
    if has_certificates:
        warnings.append("Section has certificates issued (cancellation blocked)")

    return CancellationPrecondition(
        can_cancel=(not has_certificates),
        warnings=warnings,
        has_attendance_records=has_attendance_records,
        has_final_grades=has_final_grades,
        has_certificates=has_certificates,
    )


async def preview_cancellation_impact(
    db: AsyncSession, section_id: uuid.UUID
) -> ImpactPreview:
    result = await db.execute(
        select(CourseSection)
        .options(
            joinedload(CourseSection.course),
            joinedload(CourseSection.teacher_employee),
            joinedload(CourseSection.contract),
            joinedload(CourseSection.enrollments).joinedload(Enrollment.student),
            joinedload(CourseSection.attendance_sessions),
            joinedload(CourseSection.final_grades),
            joinedload(CourseSection.certificates),
        )
        .where(CourseSection.id == section_id)
    )
    section = result.unique().scalar_one_or_none()
    if not section:
        raise ValueError("Section not found")

    course_name = section.course.name if section.course else ""
    teacher_name = section.teacher_employee.full_name if section.teacher_employee else ""

    teacher_wallet_reversal_amount = Decimal("0")
    teacher_wallet_balance = Decimal("0")
    shortfall = Decimal("0")
    if section.contract and section.contract.teacher_id:
        agg_result = await db.execute(
            select(
                func.coalesce(func.sum(LedgerEntry.available_delta), 0),
                func.coalesce(func.sum(LedgerEntry.frozen_delta), 0),
            )
            .where(LedgerEntry.contract_id == section.contract.id)
        )
        row = agg_result.one()
        net_available = Decimal(str(row[0] or 0))
        net_frozen = Decimal(str(row[1] or 0))
        if net_available > 0 or net_frozen > 0:
            teacher_wallet_reversal_amount = abs(net_available) + abs(net_frozen)

        wallet = await get_or_create_wallet(db, section.contract.teacher_id)
        teacher_wallet_balance = Decimal(str(wallet.balance or 0))
        teacher_wallet_frozen_balance = Decimal(str(wallet.frozen_balance or 0))
        teacher_wallet_available_balance = teacher_wallet_balance - teacher_wallet_frozen_balance
        if teacher_wallet_reversal_amount > teacher_wallet_available_balance:
            shortfall = teacher_wallet_reversal_amount - teacher_wallet_available_balance

    enrolled_count = len(section.enrollments)

    payments_collected = Decimal("0")
    if enrolled_count > 0:
        enrollment_ids = [e.id for e in section.enrollments]
        payments_result = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.enrollment_id.in_(enrollment_ids))
        )
        payments_collected = Decimal(str(payments_result.scalar() or 0))

    return ImpactPreview(
        section_id=section.id,
        course_name=course_name,
        teacher_name=teacher_name,
        teacher_wallet_reversal_amount=teacher_wallet_reversal_amount,
        teacher_wallet_balance=teacher_wallet_balance,
        teacher_wallet_frozen_balance=teacher_wallet_frozen_balance,
        teacher_wallet_available_balance=teacher_wallet_available_balance,
        shortfall=shortfall,
        enrolled_count=enrolled_count,
        payments_collected=payments_collected,
        has_attendance_records=bool(section.attendance_sessions),
        has_final_grades=bool(section.final_grades),
        has_certificates=bool(section.certificates),
    )


async def cancel_section(
    db: AsyncSession,
    section_id: uuid.UUID,
    cancelled_by: uuid.UUID,
    reason: str,
    refund_policy: str,
    force_cancellation: bool = False,
) -> SectionCancellation:
    result = await db.execute(
        select(CourseSection)
        .options(
            joinedload(CourseSection.course),
            joinedload(CourseSection.teacher_employee),
            joinedload(CourseSection.contract),
            joinedload(CourseSection.enrollments).joinedload(Enrollment.student),
            joinedload(CourseSection.attendance_sessions),
            joinedload(CourseSection.final_grades),
            joinedload(CourseSection.certificates),
        )
        .where(CourseSection.id == section_id)
    )
    section = result.unique().scalar_one_or_none()
    if not section:
        raise ValueError("Section not found")

    precondition = await can_cancel_section(section)
    if not precondition.can_cancel:
        if precondition.has_certificates:
            raise ValueError("Cancellation blocked: certificates have been issued for this section. Manager must handle certificates manually first.")
        raise ValueError("Cannot cancel section: " + "; ".join(precondition.warnings))

    enrolled_count = len(section.enrollments)
    teacher_wallet_reversal_amount = Decimal("0")
    total_payments_collected = Decimal("0")
    total_refund_authorized = Decimal("0")

    if section.contract and section.contract.teacher_id:
        agg_result = await db.execute(
            select(
                func.coalesce(func.sum(LedgerEntry.available_delta), 0),
                func.coalesce(func.sum(LedgerEntry.frozen_delta), 0),
            )
            .where(LedgerEntry.contract_id == section.contract.id)
        )
        row = agg_result.one()
        net_available = Decimal(str(row[0] or 0))
        net_frozen = Decimal(str(row[1] or 0))
        if net_available > 0 or net_frozen > 0:
            teacher_wallet_reversal_amount = abs(net_available) + abs(net_frozen)

        await ledger_cancel_contract(
            db,
            contract_id=section.contract.id,
            cancelled_by=cancelled_by,
            reason=f"Section cancellation: {reason}",
            force=force_cancellation,
        )

    if enrolled_count > 0:
        enrollment_ids = [e.id for e in section.enrollments]
        payments_result = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.enrollment_id.in_(enrollment_ids))
        )
        total_payments_collected = Decimal(str(payments_result.scalar() or 0))

    if refund_policy == "authorize_refunds":
        for enrollment in section.enrollments:
            enrollment_payments = await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0))
                .where(Payment.enrollment_id == enrollment.id)
            )
            paid_amount = Decimal(str(enrollment_payments.scalar() or 0))
            if paid_amount > 0:
                total_refund_authorized += paid_amount

    section.status = "cancelled"
    section.cancelled_at = utcnow()
    section.cancelled_by = cancelled_by
    section.cancellation_reason = reason

    cancellation = SectionCancellation(
        section_id=section.id,
        cancelled_by=cancelled_by,
        cancelled_at=utcnow(),
        reason=reason,
        refund_policy=refund_policy,
        teacher_wallet_reversal_amount=float(teacher_wallet_reversal_amount),
        total_payments_collected=float(total_payments_collected),
        total_refund_authorized=0,
        enrolled_student_count=enrolled_count,
        has_attendance_records=precondition.has_attendance_records,
        has_final_grades=precondition.has_final_grades,
        has_certificates=precondition.has_certificates,
    )
    db.add(cancellation)
    await db.flush()

    if refund_policy == "authorize_refunds":
        for enrollment in section.enrollments:
            enrollment_payments = await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0))
                .where(Payment.enrollment_id == enrollment.id)
            )
            paid_amount = Decimal(str(enrollment_payments.scalar() or 0))
            if paid_amount > 0:
                pending_refund = PendingRefund(
                    enrollment_id=enrollment.id,
                    section_cancellation_id=cancellation.id,
                    amount=float(paid_amount),
                    status="UNCLAIMED",
                )
                db.add(pending_refund)

        cancellation.total_refund_authorized = float(total_refund_authorized)

    await db.flush()
    return cancellation


async def get_student_pending_refunds(
    db: AsyncSession, student_id: uuid.UUID
) -> list[PendingRefund]:
    result = await db.execute(
        select(PendingRefund)
        .options(
            joinedload(PendingRefund.enrollment),
            joinedload(PendingRefund.section_cancellation),
        )
        .where(
            PendingRefund.status == "UNCLAIMED",
            PendingRefund.enrollment.has(Enrollment.student_id == student_id),
        )
    )
    return result.scalars().all()


async def expire_stale_pending_refunds(db: AsyncSession, days: int = 180):
    cutoff = utcnow() - timedelta(days=days)
    await db.execute(
        update(PendingRefund)
        .where(
            PendingRefund.status == "UNCLAIMED",
            PendingRefund.created_at < cutoff,
        )
        .values(status="FORFEITED")
    )
    await db.commit()


async def get_cancellation_detail(
    db: AsyncSession, section_id: uuid.UUID
) -> Optional[SectionCancellation]:
    result = await db.execute(
        select(SectionCancellation)
        .options(
            joinedload(SectionCancellation.cancelled_by_user),
            joinedload(SectionCancellation.section),
            joinedload(SectionCancellation.pending_refunds),
        )
        .where(SectionCancellation.section_id == section_id)
        .order_by(SectionCancellation.cancelled_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
