import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.bookings.models import Booking


ALLOWED_PROGRAMS = {"languages", "computing", "ai", "diplomas"}


def _normalize_phone(v: str) -> str:
    s = "".join(c for c in v.strip() if c.isdigit() or c == "+")
    return s


async def create_booking(
    db: AsyncSession,
    *,
    name: str,
    phone: str,
    program: Optional[str],
    message: Optional[str],
    locale: str,
) -> Booking:
    prog = (program or "").strip().lower() or None
    if prog and prog not in ALLOWED_PROGRAMS:
        prog = None
    b = Booking(
        name=name.strip(),
        phone=_normalize_phone(phone),
        program=prog,
        message=(message.strip() if message else None),
        locale=locale,
        status="pending",
    )
    db.add(b)
    await db.flush()
    return b


async def list_bookings(
    db: AsyncSession,
    *,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    q = select(Booking)
    cq = select(func.count(Booking.id))
    if status and status in ("pending", "contacted", "cancelled"):
        q = q.where(Booking.status == status)
        cq = cq.where(Booking.status == status)
    if search:
        pat = f"%{search.strip()}%"
        clause = or_(Booking.name.ilike(pat), Booking.phone.ilike(pat))
        q = q.where(clause)
        cq = cq.where(clause)
    total = (await db.execute(cq)).scalar() or 0
    offset = (page - 1) * per_page
    result = await db.execute(q.order_by(Booking.created_at.desc()).offset(offset).limit(per_page))
    items = result.scalars().all()
    return {"items": items, "total": total, "page": page, "per_page": per_page}


async def update_status(
    db: AsyncSession,
    booking_id: uuid.UUID,
    *,
    status: str,
    actor_id: uuid.UUID,
    notes: Optional[str] = None,
) -> Optional[Booking]:
    b = await db.get(Booking, booking_id)
    if not b:
        return None
    b.status = status
    if notes is not None:
        b.notes = notes
    if status == "contacted":
        b.contacted_at = datetime.now(timezone.utc)
        b.contacted_by = actor_id
    await db.flush()
    return b
