from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.notifications import service as notifications_service
from app.modules.notifications.schemas import (
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
    MarkReadRequest,
)

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notifications_router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await notifications_service.list_notifications(
        db,
        user_id=current_user.id,
        unread_only=unread_only,
        page=page,
        per_page=per_page,
    )


@notifications_router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await notifications_service.get_unread_count(db, user_id=current_user.id)
    return {"unread_count": count}


@notifications_router.post("/read")
async def mark_read(
    data: MarkReadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated = await notifications_service.mark_read(
        db,
        user_id=current_user.id,
        ids=data.ids,
    )
    return {"updated": updated}
