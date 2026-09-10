"""Realtime event stream endpoint (SSE).

One multiplexed stream per browser tab carrying typed events for every realtime
feature. Notifications ride it today; chat adds event types later without
touching the transport.

Auth reuses the standard ``access_token`` cookie via ``get_current_user``, so
there is no second credential to manage. Note that FastAPI tears down
``yield``-based dependencies (here, ``get_db``) *before* the response body is
streamed, so the request's DB session is already closed by the time frames are
produced. The stream body is therefore deliberately DB-free: the initial count
is read in the endpoint and handed to the generator as a plain value.
"""

import asyncio
import logging
import uuid
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.modules.events.bus import HEARTBEAT, channel_for_user, get_event_bus
from app.modules.events.envelope import (
    EVENT_READY,
    format_heartbeat,
    format_retry,
    format_sse,
    make_event,
)
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.notifications import service as notifications_service

logger = logging.getLogger(__name__)

events_router = APIRouter(prefix="/events", tags=["events"])


async def _event_frames(
    user_id: uuid.UUID, initial_unread: Optional[int]
) -> AsyncIterator[str]:
    """Yield SSE frames for one connection until its lifetime budget expires."""
    # Reconnect policy first, so it applies even if the very next read blocks.
    yield format_retry(1000)

    # Replaces the client's mount-time unread fetch and reconciles anything that
    # happened while disconnected — this is what makes a reconnect self-healing
    # rather than merely a fresh connection.
    yield format_sse(make_event(EVENT_READY, {"unread_count": initial_unread}))

    subscription = get_event_bus().subscribe(
        channel_for_user(user_id),
        timeout=settings.EVENT_STREAM_HEARTBEAT_SECONDS,
    )
    deadline = asyncio.get_running_loop().time() + settings.EVENT_STREAM_MAX_SECONDS
    try:
        while asyncio.get_running_loop().time() < deadline:
            try:
                chunk = await subscription.__anext__()
            except StopAsyncIteration:
                break
            if chunk is HEARTBEAT:
                yield format_heartbeat()
            else:
                yield format_sse(chunk)
    finally:
        # Runs the bus generator's own cleanup (unsubscribe + close), returning
        # its dedicated connection. This is also the path taken when the client
        # disconnects early, which is the common case.
        await subscription.aclose()


@events_router.get("/stream")
async def event_stream(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Open the per-user realtime event stream."""
    try:
        unread = await notifications_service.get_unread_count(db, user_id=current_user.id)
        initial_unread: Optional[int] = unread
    except Exception:
        # A failed count must not refuse the stream — the client can still
        # receive live events, and will reconcile on its next fetch.
        logger.warning("Stream ready count failed for user=%s", current_user.id, exc_info=True)
        initial_unread = None

    return StreamingResponse(
        _event_frames(current_user.id, initial_unread),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Belt-and-braces for any intermediary that buffers by default.
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
