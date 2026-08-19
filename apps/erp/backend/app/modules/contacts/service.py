import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.contacts.models import Contact


def _normalize_phone(v: str) -> str:
    return "".join(c for c in v.strip() if c.isdigit() or c == "+")


async def create_contact(db: AsyncSession, *, name: str, phone: str, message: Optional[str], locale: str) -> Contact:
    row = Contact(name=name.strip(), phone=_normalize_phone(phone), message=message.strip() if message else None, locale=locale, status="pending")
    db.add(row)
    await db.flush()
    return row


async def list_contacts(db: AsyncSession, *, status: Optional[str] = None, search: Optional[str] = None, page: int = 1, per_page: int = 20) -> dict:
    q = select(Contact)
    cq = select(func.count(Contact.id))
    if status and status in ("pending", "contacted", "archived"):
        q = q.where(Contact.status == status)
        cq = cq.where(Contact.status == status)
    if search:
        pat = f"%{search.strip()}%"
        clause = or_(Contact.name.ilike(pat), Contact.phone.ilike(pat), Contact.message.ilike(pat))
        q = q.where(clause)
        cq = cq.where(clause)
    total = (await db.execute(cq)).scalar() or 0
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Contact.created_at.desc()).offset(offset).limit(per_page))
    return {"items": result.scalars().all(), "total": total, "page": page, "per_page": per_page}


async def update_status(db: AsyncSession, contact_id: uuid.UUID, *, status: str, actor_id: uuid.UUID, notes: Optional[str] = None) -> Optional[Contact]:
    row = await db.get(Contact, contact_id)
    if not row:
        return None
    row.status = status
    if notes is not None:
        row.notes = notes
    if status == "contacted":
        row.contacted_at = datetime.now(timezone.utc)
        row.contacted_by = actor_id
    await db.flush()
    return row
