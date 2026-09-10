"""Wire format for the realtime event stream.

Every frame carries the same envelope (``id`` / ``type`` / ``ts`` / ``data``)
regardless of which feature produced it, so a new feature adds event *types*
rather than a new transport. ``data`` is a plain dict on purpose: it is exactly
what a WebSocket implementation would send, keeping the payload shape
switching-cost-free if the transport is ever swapped.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# ── Event types ───────────────────────────────────────────────────────────────
# Sent once per (re)connection. Carries the current unread count so a reconnect
# reconciles whatever arrived while the stream was down — this is what makes the
# stream self-healing rather than merely live.
EVENT_READY = "ready"

EVENT_NOTIFICATION_CREATED = "notification.created"
EVENT_NOTIFICATION_UPDATED = "notification.updated"

# Reserved for real-time chat — in a future phase it rides this same stream as
# further ``chat.*`` types, with no transport work. Kept as a comment so the
# namespace is obviously spoken for.
# EVENT_CHAT_MESSAGE = "chat.message"


def make_event(type_: str, data: Optional[Dict[str, Any]] = None) -> dict:
    """Build a transport-agnostic event envelope."""
    return {
        "id": str(uuid.uuid4()),
        "type": type_,
        "ts": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }


def format_sse(event: dict) -> str:
    """Render an envelope as an SSE frame.

    The ``event:`` field is what makes a single connection multiplexable: the
    browser routes each frame to the ``addEventListener(type, ...)`` handler
    registered for that type, so notifications and (later) chat can share one
    connection instead of competing for the per-origin connection budget.
    """
    payload = json.dumps(event, separators=(",", ":"), default=str)
    return f"id: {event['id']}\nevent: {event['type']}\ndata: {payload}\n\n"


def format_heartbeat() -> str:
    """SSE comment frame — keeps intermediaries from closing an idle stream."""
    return ": heartbeat\n\n"


def format_retry(milliseconds: int = 1000) -> str:
    """Tell ``EventSource`` how fast to reconnect after a clean server close.

    We control when the stream ends (see ``EVENT_STREAM_MAX_SECONDS``), so
    setting this explicitly means the reconnect cost is ours to choose rather
    than the browser's ~3s default.
    """
    return f"retry: {milliseconds}\n\n"
