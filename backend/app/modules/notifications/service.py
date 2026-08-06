import uuid
import math
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select, update, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.timezone import utcnow
from app.modules.notifications.models import Notification

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type_: str,
    title_key: str,
    body_key: Optional[str] = None,
    params: Optional[dict] = None,
    target_href: Optional[str] = None,
    priority: str = "normal",
    dedupe_key: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> Optional[Notification]:
    try:
        stmt = (
            pg_insert(Notification)
            .values(
                user_id=user_id,
                type=type_,
                title_key=title_key,
                body_key=body_key,
                params=params or {},
                target_href=target_href,
                priority=priority,
                dedupe_key=dedupe_key,
                expires_at=expires_at,
            )
            .on_conflict_do_nothing(
                index_elements=["user_id", "type", "dedupe_key"],
            )
        )
        await db.execute(stmt)
        return None
    except Exception:
        logger.warning(
            "Failed to create notification type=%s user=%s dedupe=%s",
            type_,
            user_id,
            dedupe_key,
            exc_info=True,
        )
        return None


async def list_notifications(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    unread_only: bool = False,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    per_page = min(per_page, 100)

    base_query = select(Notification).where(Notification.user_id == user_id)
    count_query = select(func.count(Notification.id)).where(Notification.user_id == user_id)

    if unread_only:
        base_query = base_query.where(Notification.is_read == False)
        count_query = count_query.where(Notification.is_read == False)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        base_query.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(result.scalars().all())

    pages = max(1, math.ceil(total / per_page)) if total > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }


async def get_unread_count(db: AsyncSession, *, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
    )
    return result.scalar() or 0


async def mark_read(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    ids: Optional[list[uuid.UUID]] = None,
) -> int:
    now = utcnow()

    if ids is None or not ids:
        # None or empty list = mark all read
        result = await db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
            .values(is_read=True, read_at=now)
        )
        return result.rowcount

    # Specific ids — only own notifications
    result = await db.execute(
        update(Notification)
        .where(
            Notification.id.in_(ids),
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=now)
    )
    return result.rowcount


ACTIONABLE_TYPES = {"amendment_pending", "unlock_requested"}


async def clear_all(db: AsyncSession, *, user_id: uuid.UUID) -> int:
    result = await db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.type.not_in(ACTIONABLE_TYPES),
        )
    )
    return result.rowcount


async def delete_one(
    db: AsyncSession, *, notification_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    result = await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    return result.rowcount > 0


async def delete_expired(db: AsyncSession, *, retention_days: Optional[int] = None) -> int:
    if retention_days is None:
        retention_days = settings.NOTIFICATION_RETENTION_DAYS

    cutoff = utcnow() - timedelta(days=retention_days)
    total_deleted = 0
    batch_size = 1000

    while True:
        result = await db.execute(
            select(Notification.id).where(Notification.created_at < cutoff).limit(batch_size)
        )
        ids_to_delete = [row[0] for row in result.fetchall()]
        if not ids_to_delete:
            break

        del_result = await db.execute(
            delete(Notification).where(Notification.id.in_(ids_to_delete))
        )
        total_deleted += del_result.rowcount

        if len(ids_to_delete) < batch_size:
            break

    return total_deleted
