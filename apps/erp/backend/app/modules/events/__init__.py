"""Realtime event stream — one multiplexed SSE connection per browser tab.

Events are *hints* ("something changed, go reconcile over HTTP"), not state.
Postgres remains the source of truth, so a dropped or duplicated event is
harmless: the client re-fetches on the next event, on reconnect, and on its
safety poll. That is why this layer uses Redis pub/sub rather than the durable
``ai:*`` Redis Streams queue in ``app/core/queue.py``.
"""
