"""
Role-permission TTL cache for PermissionChecker.

Because role permissions change infrequently (only when an admin explicitly
reassigns them), re-querying PostgreSQL on every authenticated API call is
unnecessary overhead.  This module caches the full set of permission codenames
for a role_id in Redis with a 5-minute TTL.  On a cache miss — or when Redis is
unavailable — it falls back to a direct DB query, so the behaviour is identical
to the uncached implementation; the cache is purely an optimisation.

Cache invalidation: the ``invalidate_role_permissions`` helper is called by the
``set_role_permissions`` route so that permission changes take effect immediately
rather than waiting for the TTL to expire.
"""
import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.modules.identity.models import Permission, RolePermission

logger = logging.getLogger(__name__)

PERM_TTL_SECONDS = 300  # 5 minutes — tune as needed

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not settings.REDIS_URL:
        return None
    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as exc:
        logger.warning("permissions_cache: could not connect to Redis: %s", exc)
    return _redis_client


async def get_cached_role_permissions(db: AsyncSession, role_id: str) -> set[str]:
    """Return all permission codenames for *role_id*, using Redis when available."""
    cache_key = f"role_permissions:{role_id}"

    redis = _get_redis()
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached is not None:
                return set(json.loads(cached))
        except Exception as exc:
            logger.warning("permissions_cache: Redis GET failed for %s: %s", cache_key, exc)

    # Cache miss or Redis unavailable → query the DB.
    result = await db.execute(
        select(Permission.codename)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role_id)
    )
    codenames = [row[0] for row in result.fetchall()]

    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps(codenames), ex=PERM_TTL_SECONDS)
        except Exception as exc:
            logger.warning("permissions_cache: Redis SET failed for %s: %s", cache_key, exc)

    return set(codenames)


async def invalidate_role_permissions(role_id: str) -> None:
    """Purge cached permissions for *role_id* after an admin changes them."""
    redis = _get_redis()
    if redis is None:
        return
    try:
        await redis.delete(f"role_permissions:{role_id}")
        logger.debug("permissions_cache: invalidated key for role %s", role_id)
    except Exception as exc:
        logger.warning("permissions_cache: invalidation failed for role %s: %s", role_id, exc)
