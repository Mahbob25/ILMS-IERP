from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.modules.auth.dependencies import get_current_portal_user
from app.modules.auth.schemas import ProfileUpdateRequest
from app.services.cache import cache, cache_key, stats
from app.services.erp_client import ErpClientError, erp_client

portal_router = APIRouter(prefix="/me", tags=["portal-me"])

# Force-refresh: ?refresh=1 bypasses the Redis read-through (frontend button
# "تحديث الآن"). Only 1/s per client to keep ERP probes bounded.
_force_refresh_limiter = limiter.limit("1/second")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _force_refresh(request: Request) -> bool:
    return request.query_params.get("refresh") == "1"


async def _read_cached(
    request: Request,
    response: Response,
    resource: str,
    student_id: str,
    params: Optional[dict[str, Any]],
    fetch,
):
    """Read-through helper: cache hit → 200 with X-Cache: HIT; miss → proxy to
    ERP internal API → store + X-Cache: MISS. Gracefully degrades on Redis down.

    ``?refresh=1`` bypasses the cache entirely (forced miss) — used by the
    frontend force-refresh button so parents can see fresh grades immediately.
    """
    key = cache_key(resource, student_id, params)
    force = _force_refresh(request)
    if force:
        stats.bump_miss()  # counted as a miss: we went to ERP
    else:
        cached = await cache.get(key)
        if cached is not None:
            stats.bump_hit()
            response.headers["X-Cache"] = "HIT"
            response.headers["X-Data-As-Of"] = str(cached.get("_as_of", ""))
            return cached.get("data")
        stats.bump_miss()

    try:
        data = await fetch()
    except ErpClientError as e:
        if e.status_code >= 500:
            raise HTTPException(status_code=502, detail="ERP temporarily unavailable")
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    await cache.set(key, {"data": data, "_as_of": _now_iso()}, ttl=60)
    response.headers["X-Cache"] = "MISS"
    response.headers["X-Data-As-Of"] = _now_iso()
    return data


@portal_router.get("")
@limiter.limit("60/minute")
async def get_me(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """Proxy GET /internal/portal/me → linked students (cached per actor)."""
    key = cache_key("me", str(current_user["id"]), {})
    force = _force_refresh(request)
    if not force:
        cached = await cache.get(key)
        if cached is not None:
            stats.bump_hit()
            response.headers["X-Cache"] = "HIT"
            response.headers["X-Data-As-Of"] = str(cached.get("_as_of", ""))
            return cached.get("data")
        stats.bump_miss()

    try:
        data = await erp_client.get_me(str(current_user["id"]))
    except ErpClientError as e:
        if e.status_code >= 500:
            raise HTTPException(status_code=502, detail="ERP temporarily unavailable")
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    await cache.set(key, {"data": data, "_as_of": _now_iso()}, ttl=60)
    response.headers["X-Cache"] = "MISS"
    response.headers["X-Data-As-Of"] = _now_iso()
    return data


@portal_router.get("/grades")
@limiter.limit("60/minute")
async def get_grades(
    request: Request,
    response: Response,
    student_id: str = Query(...),
    current_user: dict = Depends(get_current_portal_user),
):
    params = {"student_id": student_id}
    return await _read_cached(
        request, response, "grades", student_id, params,
        lambda: erp_client.get_grades(str(current_user["id"]), student_id),
    )


@portal_router.get("/attendance")
@limiter.limit("60/minute")
async def get_attendance(
    request: Request,
    response: Response,
    student_id: str = Query(...),
    section_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_portal_user),
):
    params = {"student_id": student_id, "section_id": section_id}
    return await _read_cached(
        request, response, "attendance", student_id, params,
        lambda: erp_client.get_attendance(
            str(current_user["id"]), student_id, section_id
        ),
    )


@portal_router.get("/payments")
@limiter.limit("60/minute")
async def get_payments(
    request: Request,
    response: Response,
    student_id: str = Query(...),
    current_user: dict = Depends(get_current_portal_user),
):
    params = {"student_id": student_id}
    return await _read_cached(
        request, response, "payments", student_id, params,
        lambda: erp_client.get_payments(str(current_user["id"]), student_id),
    )


@portal_router.get("/sections")
@limiter.limit("60/minute")
async def get_sections(
    request: Request,
    response: Response,
    student_id: str = Query(...),
    current_user: dict = Depends(get_current_portal_user),
):
    params = {"student_id": student_id}
    return await _read_cached(
        request, response, "sections", student_id, params,
        lambda: erp_client.get_sections(str(current_user["id"]), student_id),
    )


async def _update_profile(
    request: Request,
    body: ProfileUpdateRequest,
    current_user: dict,
) -> dict[str, Any]:
    """Write path — validate + proxy POST /internal/portal/profile. ERP does the
    RBAC (actor → student link) + daily_closure guard. Portal invalidates its own
    cache for the affected student on success.
    """
    if not body.phone and not body.locale_pref:
        raise HTTPException(status_code=400, detail="Nothing to update")

    # Requires a student_id — a guardian may hold several; the frontend passes
    # the selected student. Proxy write goes through ERP validation anyway.
    student_id = request.query_params.get("student_id")
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id query param required")

    try:
        result = await erp_client.update_profile(
            str(current_user["id"]),
            student_id,
            phone=body.phone,
            locale_pref=body.locale_pref,
        )
    except ErpClientError as e:
        if e.status_code >= 500:
            raise HTTPException(status_code=502, detail="ERP temporarily unavailable")
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    # Portal invalidates its own cache keys for this student.
    await cache.invalidate_resource("profile", student_id)
    await cache.delete(cache_key("me", str(current_user["id"]), {}))
    return result


@portal_router.post("/profile")
@limiter.limit("10/minute")
async def update_profile(
    request: Request,
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_portal_user),
):
    return await _update_profile(request, body, current_user)


@portal_router.patch("/profile")
@limiter.limit("10/minute")
async def patch_profile(
    request: Request,
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_portal_user),
):
    return await _update_profile(request, body, current_user)
