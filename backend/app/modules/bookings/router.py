import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.rate_limit import limiter
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.bookings.schemas import (
    BookingCreate, BookingCreateResponse, BookingAdminResponse, BookingStatusUpdate
)
from app.modules.bookings import service as booking_service

bookings_router = APIRouter(tags=["bookings"])


@bookings_router.post("/public/bookings", response_model=BookingCreateResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_public_booking(
    request: Request,
    body: BookingCreate,
    db: AsyncSession = Depends(get_db),
):
    if len(body.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name too short")
    digits = "".join(c for c in body.phone if c.isdigit())
    if len(digits) < 7:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    b = await booking_service.create_booking(
        db,
        name=body.name,
        phone=body.phone,
        program=body.program,
        message=body.message,
        locale=body.locale,
    )
    return BookingCreateResponse(id=b.id, status=b.status)


@bookings_router.get("/bookings", response_model=dict)
async def list_bookings_admin(
    status: Optional[str] = Query(None, pattern="^(pending|contacted|cancelled)$"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db),
):
    result = await booking_service.list_bookings(db, status=status, search=search, page=page, per_page=per_page)
    items = [
        BookingAdminResponse(
            id=r.id, name=r.name, phone=r.phone, program=r.program, message=r.message,
            locale=r.locale, status=r.status, created_at=r.created_at,
            contacted_at=r.contacted_at, contacted_by=r.contacted_by, notes=r.notes,
        ).model_dump(mode="json")
        for r in result["items"]
    ]
    return {"items": items, "total": result["total"], "page": result["page"], "per_page": result["per_page"]}


@bookings_router.patch("/bookings/{booking_id}", response_model=BookingAdminResponse)
@limiter.limit("30/minute")
async def patch_booking_status(
    request: Request,
    booking_id: uuid.UUID,
    body: BookingStatusUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db),
):
    b = await booking_service.update_status(db, booking_id, status=body.status, actor_id=current_user.id, notes=body.notes)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return BookingAdminResponse(
        id=b.id, name=b.name, phone=b.phone, program=b.program, message=b.message,
        locale=b.locale, status=b.status, created_at=b.created_at,
        contacted_at=b.contacted_at, contacted_by=b.contacted_by, notes=b.notes,
    )
