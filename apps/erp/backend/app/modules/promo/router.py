import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.rate_limit import limiter
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.identity import service as identity_service
from app.modules.promo import schemas as promo_schemas
from app.modules.promo import service as promo_service
from app.modules.promo.models import PromoRender

logger = logging.getLogger(__name__)

promo_router = APIRouter(prefix="/promo", tags=["promo"])

Writer = RoleChecker(["superadmin", "marketing_manager"])


async def _render_progress_percent(render_id: uuid.UUID) -> int | None:
    """Best-effort progress read (worker-maintained Redis key, 1h TTL)."""
    try:
        from app.core.config import settings
        if not settings.REDIS_URL:
            return None
        import redis.asyncio as redis
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            raw = await client.get(f"promo:progress:{render_id}")
        finally:
            await client.aclose()
        return int(raw) if raw is not None else None
    except Exception:
        return None


def _retry_after_seconds(reset_at_iso: str) -> int:
    try:
        reset = datetime.fromisoformat(reset_at_iso)
        delta = (reset - datetime.now(timezone.utc)).total_seconds()
        return max(1, int(delta))
    except Exception:
        return 2592000  # ~30d fallback


def _project_to_response(row) -> dict:
    return {
        "id": row.id, "type": row.type, "locale": row.locale, "tone": row.tone,
        "payload": row.payload, "status": row.status,
        "created_at": row.created_at, "updated_at": row.updated_at,
    }


@promo_router.post("/projects", response_model=promo_schemas.ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: promo_schemas.ProjectCreate,
    request: Request,
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    row = await promo_service.create_project(
        db, type_=body.type, locale=body.locale, tone=body.tone,
        payload=body.payload.model_dump(), actor_id=current_user.id,
    )
    try:
        await identity_service.create_audit_log(
            db=db, user_id=current_user.id, action="PROMO_PROJECT_CREATED",
            payload={"project_id": str(row.id)},
            ip_address=request.client.host if request.client else None,
        )
    except Exception:
        logger.warning("PROMO_PROJECT_CREATED audit failed", exc_info=True)
    return _project_to_response(row)


@promo_router.put("/projects/{project_id}", response_model=promo_schemas.ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: promo_schemas.ProjectUpdate,
    request: Request,
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    row = await promo_service.get_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        row = await promo_service.update_draft(
            db, row, locale=body.locale, tone=body.tone,
            payload=body.payload.model_dump() if body.payload else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    try:
        await identity_service.create_audit_log(
            db=db, user_id=current_user.id, action="PROMO_PROJECT_UPDATED",
            payload={"project_id": str(row.id)},
            ip_address=request.client.host if request.client else None,
        )
    except Exception:
        logger.warning("PROMO_PROJECT_UPDATED audit failed", exc_info=True)
    return _project_to_response(row)


@promo_router.get("/projects")
async def list_projects(
    mine: int = Query(1),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    result = await promo_service.list_projects(db, actor_id=current_user.id, mine=bool(mine), page=page, per_page=per_page)
    return {
        "items": [_project_to_response(r) for r in result["items"]],
        "total": result["total"], "page": result["page"], "per_page": result["per_page"],
    }


@promo_router.get("/projects/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    row = await promo_service.get_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    renders = await promo_service.list_renders_for_project(db, project_id)
    return {
        "project": _project_to_response(row),
        "renders": [promo_service.render_to_response(r) for r in renders],
    }


@promo_router.post("/projects/{project_id}/render", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("10/minute")
async def request_render(
    request: Request,
    project_id: uuid.UUID,
    quality: str = Query("draft", pattern="^(draft|high)$"),
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    row = await promo_service.get_project(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        render = await promo_service.enqueue_render(db, row, quality=quality, actor_id=current_user.id)
    except PermissionError as e:
        reset_at = promo_service.quota_reset_at()
        return JSONResponse(
            status_code=429,
            content={"detail": str(e)},
            headers={"Retry-After": str(_retry_after_seconds(reset_at))},
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    try:
        await identity_service.create_audit_log(
            db=db, user_id=current_user.id, action="PROMO_RENDER_REQUESTED",
            payload={"project_id": str(row.id), "render_id": str(render.id), "quality": quality},
            ip_address=request.client.host if request.client else None,
        )
    except Exception:
        logger.warning("PROMO_RENDER_REQUESTED audit failed", exc_info=True)
    return {"render_id": str(render.id), "status": render.status}


@promo_router.get("/renders/{render_id}", response_model=promo_schemas.RenderResponse)
async def get_render(
    render_id: uuid.UUID,
    current_user: User = Depends(Writer),
    db: AsyncSession = Depends(get_db),
):
    render = await db.get(PromoRender, render_id)
    if not render:
        raise HTTPException(status_code=404, detail="Render not found")
    progress = await _render_progress_percent(render_id)
    data = promo_service.render_to_response(render, progress=progress)
    return data


@promo_router.get("/quota", response_model=promo_schemas.QuotaResponse)
async def get_quota(current_user: User = Depends(Writer)):
    used = await promo_service.quota_used()
    limit = await promo_service.quota_limit()
    return {"used": used, "limit": limit, "reset_at": promo_service.quota_reset_at()}
