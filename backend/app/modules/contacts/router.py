import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.rate_limit import limiter
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.contacts.schemas import ContactCreate, ContactCreateResponse, ContactAdminResponse, ContactStatusUpdate
from app.modules.contacts import service as contact_service

contacts_router = APIRouter(tags=["contacts"])


@contacts_router.post("/public/contacts", response_model=ContactCreateResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_public_contact(request: Request, body: ContactCreate, db: AsyncSession = Depends(get_db)):
    if len(body.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name too short")
    digits = "".join(c for c in body.phone if c.isdigit())
    if len(digits) < 7:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    row = await contact_service.create_contact(db, name=body.name, phone=body.phone, message=body.message, locale=body.locale)
    return ContactCreateResponse(id=row.id, status=row.status)


@contacts_router.get("/contacts", response_model=dict)
async def list_contacts_admin(status: Optional[str] = Query(None, pattern="^(pending|contacted|archived)$"), search: Optional[str] = Query(None), page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100), current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    result = await contact_service.list_contacts(db, status=status, search=search, page=page, per_page=per_page)
    items = [ContactAdminResponse(id=r.id, name=r.name, phone=r.phone, message=r.message, locale=r.locale, status=r.status, created_at=r.created_at, contacted_at=r.contacted_at, contacted_by=r.contacted_by, notes=r.notes).model_dump(mode="json") for r in result["items"]]
    return {"items": items, "total": result["total"], "page": result["page"], "per_page": result["per_page"]}


@contacts_router.patch("/contacts/{contact_id}", response_model=ContactAdminResponse)
@limiter.limit("30/minute")
async def patch_contact_status(request: Request, contact_id: uuid.UUID, body: ContactStatusUpdate, current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    row = await contact_service.update_status(db, contact_id, status=body.status, actor_id=current_user.id, notes=body.notes)
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    return ContactAdminResponse(id=row.id, name=row.name, phone=row.phone, message=row.message, locale=row.locale, status=row.status, created_at=row.created_at, contacted_at=row.contacted_at, contacted_by=row.contacted_by, notes=row.notes)
