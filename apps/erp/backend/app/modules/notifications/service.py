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
from app.modules.events.bus import channel_for_user, get_event_bus
from app.modules.events.envelope import (
    EVENT_NOTIFICATION_CREATED,
    EVENT_NOTIFICATION_UPDATED,
    make_event,
)
from app.modules.notifications.models import Notification

logger = logging.getLogger(__name__)


async def _publish(user_id: uuid.UUID, type_: str, data: dict) -> None:
    """Emit a best-effort realtime hint for one user's stream.

    Deliberately swallows every failure: Postgres is the source of truth and the
    client reconciles over HTTP, so a lost or undeliverable hint costs at most a
    little freshness. A notification must never fail because the event bus is
    unavailable.

    Note this fires before the caller's transaction commits. A later rollback
    can therefore emit a hint for a row that never landed — harmless by design,
    since the client's reconciliation re-reads from the database.
    """
    try:
        await get_event_bus().publish(
            channel_for_user(user_id), make_event(type_, data)
        )
    except Exception:
        logger.warning(
            "Failed to publish %s for user=%s", type_, user_id, exc_info=True
        )


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
            .returning(Notification.id)
        )
        result = await db.execute(stmt)
        row = result.first()
        # ON CONFLICT DO NOTHING makes most calls no-ops (emitters re-run the
        # same dedupe keys constantly), so the returned row is the only reliable
        # signal that something actually changed. Publishing unconditionally
        # would wake every client for nothing.
        if row is not None:
            await _publish(
                user_id,
                EVENT_NOTIFICATION_CREATED,
                {"id": str(row[0]), "notification_type": type_, "priority": priority},
            )
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
    else:
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

    # Tells the user's other open tabs to re-read the badge, so marking read in
    # one tab is reflected in the rest without waiting for a poll.
    if result.rowcount:
        await _publish(
            user_id,
            EVENT_NOTIFICATION_UPDATED,
            {"reason": "mark_read", "updated": result.rowcount},
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
    if result.rowcount:
        await _publish(
            user_id,
            EVENT_NOTIFICATION_UPDATED,
            {"reason": "clear_all", "deleted": result.rowcount},
        )
    return result.rowcount


async def resolve_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    dedupe_key: str,
    old_type: str,
    new_type: str,
) -> int:
    """Change a notification's type so it is no longer actionable after the user acts."""
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
            Notification.type == old_type,
        )
        .values(type=new_type)
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
    if result.rowcount:
        await _publish(
            user_id,
            EVENT_NOTIFICATION_UPDATED,
            {"reason": "delete_one", "id": str(notification_id)},
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
