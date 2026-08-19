import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.identity import service as identity_service
from app.modules.content.schemas import LandingContentResponse, LandingContentUpdate, AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.modules.content import service as content_service

content_router = APIRouter(tags=["content"])


@content_router.get("/public/landing")
async def get_public_landing(locale: str = Query("ar", pattern="^(ar|en)$"), db: AsyncSession = Depends(get_db), response: Response = None):
    row = await content_service.get_landing(db)
    if not row or not row.value:
        return {}
    val = row.value
    if locale in val and isinstance(val[locale], dict):
        val = val[locale]
    # Legacy key from the pre-unified-login CMS — never expose it. The login
    # button is unified ("Login" / "تسجيل الدخول") via the frontend defaults.
    if isinstance(val, dict) and "staffLogin" in val:
        val = {k: v for k, v in val.items() if k != "staffLogin"}
    return val


@content_router.get("/public/announcements")
async def get_public_announcements(db: AsyncSession = Depends(get_db)):
    rows = await content_service.list_announcements(db, active_only=True)
    return [{"id": r.id, "text_ar": r.text_ar, "text_en": r.text_en, "sort_order": r.sort_order} for r in rows]


@content_router.get("/content/landing", response_model=LandingContentResponse)
async def get_landing_admin(current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    row = await content_service.get_landing(db)
    if not row:
        return LandingContentResponse(key="landing", value={}, updated_at=None)
    return LandingContentResponse(key=row.key, value=row.value, updated_at=row.updated_at)


@content_router.put("/content/landing", response_model=LandingContentResponse)
async def put_landing_admin(body: LandingContentUpdate, request: Request, current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    row = await content_service.upsert_landing(db, body.value, current_user.id)
    await identity_service.create_audit_log(db=db, user_id=current_user.id, action="LANDING_UPDATED", payload={"key": "landing"}, ip_address=request.client.host if request.client else None)
    return LandingContentResponse(key=row.key, value=row.value, updated_at=row.updated_at)


@content_router.get("/announcements", response_model=list[AnnouncementResponse])
async def list_announcements_admin(current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    rows = await content_service.list_announcements(db, active_only=False)
    return [AnnouncementResponse(id=r.id, text_ar=r.text_ar, text_en=r.text_en, is_active=r.is_active, sort_order=r.sort_order, created_at=r.created_at, updated_at=r.updated_at) for r in rows]


@content_router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement_admin(body: AnnouncementCreate, current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    row = await content_service.create_announcement(db, text_ar=body.text_ar, text_en=body.text_en, is_active=body.is_active, sort_order=body.sort_order)
    return AnnouncementResponse(id=row.id, text_ar=row.text_ar, text_en=row.text_en, is_active=row.is_active, sort_order=row.sort_order, created_at=row.created_at, updated_at=row.updated_at)


@content_router.patch("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def patch_announcement_admin(announcement_id: uuid.UUID, body: AnnouncementUpdate, current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    row = await content_service.update_announcement(db, announcement_id, text_ar=body.text_ar, text_en=body.text_en, is_active=body.is_active, sort_order=body.sort_order)
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return AnnouncementResponse(id=row.id, text_ar=row.text_ar, text_en=row.text_en, is_active=row.is_active, sort_order=row.sort_order, created_at=row.created_at, updated_at=row.updated_at)


@content_router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement_admin(announcement_id: uuid.UUID, current_user: User = Depends(RoleChecker(["superadmin", "marketing_manager"])), db: AsyncSession = Depends(get_db)):
    ok = await content_service.delete_announcement(db, announcement_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Announcement not found")
