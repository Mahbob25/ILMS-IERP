import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.content.models import LandingContent, Announcement


async def get_landing(db: AsyncSession) -> Optional[LandingContent]:
    return await db.get(LandingContent, "landing")


async def upsert_landing(db: AsyncSession, value: dict, actor_id: uuid.UUID) -> LandingContent:
    row = await db.get(LandingContent, "landing")
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
        row.updated_by = actor_id
    else:
        row = LandingContent(key="landing", value=value, updated_by=actor_id)
        db.add(row)
    await db.flush()
    return row


async def list_announcements(db: AsyncSession, active_only: bool = False):
    q = select(Announcement).order_by(Announcement.sort_order, Announcement.created_at)
    if active_only:
        q = q.where(Announcement.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


async def create_announcement(db: AsyncSession, text_ar: str, text_en: str, is_active: bool = True, sort_order: int = 0) -> Announcement:
    row = Announcement(text_ar=text_ar.strip(), text_en=text_en.strip(), is_active=is_active, sort_order=sort_order)
    db.add(row)
    await db.flush()
    return row


async def update_announcement(db: AsyncSession, announcement_id: uuid.UUID, **fields) -> Optional[Announcement]:
    row = await db.get(Announcement, announcement_id)
    if not row:
        return None
    for k, v in fields.items():
        if v is not None:
            setattr(row, k, v.strip() if isinstance(v, str) else v)
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


async def delete_announcement(db: AsyncSession, announcement_id: uuid.UUID) -> bool:
    row = await db.get(Announcement, announcement_id)
    if not row:
        return False
    await db.delete(row)
    await db.flush()
    return True
