"""Daily notification checks — called from the FastAPI lifespan.

Scans for conditions that warrant notifications and fires them via emitters.
Each check is idempotent by construction (dedupe key per date/section) so
running multiple times per day never creates duplicate rows.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_today
from app.modules.academic.models import (
    CourseSection,
    DailyJobsLog,
)
from app.modules.lms.models import DailyClosure
from app.modules.notifications.emitters import (
    emit_unclosed_day,
    emit_section_low_occupancy,
    emit_section_overdue,
)

logger = logging.getLogger(__name__)


async def run_daily_notification_checks(db: AsyncSession) -> None:
    """Check daily conditions and fire notifications.

    Wrapped in try/except in main.py lifespan so DB unavailability
    never blocks server startup.
    """
    today = get_today()

    # Idempotency gate — skip if already ran today
    result = await db.execute(
        select(DailyJobsLog).where(
            DailyJobsLog.job_name == "notification_daily_check",
            DailyJobsLog.last_run_date == today,
        )
    )
    if result.scalar_one_or_none():
        logger.info("Notification daily checks already ran for %s, skipping", today)
        return

    await _check_unclosed_day(db, today)
    await _check_section_low_occupancy(db)
    await _check_section_overdue(db)

    db.add(DailyJobsLog(job_name="notification_daily_check", last_run_date=today))
    await db.commit()


async def _check_unclosed_day(db: AsyncSession, today: date) -> None:
    """Notify if yesterday has no DailyClosure row with status 'closed'."""
    yesterday = today - timedelta(days=1)

    result = await db.execute(
        select(DailyClosure).where(
            DailyClosure.date == yesterday,
            DailyClosure.status == "closed",
        )
    )
    if result.scalar_one_or_none() is None:
        await emit_unclosed_day(db, day=yesterday)


async def _check_section_low_occupancy(db: AsyncSession) -> None:
    """Notify on pending sections with enrolled_count < capacity, older than 14 days."""
    today = get_today()
    staleness_cutoff = today - timedelta(days=14)

    result = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "pending",
            CourseSection.enrolled_count < CourseSection.capacity,
            CourseSection.created_at < staleness_cutoff,
            CourseSection.deleted_at.is_(None),
        )
    )
    for section in result.scalars().all():
        await emit_section_low_occupancy(db, section_id=section.id)


async def _check_section_overdue(db: AsyncSession) -> None:
    """Notify on active sections past their end_date."""
    today = get_today()
    result = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date < today,
            CourseSection.deleted_at.is_(None),
        )
    )
    for section in result.scalars().all():
        await emit_section_overdue(db, section_id=section.id)
