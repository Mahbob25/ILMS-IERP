"""Unit tests for the realtime event stream (envelope + per-user event bus).

These cover the two pieces the SSE endpoint relies on and that are easy to get
subtly wrong: the wire format (one multiplexable envelope per frame) and the
subscriber lifecycle (heartbeats while idle, and a guaranteed connection
teardown — a leaked pub/sub connection per reconnect is the failure mode that
would only show up much later, as Redis refusing connections).
"""

import json
import uuid

import pytest

from app.modules.events import bus as bus_module
from app.modules.events.bus import (
    HEARTBEAT,
    NoopEventBus,
    RedisEventBus,
    channel_for_user,
    get_event_bus,
)
from app.modules.events.envelope import (
    EVENT_READY,
    format_heartbeat,
    format_retry,
    format_sse,
    make_event,
)


class TestEnvelope:
    def test_make_event_has_stable_envelope_shape(self):
        event = make_event("notification.created", {"id": "abc"})

        assert set(event) == {"id", "type", "ts", "data"}
        assert event["type"] == "notification.created"
        assert event["data"] == {"id": "abc"}
        uuid.UUID(event["id"])  # parses — usable as an SSE id

    def test_make_event_defaults_data_to_empty_dict(self):
        assert make_event("ready")["data"] == {}

    def test_format_sse_sets_id_event_and_data(self):
        event = make_event(EVENT_READY, {"unread_count": 7})
        frame = format_sse(event)

        assert frame.startswith(f"id: {event['id']}\n")
        assert "\nevent: ready\n" in frame
        assert frame.endswith("\n\n")

        payload = json.loads(frame.split("data: ", 1)[1].strip())
        assert payload["data"]["unread_count"] == 7

    def test_format_sse_is_single_line_data(self):
        """SSE data must not contain raw newlines, or the frame would break."""
        frame = format_sse(make_event("t", {"a": 1, "b": 2}))
        data_line = frame.split("data: ", 1)[1].rstrip("\n")

        assert "\n" not in data_line

    def test_heartbeat_is_a_comment_frame(self):
        assert format_heartbeat() == ": heartbeat\n\n"

    def test_retry_frame(self):
        assert format_retry(1000) == "retry: 1000\n\n"


class TestChannelNaming:
    def test_channel_is_per_user(self):
        assert channel_for_user("u1") == "events:user:u1"
        assert channel_for_user("u1") != channel_for_user("u2")


class FakePubSub:
    def __init__(self, messages):
        self._messages = list(messages)
        self.subscribed = None
        self.unsubscribed = None
        self.closed = False

    async def subscribe(self, channel):
        self.subscribed = channel

    async def get_message(self, ignore_subscribe_messages=False, timeout=0.0):
        return self._messages.pop(0) if self._messages else None

    async def unsubscribe(self, channel):
        self.unsubscribed = channel

    async def aclose(self):
        self.closed = True


class FakeRedis:
    def __init__(self, pubsub):
        self._pubsub = pubsub
        self.published = []

    def pubsub(self):
        return self._pubsub

    async def publish(self, channel, payload):
        self.published.append((channel, payload))


@pytest.fixture
def fake_redis(monkeypatch):
    def _install(messages):
        pubsub = FakePubSub(messages)
        client = FakeRedis(pubsub)
        monkeypatch.setattr(bus_module, "_redis_client", client)
        return pubsub, client

    return _install


class TestRedisEventBus:
    async def test_parses_a_valid_event(self, fake_redis):
        _, _ = fake_redis([
            {"type": "message", "data": json.dumps({"id": "e1", "type": "notification.created"})},
        ])
        gen = RedisEventBus().subscribe("events:user:u1", timeout=0.01)

        assert await gen.__anext__() == {"id": "e1", "type": "notification.created"}
        await gen.aclose()

    async def test_yields_heartbeat_when_idle(self, fake_redis):
        fake_redis([])
        gen = RedisEventBus().subscribe("events:user:u1", timeout=0.01)

        assert await gen.__anext__() is HEARTBEAT
        await gen.aclose()

    async def test_malformed_payload_does_not_kill_the_stream(self, fake_redis):
        fake_redis([
            {"type": "message", "data": "not-json"},
            {"type": "message", "data": json.dumps({"id": "e2"})},
        ])
        gen = RedisEventBus().subscribe("events:user:u1", timeout=0.01)

        # The bad frame is discarded and the very next read yields the good one.
        assert await gen.__anext__() == {"id": "e2"}
        await gen.aclose()

    async def test_close_releases_the_connection(self, fake_redis):
        """Closing is what stops a leaked connection per reconnect."""
        pubsub, _ = fake_redis([])
        gen = RedisEventBus().subscribe("events:user:u1", timeout=0.01)
        await gen.__anext__()

        await gen.aclose()

        assert pubsub.subscribed == "events:user:u1"
        assert pubsub.unsubscribed == "events:user:u1"
        assert pubsub.closed is True

    async def test_publish_targets_channel_with_json_payload(self, fake_redis):
        _, client = fake_redis([])

        await RedisEventBus().publish("events:user:u1", {"id": "e2", "type": "notification.updated"})

        channel, payload = client.published[0]
        assert channel == "events:user:u1"
        assert json.loads(payload)["id"] == "e2"


class TestNoopEventBus:
    async def test_keeps_yielding_heartbeats_so_the_stream_stays_open(self):
        gen = NoopEventBus().subscribe("events:user:u1", timeout=0.001)

        assert await gen.__anext__() is HEARTBEAT
        assert await gen.__anext__() is HEARTBEAT

        await gen.aclose()

    async def test_publish_is_a_silent_noop(self):
        await NoopEventBus().publish("events:user:u1", {"id": "e1"})


class TestFactory:
    def test_noop_without_redis(self, monkeypatch):
        monkeypatch.setattr(bus_module.settings, "REDIS_URL", "")
        assert isinstance(get_event_bus(), NoopEventBus)

    def test_redis_bus_with_redis(self, monkeypatch):
        monkeypatch.setattr(bus_module.settings, "REDIS_URL", "redis://localhost:6379/0")
        assert isinstance(get_event_bus(), RedisEventBus)
