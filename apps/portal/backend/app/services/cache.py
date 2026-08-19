import hashlib
import json
import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Read-through Redis cache for portal reads (grades/attendance/payments/me).
# Key layout: cache:{resource}:{student_id}:{hash(params)} — TTL 60s by default.
# ERP never invalidates portal cache; portal invalidates its own keys after a
# proxied write succeeds (see modules/portal/router.py).
CACHE_PREFIX = "cache"


class CacheStats:
    """Process-local hit/miss counters for the read-through cache.

    Exposed on /api/health/cache so the Phase 2 gate (90%+ hit rate at 60s TTL)
    can be verified in a smoke test. Resettable for repeatable measurement.
    """

    def __init__(self) -> None:
        self.hits = 0
        self.misses = 0

    def bump_hit(self) -> None:
        self.hits += 1

    def bump_miss(self) -> None:
        self.misses += 1

    def reset(self) -> None:
        self.hits = 0
        self.misses = 0

    def hit_rate(self) -> Optional[float]:
        total = self.hits + self.misses
        if total == 0:
            return None
        return round(self.hits / total, 4)


stats = CacheStats()


def cache_key(resource: str, student_id: str, params: Optional[dict[str, Any]] = None) -> str:
    raw = json.dumps(params or {}, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"{CACHE_PREFIX}:{resource}:{student_id}:{digest}"


class CacheClient:
    """Thin async Redis read-through helper. Degrades to miss when Redis is down.

    The portal must stay functional if Redis disappears (R5): a cache error
    falls through to a proxied ERP read, and a proxied write still succeeds.
    """

    def __init__(self) -> None:
        self._redis = None

    async def _client(self):
        if self._redis is not None:
            # Health-check the cached connection (Redis restarts, dropped
            # sockets) — recreate if stale instead of failing silently.
            try:
                await self._redis.ping()
                return self._redis
            except Exception:
                logger.warning("cache connection stale — reconnecting")
                self._redis = None
        if self._redis is None and settings.REDIS_URL:
            import redis.asyncio as redis

            self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def get(self, key: str) -> Optional[dict[str, Any]]:
        client = await self._client()
        if client is None:
            return None
        try:
            raw = await client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.warning("cache get failed for %s — falling through to ERP", key, exc_info=True)
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        client = await self._client()
        if client is None:
            return
        try:
            await client.set(key, json.dumps(value, default=str), ex=ttl or settings.CACHE_TTL_SECONDS)
        except Exception:
            logger.warning("cache set failed for %s", key, exc_info=True)

    async def delete(self, *keys: str) -> None:
        client = await self._client()
        if client is None:
            return
        try:
            if keys:
                await client.delete(*keys)
        except Exception:
            logger.warning("cache delete failed for %s", keys, exc_info=True)

    async def invalidate_resource(self, resource: str, student_id: str) -> None:
        """Best-effort prefix delete — used after a proxied write."""
        client = await self._client()
        if client is None:
            return
        try:
            pattern = f"{CACHE_PREFIX}:{resource}:{student_id}:*"
            async for key in client.scan_iter(match=pattern):
                await client.delete(key)
        except Exception:
            logger.warning("cache invalidate failed for %s", resource, exc_info=True)


cache = CacheClient()
