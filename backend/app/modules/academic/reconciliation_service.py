import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload
from app.core.timezone import utcnow
from app.modules.academic.models import (
    CourseSection, SectionCancellation, PendingRefund, Refund,
    SectionCompletionOverride, Enrollment,
)

logger = logging.getLogger(__name__)


async def generate_daily_reconciliation_report(
    db: AsyncSession, report_date: date
) -> dict:
    total_active = await _count_active_sections(db)

    sections_ready = await _get_newly_ready_sections(db, report_date)

    cancellations = await _get_cancellations_for_date(db, report_date)

    refunds_disbursed = await _get_refunds_disbursed_on_date(db, report_date)

    overrides = await _get_overrides_for_date(db, report_date)

    overdue_sections = await _get_overdue_sections(db)

    unclaimed_total = await _get_unclaimed_pending_refund_total(db)

    return {
        "report_date": report_date.isoformat(),
        "generated_at": utcnow().isoformat(),
        "summary": {
            "total_active_sections": total_active,
            "newly_ready_for_completion": len(sections_ready),
            "sections_cancelled_today": len(cancellations),
            "cancellations": cancellations,
            "refunds_disbursed_today": refunds_disbursed,
            "overrides_today": overrides,
            "overdue_sections_count": len(overdue_sections),
            "unclaimed_pending_refunds_total": float(unclaimed_total),
        },
    }


async def _count_active_sections(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(CourseSection.id)).where(
            CourseSection.status == "active",
            CourseSection.deleted_at.is_(None),
        )
    )
    return result.scalar() or 0


async def _get_newly_ready_sections(
    db: AsyncSession, report_date: date
) -> list[dict]:
    result = await db.execute(
        select(CourseSection)
        .options(
            joinedload(CourseSection.course),
        )
        .where(
            CourseSection.status == "ready_for_completion",
            CourseSection.end_date <= report_date,
            CourseSection.deleted_at.is_(None),
        )
    )
    sections = result.scalars().all()
    items = []
    for s in sections:
        items.append({
            "section_id": str(s.id),
            "course_name": s.course.name if s.course else "",
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "ungraded_count": (s.flags or {}).get("ungraded_count", 0),
        })
    return items


async def _get_cancellations_for_date(
    db: AsyncSession, report_date: date
) -> list[dict]:
    result = await db.execute(
        select(SectionCancellation)
        .options(
            joinedload(SectionCancellation.section).joinedload(CourseSection.course),
            joinedload(SectionCancellation.cancelled_by_user),
        )
        .where(func.date(SectionCancellation.cancelled_at) == report_date)
        .order_by(SectionCancellation.cancelled_at.desc())
    )
    records = result.scalars().all()
    items = []
    for c in records:
        section = c.section
        course_name = section.course.name if section and section.course else ""
        cancelled_by_name = c.cancelled_by_user.full_name if c.cancelled_by_user else ""
        items.append({
            "section_id": str(c.section_id),
            "course_name": course_name,
            "cancelled_by": cancelled_by_name,
            "reason": c.reason,
            "refund_policy": c.refund_policy,
            "teacher_reversal": float(c.teacher_wallet_reversal_amount),
            "refunds_authorized": float(c.total_refund_authorized),
        })
    return items


async def _get_refunds_disbursed_on_date(
    db: AsyncSession, report_date: date
) -> list[dict]:
    result = await db.execute(
        select(Refund)
        .options(
            joinedload(Refund.pending_refund)
            .joinedload(PendingRefund.enrollment)
            .joinedload(Enrollment.student),
            joinedload(Refund.disbursed_by_user),
        )
        .where(func.date(Refund.disbursed_at) == report_date)
        .order_by(Refund.disbursed_at.desc())
    )
    records = result.scalars().all()
    items = []
    for r in records:
        student_name = ""
        if r.pending_refund and r.pending_refund.enrollment and r.pending_refund.enrollment.student:
            student_name = r.pending_refund.enrollment.student.full_name
        disbursed_by_name = r.disbursed_by_user.full_name if r.disbursed_by_user else ""
        items.append({
            "receipt_number": r.receipt_number,
            "student_name": student_name,
            "amount": float(r.amount),
            "disbursed_by": disbursed_by_name,
        })
    return items


async def _get_overrides_for_date(
    db: AsyncSession, report_date: date
) -> list[dict]:
    result = await db.execute(
        select(SectionCompletionOverride)
        .options(
            joinedload(SectionCompletionOverride.section).joinedload(CourseSection.course),
            joinedload(SectionCompletionOverride.overridden_by_user),
        )
        .where(func.date(SectionCompletionOverride.overridden_at) == report_date)
        .order_by(SectionCompletionOverride.overridden_at.desc())
    )
    records = result.scalars().all()
    items = []
    for o in records:
        section = o.section
        section_label = ""
        if section and section.course:
            section_label = f"{section.course.name} ({str(section.id)[:8]})"
        overridden_by_name = o.overridden_by_user.full_name if o.overridden_by_user else ""
        items.append({
            "section": section_label,
            "overridden_by": overridden_by_name,
            "bypassed_grade_check": o.bypass_grade_check,
            "bypassed_payment_check": o.bypass_payment_check,
            "reason": o.reason,
        })
    return items


async def _get_overdue_sections(db: AsyncSession) -> list[dict]:
    from app.core.timezone import get_today
    today = get_today()
    result = await db.execute(
        select(CourseSection)
        .options(joinedload(CourseSection.course))
        .where(
            CourseSection.status.in_(["active", "ready_for_completion"]),
            CourseSection.end_date < today,
            CourseSection.deleted_at.is_(None),
        )
        .order_by(CourseSection.end_date.asc())
    )
    sections = result.scalars().all()
    items = []
    for s in sections:
        days_overdue = (today - s.end_date).days if s.end_date else 0
        items.append({
            "section_id": str(s.id),
            "course_name": s.course.name if s.course else "",
            "days_overdue": days_overdue,
            "status": s.status,
            "ungraded_count": (s.flags or {}).get("ungraded_count", 0),
            "unpaid_count": (s.flags or {}).get("unpaid_enrollment_count", 0),
        })
    return items


async def _get_unclaimed_pending_refund_total(db: AsyncSession) -> Decimal:
    result = await db.execute(
        select(func.coalesce(func.sum(PendingRefund.amount), 0))
        .where(PendingRefund.status == "UNCLAIMED")
    )
    return Decimal(str(result.scalar() or 0))
