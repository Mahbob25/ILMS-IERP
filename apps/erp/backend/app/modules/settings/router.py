from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity import service as identity_service
from app.modules.settings.schemas import SystemSettingsResponse, SystemSettingsUpdate
from app.modules.settings import service as settings_service

settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("/system", response_model=SystemSettingsResponse)
async def get_system_settings(
    response: Response,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db),
):
    data = await settings_service.get_system_settings(db)
    # Cache system settings at the browser/proxy level for 10 minutes,
    # while allowing stale serving for up to 1 hour during background revalidation.
    response.headers["Cache-Control"] = "private, max-age=600, stale-while-revalidate=3600"
    return data



@settings_router.put("/system", response_model=SystemSettingsResponse)
async def put_system_settings(
    body: SystemSettingsUpdate,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump(exclude_none=True)
    data = await settings_service.update_system_settings(db, payload, current_user.id)
    await identity_service.create_audit_log(
        db=db, user_id=current_user.id, action="SYSTEM_SETTINGS_UPDATED",
        payload={"keys": list(payload.keys())},
        ip_address=request.client.host if request.client else None,
    )
    return data
