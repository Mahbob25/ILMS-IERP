"""TEMPORARY — Phase 0 ingress probe for the realtime event stream.

Answers the one question the design depends on and that cannot be determined by
reading code: does a long-lived SSE response survive the chain

    browser → Vercel rewrite (next.config.js) → Caddy → uvicorn?

Vercel's proxy is the real unknown. `apps/erp/frontend/vercel.json` contains
only `{"framework": "nextjs"}`, so there is no `maxDuration` or rewrite setting
to raise if the proxy cuts the response short — it either passes through or it
does not, which is exactly why this must be measured rather than assumed.

Test (see the plan's Phase 0):
  1. direct   : curl -N -b cookies.txt http://<host>:8000/api/v1/events/_spike
  2. via Caddy: curl -N -b cookies.txt http://<host>/api/v1/events/_spike
  3. via Vercel: open https://<erp-domain>/api/v1/events/_spike in a browser tab
     and watch DevTools → Network (check the reported Protocol is h2/h3).

What to record: how many SECONDS the stream survived, and whether frames arrived
one per second or were buffered and flushed at the end. That result sets
EVENT_STREAM_MAX_SECONDS and decides whether the rewrite path is good enough.

Authenticated deliberately — an unauthenticated endpoint that holds connections
open for minutes is a needless resource-exhaustion surface, even temporarily.

DELETE THIS FILE and its registration in app/main.py once the gate is answered.
"""

import asyncio
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.modules.events.envelope import format_heartbeat, format_sse, make_event
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User

spike_router = APIRouter(prefix="/events", tags=["events"])

SPIKE_SECONDS = 300


async def _spike_frames(user_id: uuid.UUID) -> AsyncIterator[str]:
    for second in range(SPIKE_SECONDS):
        # The elapsed counter is what makes buffering visible: if the proxy
        # buffers, all of these arrive together at the end instead of one per
        # second.
        yield format_sse(make_event("spike.tick", {"second": second, "user": str(user_id)}))
        await asyncio.sleep(1)
    yield format_heartbeat()
    yield format_sse(make_event("spike.done", {"seconds": SPIKE_SECONDS}))


@spike_router.get("/_spike", include_in_schema=False)
async def sse_spike(current_user: User = Depends(get_current_user)):
    """TEMPORARY Phase 0 probe — see module docstring. Remove after measuring."""
    return StreamingResponse(
        _spike_frames(current_user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
