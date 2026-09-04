"""Unit tests for the AI Management service — config upsert + masking + publish.

These run against a fake AsyncSession and a faked redis client, so no DB/Redis
is required. Covers the plan's key guardrails:
- save with api_key=None/""/"•••" retains the existing stored key;
- reads mask the key (never echo the real one);
- publish_config writes ai:config with NO TTL (persistent).
"""
import json
import uuid
from types import SimpleNamespace

import pytest

from app.modules.ai_management import service as ai_service
from app.modules.ai_management.schemas import API_KEY_MASK
from app.modules.settings.models import SystemSetting


class FakeRedis:
    """Minimal redis.asyncio stand-in exposing only get/set used by the service."""

    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        # Record whether a TTL was requested — the plan requires NO TTL.
        self.store[key] = value
        self.last_ex = ex

    async def aclose(self):
        pass


class FakeDB:
    """Stands in for AsyncSession: records added rows (SystemSetting, AuditLog)."""

    def __init__(self, existing: dict | None = None):
        self.added = []
        self.audit_entries = []
        self.rows: dict[str, SystemSetting] = {}
        if existing is not None:
            row = SystemSetting(key="ai_config", value=existing)
            self.rows["ai_config"] = row

    async def get(self, model, pk):
        if model is SystemSetting:
            return self.rows.get(pk)
        return None

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        from app.modules.identity.models import AuditLog

        for obj in self.added:
            if isinstance(obj, SystemSetting):
                self.rows[obj.key] = obj
            elif isinstance(obj, AuditLog):
                self.audit_entries.append(obj)


@pytest.fixture(autouse=True)
def _patch_redis(monkeypatch):
    fake = FakeRedis()

    def _from_url(url, decode_responses=True):
        return fake

    monkeypatch.setattr(
        ai_service.settings,
        "REDIS_URL",
        "redis://test:6379/0",
    )
    monkeypatch.setattr(
        "redis.asyncio.from_url",
        _from_url,
        raising=False,
    )
    return fake


def _run(coro):
    import asyncio

    return asyncio.run(coro)


def _valid_payload(**overrides):
    payload = {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "api_key": "REAL-KEY",
        "max_output_tokens": 32000,
        "temperature": 0.7,
        "image_provider": "openai",
        "image_model": "gpt-image-1",
    }
    payload.update(overrides)
    return payload


def test_get_config_masks_key_and_applies_defaults():
    db = FakeDB(existing=_valid_payload(api_key="super-secret"))
    cfg = _run(ai_service.get_config(db))
    assert cfg["api_key"] == API_KEY_MASK
    assert cfg["provider"] == "gemini"
    assert cfg["model"] == "gemini-2.5-flash"


def test_get_config_defaults_when_no_row():
    db = FakeDB()
    cfg = _run(ai_service.get_config(db))
    assert cfg["provider"] == "gemini"
    assert cfg["model"] == "gemini-2.5-flash"
    assert cfg["api_key"] == ""


def test_save_with_blank_key_retains_existing():
    db = FakeDB(existing=_valid_payload(api_key="stored-key"))
    actor = uuid.uuid4()
    for blank in (None, "", API_KEY_MASK):
        payload = _valid_payload(api_key=blank, model="gemini-2.0-flash")
        result = _run(ai_service.save_config(db, payload, actor))
        assert result["api_key"] == API_KEY_MASK  # masked on response
        stored = db.rows["ai_config"].value
        assert stored["api_key"] == "stored-key"
        assert stored["model"] == "gemini-2.0-flash"  # other fields still update


def test_save_with_new_key_replaces_existing():
    db = FakeDB(existing=_valid_payload(api_key="old-key"))
    actor = uuid.uuid4()
    result = _run(ai_service.save_config(db, _valid_payload(api_key="new-key"), actor))
    assert result["api_key"] == API_KEY_MASK
    assert db.rows["ai_config"].value["api_key"] == "new-key"


def test_save_creates_row_when_absent_and_publishes_no_ttl(_patch_redis):
    db = FakeDB()
    actor = uuid.uuid4()
    _run(ai_service.save_config(db, _valid_payload(api_key="brand-new"), actor))
    assert db.rows["ai_config"].value["api_key"] == "brand-new"
    # Published to Redis with no TTL (persistent key).
    assert _patch_redis.store["ai:config"] == json.dumps(db.rows["ai_config"].value)
    assert _patch_redis.last_ex is None


def test_publish_config_skips_when_no_redis_url(monkeypatch, _patch_redis):
    monkeypatch.setattr(ai_service.settings, "REDIS_URL", "")
    # Should not raise when Redis is unconfigured — just log and return.
    _run(ai_service.publish_config(_valid_payload()))
    assert "ai:config" not in _patch_redis.store


def test_internal_config_is_unmasked():
    db = FakeDB(existing=_valid_payload(api_key="internal-secret"))
    cfg = _run(ai_service.get_internal_config(db))
    assert cfg["api_key"] == "internal-secret"


def test_test_config_rejects_missing_or_masked_key():
    for bad in ("", API_KEY_MASK):
        result = _run(ai_service.test_config(_valid_payload(api_key=bad)))
        assert result["ok"] is False
        assert "API key is required" in result["error"]


# ── Phase 2: image generation config fields ─────────────────────────


def test_default_image_fields_are_disabled_when_no_row():
    db = FakeDB()
    cfg = _run(ai_service.get_config(db))
    assert cfg["image_provider"] == ""
    assert cfg["image_model"] == ""


def test_save_persists_image_fields_and_keeps_text_api_key():
    db = FakeDB(existing=_valid_payload(api_key="stored-key"))
    actor = uuid.uuid4()
    result = _run(
        ai_service.save_config(
            db,
            _valid_payload(
                api_key=API_KEY_MASK,
                image_provider="google",
                image_model="gemini-2.5-flash-image-preview",
            ),
            actor,
        )
    )
    stored = db.rows["ai_config"].value
    # Shared text key is retained; image fields update independently.
    assert stored["api_key"] == "stored-key"
    assert stored["image_provider"] == "google"
    assert stored["image_model"] == "gemini-2.5-flash-image-preview"
    # Response masks the key but still surfaces the image fields.
    assert result["api_key"] == API_KEY_MASK
    assert result["image_provider"] == "google"
    assert result["image_model"] == "gemini-2.5-flash-image-preview"


def test_save_without_image_fields_defaults_to_disabled():
    db = FakeDB()
    actor = uuid.uuid4()
    payload = {k: v for k, v in _valid_payload().items() if not k.startswith("image_")}
    _run(ai_service.save_config(db, payload, actor))
    stored = db.rows["ai_config"].value
    assert stored["image_provider"] == ""
    assert stored["image_model"] == ""


def test_get_config_and_internal_config_carry_image_fields():
    db = FakeDB(existing=_valid_payload(api_key="secret"))
    masked = _run(ai_service.get_config(db))
    assert masked["image_provider"] == "openai"
    assert masked["image_model"] == "gpt-image-1"
    raw = _run(ai_service.get_internal_config(db))
    assert raw["image_provider"] == "openai"
    assert raw["image_model"] == "gpt-image-1"
    assert raw["api_key"] == "secret"
