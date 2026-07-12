from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, exists as sa_exists
from sqlalchemy.orm import joinedload

from app.core.timezone import utcnow, get_today
from app.modules.academic.models import (
    Enrollment, CourseSection, UnenrollmentRecord, UnenrollmentOverride,
    PendingRefund, Student,
)
from app.modules.academic.models import Certificate, FinalGrade
from app.modules.lms.models import Payment, LedgerEntry, TeacherWallet
from app.modules.lms.ledger_service import reverse_teacher_shares as ledger_reverse_shares, get_or_create_wallet
from app.modules.lms.models import LedgerEntryType


@dataclass
class UnenrollmentPrecondition:
    can_unenroll: bool
    warnings: list[str]
    has_attendance_records: bool
    has_grades: bool
    has_certificates: bool


@dataclass
class UnenrollmentImpactPreview:
    enrollment_id: uuid.UUID
    student_name: str
    student_code: str
    section_name: str
    course_name: str
    agreed_price: Optional[Decimal]
    admin_discount: Optional[Decimal]
    net_price: Optional[Decimal]
    total_paid: Decimal
    remaining_balance: Optional[Decimal]
    teacher_share_reversal_amount: Decimal
    teacher_wallet_balance: Decimal
    teacher_wallet_available_balance: Decimal
    teacher_name: Optional[str]
    has_attendance_records: bool
    has_grades: bool
    has_certificates: bool
    can_unenroll: bool
    warnings: list[str]


async def can_unenroll_student(
    db: AsyncSession,
    enrollment_id: uuid.UUID,
) -> UnenrollmentPrecondition:
    result = await db.execute(
        select(Enrollment)
        .options(
            joinedload(Enrollment.section),
            joinedload(Enrollment.student),
        )
        .where(Enrollment.id == enrollment_id)
    )
    enrollment = result.scalar_one_or_none()

    warnings = []

    if not enrollment:
        return UnenrollmentPrecondition(
            can_unenroll=False,
            warnings=["Enrollment not found"],
            has_attendance_records=False,
            has_grades=False,
            has_certificates=False,
        )

    if enrollment.deleted_at is not None:
        return UnenrollmentPrecondition(
            can_unenroll=False,
            warnings=["Enrollment is already deleted"],
            has_attendance_records=False,
            has_grades=False,
            has_certificates=False,
        )

    section = enrollment.section
    if not section:
        return UnenrollmentPrecondition(
            can_unenroll=False,
            warnings=["Section not found"],
            has_attendance_records=False,
            has_grades=False,
            has_certificates=False,
        )

    if section.status in ("completed", "cancelled"):
        return UnenrollmentPrecondition(
            can_unenroll=False,
            warnings=[f"Cannot unenroll from a section that is {section.status}"],
            has_attendance_records=False,
            has_grades=False,
            has_certificates=False,
        )

    cert_result = await db.execute(
        select(sa_exists().where(
            Certificate.enrollment_id == enrollment_id,
            Certificate.deleted_at.is_(None),
        ))
    )
    has_certificates = cert_result.scalar() or False

    has_attendance_result = await db.execute(
        select(sa_exists().where(
            FinalGrade.section_id == section.id,
            FinalGrade.student_id == enrollment.student_id,
        ))
    )
    has_grades = has_attendance_result.scalar() or False

    has_attendance_records = bool(section.attendance_sessions)

    if has_attendance_records:
        warnings.append("Student has attendance records in this section")
    if has_grades:
        warnings.append("Student has entered grades. Use force=true to unenroll anyway.")
    if has_certificates:
        warnings.append("Certificate has been issued for this enrollment. Unenrollment blocked.")

    return UnenrollmentPrecondition(
        can_unenroll=(not has_certificates),
        warnings=warnings,
        has_attendance_records=bool(section.attendance_sessions),
        has_grades=has_grades,
        has_certificates=has_certificates,
    )


async def get_enrollment_payments(
    db: AsyncSession,
    enrollment_id: uuid.UUID,
) -> Decimal:
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    return Decimal(str(result.scalar() or 0))


async def calculate_reversal_amount(
    db: AsyncSession,
    enrollment_id: uuid.UUID,
) -> Decimal:
    result = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.available_delta), 0))
        .select_from(LedgerEntry)
        .join(Payment, Payment.id == LedgerEntry.reference_id)
        .where(
            Payment.enrollment_id == enrollment_id,
            LedgerEntry.type == LedgerEntryType.PAYMENT_SHARE,
        )
    )
    amount = Decimal(str(result.scalar() or 0))
    return abs(amount) if amount < 0 else amount


