"""Redis Streams queue mirror — same contract as ERP/portal backend queues.

The worker consumes ``ai:teacher`` (XREADGROUP ai-workers) and ACKs after the
result has been written to ``ai:result:{job_id}`` (TTL 1h, set by the worker).
"""
import json
import logging
import uuid
from typing import Optional, Protocol, runtime_checkable

from app.core.config import settings

logger = logging.getLogger(__name__)

GROUP_NAME = "ai-workers"


@runtime_checkable
class Queue(Protocol):
    async def enqueue(self, queue: str, payload: dict) -> str: ...
    async def dequeue(self, queue: str, timeout: int = 0) -> Optional[dict]: ...
    async def ack(self, queue: str, job_id: str) -> None: ...


class RedisStreamsQueue:
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

    async def ack(self, queue: str, msg_id: str) -> None:
        # XACK requires the stream entry id returned by dequeue ("id"),
        # NOT the job_id stored inside the entry fields.
        await self._redis.xack(queue, GROUP_NAME, msg_id)

    async def set_result(self, job_id: str, result: dict, ttl: int) -> None:
        await self._redis.set(
            f"ai:result:{job_id}", json.dumps(result), ex=ttl
        )

    async def get_result(self, job_id: str) -> Optional[dict]:
        raw = await self._redis.get(f"ai:result:{job_id}")
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
