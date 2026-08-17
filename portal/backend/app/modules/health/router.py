import logging

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import async_session_maker

from app.services.cache import cache, stats

logger = logging.getLogger(__name__)

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def health_check():
    """Portal health: db (portal.* reachability), redis, ERP reachability."""
    db_status = "disconnected"
    if settings.DATABASE_URL:
        try:
            async with async_session_maker() as db:
                await db.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception:
            logger.warning("Portal health — database unreachable")

    redis_status = "disconnected"
    if settings.REDIS_URL:
        try:
            import redis.asyncio as redis

            client = redis.from_url(settings.REDIS_URL)
            await client.ping()
            redis_status = "connected"
        except Exception:
            logger.warning("Portal health — redis unreachable")

    erp_status = "unknown"
    if settings.ERP_INTERNAL_URL and settings.ERP_SERVICE_KEY:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{settings.ERP_INTERNAL_URL}/api/v1/health",
                    headers={"X-Service-Key": settings.ERP_SERVICE_KEY},
                )
                erp_status = "ok" if resp.status_code == 200 else "degraded"
        except Exception:
            erp_status = "unreachable"

    status = "ok"
    if (settings.DATABASE_URL and db_status != "connected") or (
        settings.REDIS_URL and redis_status != "connected"
    ):
        status = "degraded"

    return {
        "status": status,
        "service": "portal-backend",
        "database": db_status,
        "redis": redis_status,
        "erp": erp_status,
    }


@health_router.get("/health/cache")
async def cache_health():
    """Read-through cache stats — used by the Phase 2 gate (90%+ hit rate)."""
    return {
        "hits": stats.hits,
        "misses": stats.misses,
        "hit_rate": stats.hit_rate(),
        "ttl_seconds": settings.CACHE_TTL_SECONDS,
    }


@health_router.post("/health/cache/reset")
async def cache_health_reset():
    """Reset process-local counters (smoke tests measure a clean window)."""
    stats.reset()
    return {"reset": True}
