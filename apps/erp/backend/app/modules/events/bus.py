"""Per-user event bus backing the realtime SSE stream.

Mirrors the shape of ``app/core/queue.py``: a Protocol, a Redis implementation,
a no-op fallback so the app still boots without Redis, and a factory. Callers
never import redis directly — always through ``get_event_bus()``.

Transport note: this is Redis *pub/sub*, deliberately not the Redis Streams
queue used for AI jobs. Events here are hints, so losing one is harmless. The
retention and consumer-group machinery that makes Streams correct for jobs would
be pure overhead for a message whose only job is to say "go re-fetch".

Cost note: a subscribing client holds **one dedicated connection** for the
lifetime of the stream — pub/sub connections are not pooled or multiplexed.
Redis sets no ``maxclients`` (default 10000), so headroom is ample, but that is
why ``subscribe()`` must be closed on every disconnect: at a short stream
lifetime a leaked connection would accumulate fast.
"""

import asyncio
import json
import logging
from typing import AsyncIterator, Optional, Protocol, runtime_checkable

from app.core.config import settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "events:user:"

# Shared client for publishing. Publishes happen inside request handling, so a
# per-call client (as ``get_queue()`` does) would mean needless connection churn
# on the hot path. The pool also owns the pub/sub connections created below, so
# nothing is orphaned.
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis.asyncio as redis

        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


class _Heartbeat:
    """Sentinel yielded by ``subscribe()`` when the idle timeout elapses.

    Keeping the timing inside the bus means the router never has to cancel an
    in-flight pub/sub read to send a heartbeat — cancelling mid-read is how you
    desync a subscriber connection.
    """

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return "HEARTBEAT"


HEARTBEAT = _Heartbeat()


def channel_for_user(user_id) -> str:
    """Per-user channel — the fan-out boundary for all of one user's tabs."""
    return f"{CHANNEL_PREFIX}{user_id}"


@runtime_checkable
class EventBus(Protocol):
    async def publish(self, channel: str, event: dict) -> None: ...

    def subscribe(
        self, channel: str, timeout: float = 20.0
    ) -> AsyncIterator[Optional[dict]]: ...


class NoopEventBus:
    """Fallback when REDIS_URL is empty — the app boots and streams regardless.

    ``subscribe`` yields heartbeats forever so the stream behaves exactly as it
    does in production (open, healthy, simply quiet) instead of failing in a way
    that only shows up in local development.
    """

    async def publish(self, channel: str, event: dict) -> None:
        logger.info("NoopEventBus.publish(%s, %s)", channel, event.get("type"))

    async def subscribe(
        self, channel: str, timeout: float = 20.0
    ) -> AsyncIterator[Optional[dict]]:
        while True:
            # Sleep for real, both to mirror Redis idle behaviour and to avoid a
            # yield-without-await busy loop.
            await asyncio.sleep(timeout)
            yield HEARTBEAT


class RedisEventBus:
    """Redis pub/sub implementation of ``EventBus``."""

    async def publish(self, channel: str, event: dict) -> None:
        await _get_redis().publish(channel, json.dumps(event, default=str))

    async def subscribe(
        self, channel: str, timeout: float = 20.0
    ) -> AsyncIterator[Optional[dict]]:
        pubsub = _get_redis().pubsub()
        await pubsub.subscribe(channel)
        try:
            while True:
                # Polls with a timeout rather than iterating ``pubsub.listen()``
                # so control returns to the caller on idle, letting it emit a
                # heartbeat and enforce the stream's maximum lifetime.
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=timeout
                )
                if message is None:
                    yield HEARTBEAT
                    continue
                try:
                    yield json.loads(message["data"])
                except (json.JSONDecodeError, TypeError, KeyError):
                    logger.warning("Discarding malformed event on %s", channel)
        finally:
            # Returns the dedicated connection to the pool. Skipping this leaks
            # one connection per stream, which is the failure mode that would
            # only surface as Redis refusing connections much later.
            try:
                await pubsub.unsubscribe(channel)
            finally:
                await pubsub.aclose()


def get_event_bus() -> EventBus:
    """Factory — Redis pub/sub when configured, else NoopEventBus."""
    if settings.REDIS_URL:
        return RedisEventBus()
    return NoopEventBus()
