import logging
from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_today

logger = logging.getLogger(__name__)

from app.modules.academic.models import (
    CourseSection,
    DailyJobsLog,
    Enrollment,
    FinalGrade,
    SectionLifecycleConfig,
)
from app.modules.lms.models import Payment


async def run_daily_section_checks(db: AsyncSession) -> None:
    """
    Called from FastAPI lifespan event on every server boot.
    Checks idempotency gate, then processes overdue and upcoming sections.
    Uses get_today() from the timezone module — always returns the institute's
    local date (Asia/Riyadh), regardless of the server OS timezone.
    """
    today = get_today()

    result = await db.execute(
        select(DailyJobsLog).where(
            DailyJobsLog.job_name == "section_daily_check",
            DailyJobsLog.last_run_date == today,
        )
    )
    if result.scalar_one_or_none():
        return

    await _process_overdue_sections(db, today)
    await _process_upcoming_deadlines(db, today)
    await _check_payment_deadlines(db, today)

    db.add(DailyJobsLog(job_name="section_daily_check", last_run_date=today))
    await db.commit()


async def _get_config_value(db: AsyncSession, key: str, default: str) -> str:
    result = await db.execute(
        select(SectionLifecycleConfig).where(SectionLifecycleConfig.key == key)
    )
    config = result.scalar_one_or_none()
    return config.value if config else default


async def _count_ungraded(db: AsyncSession, section_id) -> int:
    result = await db.execute(
        select(func.count()).select_from(Enrollment).outerjoin(
            FinalGrade,
            (FinalGrade.section_id == Enrollment.section_id)
            & (FinalGrade.student_id == Enrollment.student_id),
        ).where(
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
            FinalGrade.id.is_(None),
        )
    )
    return result.scalar() or 0


async def _log_overdue_alert(db: AsyncSession, section: CourseSection, today: date) -> None:
    days_past = (today - section.end_date).days if section.end_date else 0
    if days_past >= 7:
        logger.warning(
            "Section severely overdue",
            extra={
                "section_id": str(section.id),
                "days_past": days_past,
                "ungraded_count": (section.flags or {}).get("ungraded_count", 0),
                "unpaid_count": (section.flags or {}).get("unpaid_enrollment_count", 0),
            }
        )


async def _process_overdue_sections(db: AsyncSession, today: date) -> list[CourseSection]:
    """
    Find active sections where end_date < today (date-based, not time-based).
    Catches up on ALL overdue sections even if server was offline for days.
    For each: check grade completeness.
      - All graded -> status = 'ready_for_completion'
      - Missing grades -> flags.overdue = True, flags.ungraded_count = N
    """
    result = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date < today,
            CourseSection.deleted_at.is_(None),
        )
    )
    sections = list(result.scalars().all())

    for section in sections:
        ungraded = await _count_ungraded(db, section.id)
        if ungraded == 0:
            section.status = "ready_for_completion"
        else:
            section.flags = {
                **(section.flags or {}),
                "overdue": True,
                "ungraded_count": ungraded,
            }
        await _log_overdue_alert(db, section, today)

    return sections


async def _process_upcoming_deadlines(db: AsyncSession, today: date) -> list[CourseSection]:
    """
    Find active sections where end_date is within warning window.
    Set flags.approaching_end = True.
    """
    warning_days_str = await _get_config_value(db, "overdue_warning_days_before", "7")
    warning_days = int(warning_days_str)

    result = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date <= today + timedelta(days=warning_days),
            CourseSection.end_date >= today,
            CourseSection.deleted_at.is_(None),
        )
    )
    sections = list(result.scalars().all())

    for section in sections:
        section.flags = {
            **(section.flags or {}),
            "approaching_end": True,
        }

    return sections


async def _check_payment_deadlines(db: AsyncSession, today: date) -> None:
    """
    For sections within payment_due_before_end_days of end date,
    flag enrollments with outstanding balances.
    """
    payment_days_str = await _get_config_value(db, "payment_due_before_end_days", "14")
    payment_days = int(payment_days_str)

    result = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date <= today + timedelta(days=payment_days),
            CourseSection.end_date >= today,
            CourseSection.deleted_at.is_(None),
        )
    )
    sections = list(result.scalars().all())

    for section in sections:
        enrollments_result = await db.execute(
            select(Enrollment).where(
                Enrollment.section_id == section.id,
                Enrollment.deleted_at.is_(None),
            )
        )
        enrollments = list(enrollments_result.scalars().all())

        unpaid_count = 0
        for enrollment in enrollments:
            payments_result = await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    Payment.enrollment_id == enrollment.id,
                )
            )
            total_paid = payments_result.scalar() or 0
            owed = enrollment.agreed_price or section.price or 0

            if total_paid < owed:
                unpaid_count += 1

        if unpaid_count > 0:
            section.flags = {
                **(section.flags or {}),
                "has_unpaid_enrollments": True,
                "unpaid_enrollment_count": unpaid_count,
            }