async def preview_unenrollment_impact(
    db: AsyncSession,
    enrollment_id: uuid.UUID,
) -> UnenrollmentImpactPreview:
    result = await db.execute(
        select(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.teacher_employee),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.contract),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.attendance_sessions),
        )
        .where(Enrollment.id == enrollment_id)
    )
    enrollment = result.unique().scalar_one_or_none()
    if not enrollment:
        raise ValueError("Enrollment not found")

    section = enrollment.section
    course_name = section.course.name if section and section.course else ""
    teacher_name = section.teacher_employee.full_name if section and section.teacher_employee else ""

    total_paid = await get_enrollment_payments(db, enrollment_id)
    teacher_share = await calculate_reversal_amount(db, enrollment_id)

    teacher_wallet_balance = Decimal("0")
    teacher_wallet_available_balance = Decimal("0")
    if section and section.contract and section.contract.teacher_id:
        wallet = await get_or_create_wallet(db, section.contract.teacher_id)
        teacher_wallet_balance = Decimal(str(wallet.balance or 0))
        frozen = Decimal(str(wallet.frozen_balance or 0))
        teacher_wallet_available_balance = teacher_wallet_balance - frozen

    effective_price = enrollment.agreed_price or (section.price if section else None)
    agreed_price = Decimal(str(effective_price)) if effective_price is not None else None
    admin_discount = Decimal(str(enrollment.admin_discount)) if enrollment.admin_discount is not None else None

    net_price = None
    remaining_balance = None
    if agreed_price is not None:
        if admin_discount is not None:
            net_price = agreed_price - (agreed_price * admin_discount / Decimal("100"))
        else:
            net_price = agreed_price
        remaining_balance = net_price - total_paid

    precondition = await can_unenroll_student(db, enrollment_id)

    has_attendance_result = await db.execute(
        select(sa_exists().where(
            FinalGrade.section_id == section.id,
            FinalGrade.student_id == enrollment.student_id,
        ))
    )
    has_grades = has_attendance_result.scalar() or False

    return UnenrollmentImpactPreview(
        enrollment_id=enrollment.id,
        student_name=enrollment.student.full_name if enrollment.student else "",
        student_code=enrollment.student.student_code if enrollment.student else "",
        section_name=section.name if section and hasattr(section, "name") else (course_name or str(section.id)[:8]),
        course_name=course_name,
        agreed_price=agreed_price,
        admin_discount=admin_discount,
        net_price=net_price,
        total_paid=total_paid,
        remaining_balance=remaining_balance,
        teacher_share_reversal_amount=teacher_share,
        teacher_wallet_balance=teacher_wallet_balance,
        teacher_wallet_available_balance=teacher_wallet_available_balance,
        teacher_name=teacher_name,
        has_attendance_records=precondition.has_attendance_records,
        has_grades=has_grades,
        has_certificates=precondition.has_certificates,
        can_unenroll=precondition.can_unenroll,
        warnings=precondition.warnings,
    )


