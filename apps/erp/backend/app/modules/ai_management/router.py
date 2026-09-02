from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.ai_management.schemas import (
    AiConfig,
    AiConfigResponse,
    AiTestRequest,
    AiTestResponse,
)
from app.modules.ai_management import service as ai_service
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.identity.service import create_audit_log
from app.modules.portal_internal.dependencies import verify_service_key

ai_management_router = APIRouter(prefix="/ai-management", tags=["ai-management"])


@ai_management_router.get("/config", response_model=AiConfigResponse)
async def get_ai_config(
    current_user: User = Depends(RoleChecker(["superadmin"])),
    db: AsyncSession = Depends(get_db),
):
    """Return the masked runtime AI config (never the raw key)."""
    return await ai_service.get_config(db)


@ai_management_router.put("/config", response_model=AiConfigResponse)
async def put_ai_config(
    body: AiConfig,
    request: Request,
    current_user: User = Depends(RoleChecker(["superadmin"])),
    db: AsyncSession = Depends(get_db),
):
    """Save the runtime AI config, publish it to Redis, and audit."""
    payload = body.model_dump(exclude_none=True)
    data = await ai_service.save_config(db, payload, current_user.id)
    await create_audit_log(
        db=db,
        user_id=current_user.id,
        action="AI_CONFIG_UPDATED",
        payload={"provider": data["provider"], "model": data["model"]},
        ip_address=request.client.host if request.client else None,
    )
    return data


@ai_management_router.post("/test", response_model=AiTestResponse)
async def test_ai_config(
    body: AiTestRequest,
    current_user: User = Depends(RoleChecker(["superadmin"])),
):
    """Live-test a candidate config through LiteLLM."""
    return await ai_service.test_config(body.model_dump())


# ── Internal endpoint for the ai-worker Redis fallback ──────────────
# Mirrors the portal_internal service-key pattern: gated by X-Service-Key so
# only containers that share ERP_SERVICE_KEY can read the unmasked config.
internal_ai_router = APIRouter(prefix="/internal/ai", tags=["internal-ai"])


@internal_ai_router.get("/config")
async def internal_ai_config(
    db: AsyncSession = Depends(get_db),
    _actor: str = Depends(verify_service_key),
):
    """Unmasked ai_config for the ai-worker (gated by X-Service-Key)."""
    return await ai_service.get_internal_config(db)
