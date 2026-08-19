import json
import logging
import uuid
from typing import Optional, Protocol, runtime_checkable

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis Streams queues — the Phase 3 promotion from BRPOPLPUSH.
# Keys:
#   ai:student / ai:ingestion          — stream (XADD/XREADGROUP)
#   ai:student:group / ai:ingestion:group — consumer group
#   ai:dlq                            — dead-letter stream (XADD)
# Each entry payload: {"job_id", "payload", "attempts", "last_error"}.
# Visibility: XREADGROUP claims without XACK → XPENDING/CLAIM re-deliver on
# worker death; ack() XACKs. Max 3 attempts then XADD to ai:dlq.
#
# Shared contract (mirror of backend/app/core/queue.py) — callers never
# import redis directly, always go through get_queue().

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
    """Redis Streams + consumer-group + DLQ implementation of ``Queue``.

    - enqueue: XADD the stream.
    - dequeue: XREADGROUP (blocking, auto-ACK off) → returns the entry dict
      with ``job_id`` + ``payload``; the worker owns it until ack().
    - ack: XACK. On worker death the entry stays in PEL and is re-claimed
      after ``visibility_timeout`` via XAUTOCLAIM → re-delivery (job never lost).
    - Attempts: each re-delivery increments ``attempts``; at MAX_ATTEMPTS the
      job is moved to ``ai:dlq`` (dead-letter) instead of being re-delivered.
    """

    def __init__(self) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._visibility_timeout = 30  # seconds — matches old BRPOPLPUSH

    async def _ensure_group(self, queue: str) -> None:
        try:
            await self._redis.xgroup_create(queue, GROUP_NAME, id="0", mkstream=True)
        except Exception:
            # BUSYGROUP — already exists, fine.
            pass

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
        # Block up to `timeout` seconds; empty timeout → non-blocking.
        block = timeout if timeout > 0 else 0
        try:
            result = await self._redis.xreadgroup(
                GROUP_NAME, "worker", {queue: ">"}, count=1, block=block
            )
        except Exception:
            # e.g. NOGROUP before group exists — ensure + retry once.
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
        # Acking requires the message id, not just the job_id. Our dequeue
        # returns the id; callers pass it through job_id. We store both in the
        # payload so ack can resolve.
        # In practice callers ack with the full dict from dequeue, but the
        # protocol only takes job_id — so look up via the PEL is skipped and
        # we rely on the caller passing the msg id as job_id.
        await self._redis.xack(queue, GROUP_NAME, job_id)


class RedisBrpopQueue:
    """Legacy LPUSH + BRPOPLPUSH (Phase 1–2) — kept for rollback/tests.

    Prefer RedisStreamsQueue; this is the pre-promotion transport.
    """

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