async def unenroll_student(
    db: AsyncSession,
    enrollment_id: uuid.UUID,
    unenrolled_by: uuid.UUID,
    reason: str,
    refund_policy: str,
    refund_amount: Optional[Decimal] = None,
    force: bool = False,
    force_reason: Optional[str] = None,
    notes: Optional[str] = None,
) -> UnenrollmentRecord:
    result = await db.execute(
        select(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.teacher_employee),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.contract),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.attendance_sessions),
        )
        .where(Enrollment.id == enrollment_id)
    )
    enrollment = result.unique().scalar_one_or_none()
    if not enrollment:
        raise ValueError("Enrollment not found")

    if enrollment.deleted_at is not None:
        raise ValueError("Enrollment is already deleted")

    section = enrollment.section
    if not section:
        raise ValueError("Section not found")

    if section.status in ("completed", "cancelled"):
        raise ValueError(f"Cannot unenroll from a section that is {section.status}")

    cert_result = await db.execute(
        select(sa_exists().where(
            Certificate.enrollment_id == enrollment_id,
            Certificate.deleted_at.is_(None),
        ))
    )
    has_certificates = cert_result.scalar() or False
    if has_certificates:
        raise ValueError("Unenrollment blocked: certificates have been issued for this enrollment. Manager must handle certificates manually first.")

    has_attendance = bool(section.attendance_sessions)

    grade_result = await db.execute(
        select(sa_exists().where(
            FinalGrade.section_id == section.id,
            FinalGrade.student_id == enrollment.student_id,
        ))
    )
    has_grades = grade_result.scalar() or False
    if has_grades and not force:
        raise ValueError("Student has entered grades. Use force=true to unenroll anyway.")

    total_paid = await get_enrollment_payments(db, enrollment_id)
    teacher_share = await calculate_reversal_amount(db, enrollment_id)

    wallet_balance_before = Decimal("0")
    if section.contract and section.contract.teacher_id:
        wallet = await get_or_create_wallet(db, section.contract.teacher_id)
        wallet_balance_before = Decimal(str(wallet.balance or 0))

    # Reverse teacher wallet shares (no balance check — may go negative)
    if teacher_share > 0 and section.contract and section.contract.teacher_id:
        await ledger_reverse_shares(
            db,
            enrollment_id=enrollment_id,
            amount=teacher_share,
            reversed_by=unenrolled_by,
            contract_id=section.contract.id,
            teacher_id=section.contract.teacher_id,
            student_name=enrollment.student.full_name if enrollment.student else "",
        )

    # Check for closed financial day
    today = get_today()
    if refund_policy == "authorize_refund":
        from app.modules.academic.service import _is_date_closed
        if await _is_date_closed(db, today):
            raise ValueError("Cannot authorize refund: today is a closed financial day. Please contact an administrator.")

    # Create PendingRefund if authorized
    actual_refund_amount = Decimal("0")
    if refund_policy == "authorize_refund":
        if refund_amount is not None:
            if refund_amount <= 0:
                raise ValueError("Refund amount must be positive")
            if refund_amount > total_paid:
                raise ValueError("Refund amount cannot exceed total paid")
            actual_refund_amount = refund_amount
        else:
            actual_refund_amount = total_paid

        if actual_refund_amount > 0:
            pending_refund = PendingRefund(
                enrollment_id=enrollment_id,
                section_cancellation_id=None,
                amount=float(actual_refund_amount),
                status="UNCLAIMED",
                source="unenrollment",
            )
            db.add(pending_refund)
            await db.flush()

    # Soft-delete enrollment
    enrollment.deleted_at = utcnow()
    section.enrolled_count = func.greatest(section.enrolled_count - 1, 0)

    # Create audit record
    record = UnenrollmentRecord(
        enrollment_id=enrollment_id,
        section_id=enrollment.section_id,
        student_id=enrollment.student_id,
        unenrolled_by=unenrolled_by,
        reason=reason,
        refund_policy=refund_policy,
        total_paid=float(total_paid),
        teacher_share_reversed=float(teacher_share),
        refund_authorized_amount=float(actual_refund_amount) if refund_policy == "authorize_refund" else 0,
        has_attendance_records=has_attendance,
        has_grades=has_grades,
        notes=notes,
    )
    db.add(record)
    await db.flush()

    # Create override audit if forced
    if force and has_grades:
        override = UnenrollmentOverride(
            unenrollment_record_id=record.id,
            overridden_by=unenrolled_by,
            override_type="force_unenroll_with_grades",
            reason=force_reason or "No reason provided",
            teacher_wallet_balance_before=float(wallet_balance_before),
            reversal_amount=float(teacher_share),
        )
        db.add(override)

    # Link PendingRefund to unenrollment record if created
    if refund_policy == "authorize_refund" and actual_refund_amount > 0:
        if pending_refund:
            pending_refund.unenrollment_record_id = record.id

    await db.flush()
    return record


async def get_unenrollment_history(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    student_id: Optional[uuid.UUID] = None,
    section_id: Optional[uuid.UUID] = None,
) -> dict:
    query = select(UnenrollmentRecord).options(
        joinedload(UnenrollmentRecord.enrollment),
        joinedload(UnenrollmentRecord.student),
        joinedload(UnenrollmentRecord.section).joinedload(CourseSection.course),
        joinedload(UnenrollmentRecord.unenrolled_by_user),
    )
    count_query = select(func.count(UnenrollmentRecord.id))

    if student_id:
        query = query.where(UnenrollmentRecord.student_id == student_id)
        count_query = count_query.where(UnenrollmentRecord.student_id == student_id)
    if section_id:
        query = query.where(UnenrollmentRecord.section_id == section_id)
        count_query = count_query.where(UnenrollmentRecord.section_id == section_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(UnenrollmentRecord.unenrolled_at.desc())
        .offset(offset).limit(per_page)
    )
    items = result.scalars().all()
    return {"items": items, "total": total}


async def get_unenrollment_detail(
    db: AsyncSession,
    unenrollment_id: uuid.UUID,
) -> Optional[UnenrollmentRecord]:
    result = await db.execute(
        select(UnenrollmentRecord)
        .options(
            joinedload(UnenrollmentRecord.enrollment),
            joinedload(UnenrollmentRecord.student),
            joinedload(UnenrollmentRecord.section).joinedload(CourseSection.course),
            joinedload(UnenrollmentRecord.unenrolled_by_user),
            joinedload(UnenrollmentRecord.overrides),
            joinedload(UnenrollmentRecord.pending_refunds),
        )
        .where(UnenrollmentRecord.id == unenrollment_id)
    )
    return result.scalar_one_or_none()
