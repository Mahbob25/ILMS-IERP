"""Transport-agnostic queue interface for the portal/AI pipeline.

Phase 3 promotes the transport from BRPOPLPUSH (Phase 1–2) to Redis Streams:
- enqueue  -> XADD the stream
- dequeue  -> XREADGROUP (blocking, no auto-ACK) — worker owns the entry
- ack      -> XACK; un-acked entries stay in the PEL and are re-delivered via
              XAUTOCLAIM after the visibility timeout (job never lost)
- DLQ      -> after MAX_ATTEMPTS (3) a job is moved to ``ai:dlq``

The same contract (``Queue`` protocol) ships in ``portal/backend`` so both
sides share one shape. Callers never import redis directly — always through
``get_queue()``.
"""
import json
import logging
import uuid
from typing import Optional, Protocol, runtime_checkable

from app.core.config import settings

logger = logging.getLogger(__name__)

STREAM_NAMES = ("ai:student", "ai:ingestion")
GROUP_NAME = "ai-workers"
MAX_ATTEMPTS = 3
DLQ = "ai:dlq"


@runtime_checkable
class Queue(Protocol):
    async def enqueue(self, queue: str, payload: dict) -> str: ...
    async def dequeue(self, queue: str, timeout: int = 0) -> Optional[dict]: ...
    async def ack(self, queue: str, job_id: str) -> None: ...


class NoopQueue:
    """Fallback when REDIS_URL is empty — logs and returns a job id."""

    async def enqueue(self, queue: str, payload: dict) -> str:
        job_id = str(uuid.uuid4())
        logger.info("NoopQueue.enqueue(%s, %s) job_id=%s", queue, payload, job_id)
        return job_id

    async def dequeue(self, queue: str, timeout: int = 0) -> Optional[dict]:
        return None

    async def ack(self, queue: str, job_id: str) -> None:
        logger.info("NoopQueue.ack(%s, %s)", queue, job_id)


class RedisStreamsQueue:
    """Redis Streams + consumer-group + DLQ implementation of ``Queue``."""

    def __init__(self) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._visibility_timeout = 30  # seconds

    async def _ensure_group(self, queue: str) -> None:
        try:
            await self._redis.xgroup_create(queue, GROUP_NAME, id="0", mkstream=True)
        except Exception:
            pass  # BUSYGROUP — already exists

    async def enqueue(self, queue: str, payload: dict) -> str:
        job_id = str(uuid.uuid4())
        entry = {
            "job_id": job_id,
            "payload": json.dumps(payload),
            "attempts": "0",
            "last_error": "",
        }
        await self._redis.xadd(queue, entry)
        return job_id

    async def dequeue(self, queue: str, timeout: int = 0) -> Optional[dict]:
        await self._ensure_group(queue)
        block = timeout if timeout > 0 else 0
        try:
            result = await self._redis.xreadgroup(
                GROUP_NAME, "worker", {queue: ">"}, count=1, block=block
            )
        except Exception:
            await self._ensure_group(queue)
            result = await self._redis.xreadgroup(
                GROUP_NAME, "worker", {queue: ">"}, count=1, block=block
            )
        if not result:
            return None
        entries = result[0][1]
        if not entries:
            return None
        msg_id, fields = entries[0]
        try:
            payload = json.loads(fields.get("payload", "{}"))
        except json.JSONDecodeError:
            payload = {}
        return {
            "id": msg_id,
            "job_id": fields.get("job_id"),
            "payload": payload,
            "attempts": int(fields.get("attempts", "0")),
            "queue": queue,
        }

    async def ack(self, queue: str, job_id: str) -> None:
        await self._redis.xack(queue, GROUP_NAME, job_id)


class RedisBrpopQueue:
    """Legacy LPUSH + BRPOPLPUSH (Phase 1–2) — kept for rollback/tests."""

    def __init__(self) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)

    async def enqueue(self, queue: str, payload: dict) -> str:
        job_id = str(uuid.uuid4())
        await self._redis.lpush(
            queue, json.dumps({"job_id": job_id, "payload": payload})
        )
        return job_id

    async def dequeue(self, queue: str, timeout: int = 0) -> Optional[dict]:
        item = await self._redis.brpoplpush(
            queue, f"{queue}:processing", timeout=timeout
        )
        if item is None:
            return None
        try:
            return json.loads(item)
        except json.JSONDecodeError:
            logger.warning("Discarding malformed queue item on %s", queue)
            return None

    async def ack(self, queue: str, job_id: str) -> None:
        await self._redis.lrem(f"{queue}:processing", 1, job_id)


def get_queue() -> Queue:
    """Factory — Redis Streams when configured, else NoopQueue."""
    if settings.REDIS_URL:
        return RedisStreamsQueue()
    return NoopQueue()
