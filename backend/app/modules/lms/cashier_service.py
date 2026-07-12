import uuid
from datetime import date
from decimal import Decimal
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.core.timezone import get_today
from app.modules.academic.models import (
    PendingRefund, Refund, SectionCancellation, Enrollment, Student, CourseSection, UnenrollmentRecord,
)
from app.modules.lms.closure_service import is_date_closed


async def get_pending_refunds_queue(
    db: AsyncSession,
    status: str = "UNCLAIMED",
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    source: Optional[str] = None,
) -> dict:
    query = (
        select(PendingRefund)
        .options(
            joinedload(PendingRefund.enrollment).joinedload(Enrollment.student),
            joinedload(PendingRefund.section_cancellation)
            .joinedload(SectionCancellation.section)
            .joinedload(CourseSection.course),
            joinedload(PendingRefund.unenrollment_record)
            .joinedload(UnenrollmentRecord.section)
            .joinedload(CourseSection.course),
        )
        .where(PendingRefund.status == status)
    )
    count_query = (
        select(func.count(PendingRefund.id))
        .where(PendingRefund.status == status)
    )

    if source:
        query = query.where(PendingRefund.source == source)
        count_query = count_query.where(PendingRefund.source == source)

    if search:
        pattern = f"%{search}%"
        student_filter = Enrollment.student.has(
            (func.lower(Student.full_name).like(func.lower(pattern)))
            | (func.lower(Student.student_code).like(func.lower(pattern)))
        )
        search_filter = PendingRefund.enrollment.has(student_filter)
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(PendingRefund.created_at.desc()).offset(offset).limit(per_page)
    )
    items = result.scalars().all()

    data = []
    for pr in items:
        student = pr.enrollment.student if pr.enrollment else None
        section = None
        if pr.section_cancellation and pr.section_cancellation.section:
            section = pr.section_cancellation.section
        elif pr.unenrollment_record and pr.unenrollment_record.section:
            section = pr.unenrollment_record.section
        data.append({
            "id": str(pr.id),
            "enrollment_id": str(pr.enrollment_id),
            "section_cancellation_id": str(pr.section_cancellation_id) if pr.section_cancellation_id else None,
            "unenrollment_record_id": str(pr.unenrollment_record_id) if pr.unenrollment_record_id else None,
            "amount": float(pr.amount),
            "status": pr.status,
            "source": pr.source,
            "created_at": pr.created_at.isoformat() if pr.created_at else None,
            "expires_at": pr.expires_at.isoformat() if pr.expires_at else None,
            "student_name": student.full_name if student else None,
            "student_code": student.student_code if student else None,
            "section_name": section.course.name if section and section.course else None,
        })

    return {
        "data": data,
        "meta": {"total": total, "page": page, "per_page": per_page},
    }


async def disburse_pending_refund(
    db: AsyncSession,
    pending_refund_id: uuid.UUID,
    disbursed_by: uuid.UUID,
    notes: Optional[str] = None,
) -> Refund:
    result = await db.execute(
        select(PendingRefund)
        .options(
            joinedload(PendingRefund.enrollment).joinedload(Enrollment.student),
            joinedload(PendingRefund.section_cancellation),
        )
        .where(PendingRefund.id == pending_refund_id)
    )
    pending_refund = result.scalar_one_or_none()
    if not pending_refund:
        raise ValueError("Pending refund not found")

    if pending_refund.status != "UNCLAIMED":
        raise ValueError(
            f"Cannot disburse: pending refund is already {pending_refund.status}"
        )

    today = get_today()
    if await is_date_closed(db, today):
        raise ValueError(
            "Cannot disburse: today is closed. Cashier must unlock the day first."
        )

    receipt_number = await _generate_receipt_number(db, today)

    refund = Refund(
        pending_refund_id=pending_refund.id,
        receipt_number=receipt_number,
        amount=pending_refund.amount,
        disbursed_by=disbursed_by,
        notes=notes,
    )
    db.add(refund)

    pending_refund.status = "CLAIMED"

    await db.flush()
    return refund


async def _generate_receipt_number(db: AsyncSession, today: date) -> str:
    prefix = f"RFD-{today.strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.coalesce(func.max(Refund.receipt_number), ""))
        .where(Refund.receipt_number.like(f"{prefix}%"))
    )
    max_num = result.scalar() or ""
    if max_num:
        seq = int(max_num.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def get_cashier_refund_history(
    db: AsyncSession,
    cashier_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    query = (
        select(Refund)
        .options(
            joinedload(Refund.pending_refund)
            .joinedload(PendingRefund.enrollment)
            .joinedload(Enrollment.student),
            joinedload(Refund.disbursed_by_user),
        )
    )
    count_query = select(func.count(Refund.id))

    if cashier_id:
        query = query.where(Refund.disbursed_by == cashier_id)
        count_query = count_query.where(Refund.disbursed_by == cashier_id)
    if date_from:
        query = query.where(func.date(Refund.disbursed_at) >= date_from)
        count_query = count_query.where(func.date(Refund.disbursed_at) >= date_from)
    if date_to:
        query = query.where(func.date(Refund.disbursed_at) <= date_to)
        count_query = count_query.where(func.date(Refund.disbursed_at) <= date_to)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(Refund.disbursed_at.desc()).offset(offset).limit(per_page)
    )
    items = result.scalars().all()

    data = []
    for rf in items:
        pr = rf.pending_refund
        student = pr.enrollment.student if pr and pr.enrollment else None
        data.append({
            "id": str(rf.id),
            "pending_refund_id": str(rf.pending_refund_id),
            "receipt_number": rf.receipt_number,
            "amount": float(rf.amount),
            "disbursed_at": rf.disbursed_at.isoformat() if rf.disbursed_at else None,
            "disbursed_by": str(rf.disbursed_by) if rf.disbursed_by else None,
            "notes": rf.notes,
            "student_name": student.full_name if student else None,
            "student_code": student.student_code if student else None,
        })

    return {
        "data": data,
        "meta": {"total": total, "page": page, "per_page": per_page},
    }
