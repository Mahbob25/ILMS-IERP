"""AI Management service — runtime LLM configuration for LessonForge.

The config is stored once in the ERP DB (``system_settings['ai_config']``,
JSONB, key ``ai_config``) and published to Redis as ``ai:config`` (NO TTL) so
the ai-worker can pick it up per job without a restart. When Redis is empty
the worker falls back to the internal service-key endpoint that reads the same
DB row here.
"""
import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.ai_management.schemas import (
    AI_CONFIG_KEY,
    API_KEY_MASK,
    DEFAULT_AI_CONFIG,
)
from app.modules.settings.models import SystemSetting

logger = logging.getLogger(__name__)

# LiteLLM lives on the internal docker network (docker-compose.portal.yml).
LITELLM_URL = "http://litellm:4000/v1/chat/completions"
LITELLM_MASTER_KEY = "sk-litellm-local"
LITELLM_TIMEOUT_SECONDS = 15.0

# Redis key the ai-worker reads (mirrored in apps/ai-service config).
REDIS_AI_CONFIG_KEY = "ai:config"


async def get_config(db: AsyncSession) -> Dict[str, Any]:
    """Return the stored ai_config merged over defaults, api_key masked.

    Never returns the real key — the mask means "a key is stored".
    """
    raw = await _read_config_row(db)
    config = dict(DEFAULT_AI_CONFIG)
    if raw is not None:
        for k, v in raw.items():
            if v is not None:
                config[k] = v
    if config.get("api_key"):
        config["api_key"] = API_KEY_MASK
    else:
        config["api_key"] = ""
    return config


async def get_internal_config(db: AsyncSession) -> Dict[str, Any]:
    """Unmasked config for the internal worker fallback (X-Service-Key)."""
    raw = await _read_config_row(db)
    config = dict(DEFAULT_AI_CONFIG)
    if raw is not None:
        for k, v in raw.items():
            if v is not None:
                config[k] = v
    return config


async def save_config(
    db: AsyncSession, payload: Dict[str, Any], actor_id: uuid.UUID
) -> Dict[str, Any]:
    """Upsert the ai_config row with key-retention guardrails + audit + publish.

    Guardrails: when the incoming api_key is empty/None/the mask, the existing
    stored key is retained — never overwritten with "" or the mask.
    """
    existing = await _read_config_row(db) or {}

    incoming_key = str(payload.get("api_key") or "").strip()
    if not incoming_key or incoming_key == API_KEY_MASK:
        incoming_key = existing.get("api_key", "")

    stored = {
        "provider": str(payload.get("provider") or DEFAULT_AI_CONFIG["provider"]),
        "model": str(payload.get("model") or DEFAULT_AI_CONFIG["model"]),
        "api_key": incoming_key,
        "max_output_tokens": int(
            payload.get("max_output_tokens") or DEFAULT_AI_CONFIG["max_output_tokens"]
        ),
        "temperature": float(payload.get("temperature") if payload.get("temperature") is not None else DEFAULT_AI_CONFIG["temperature"]),
        "image_provider": str(payload.get("image_provider") or DEFAULT_AI_CONFIG["image_provider"]),
        "image_model": str(payload.get("image_model") or DEFAULT_AI_CONFIG["image_model"]),
    }

    row = await db.get(SystemSetting, AI_CONFIG_KEY)
    if row:
        row.value = stored
        row.updated_by = actor_id
    else:
        db.add(SystemSetting(key=AI_CONFIG_KEY, value=stored, updated_by=actor_id))
    await db.flush()

    # Audit is written by the router (it has the actor + client IP).
    await publish_config(stored)

    # Return the masked view — never the raw key.
    resp = dict(stored)
    resp["api_key"] = API_KEY_MASK if resp.get("api_key") else ""
    return resp


async def publish_config(config: Dict[str, Any]) -> None:
    """SET ai:config in Redis with NO TTL so it persists until next save.

    A persistent key avoids the worker losing config when no admin saves for a
    long stretch. Republished on every save so it is always current.
    """
    if not settings.REDIS_URL:
        logger.warning(
            "REDIS_URL not set — skipping Redis publish of ai:config "
            "(ai-worker will fall back to the internal ERP endpoint)"
        )
        return
    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        # Plain SET without ex= — persistent key.
        await client.set(REDIS_AI_CONFIG_KEY, json.dumps(config))
        await client.aclose()
    except Exception:
        logger.exception("publish_config: failed to SET ai:config in Redis")


async def test_config(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """Live-test a candidate config by calling LiteLLM with a tiny request.

    Returns ``{"ok": True, "latency_ms": ...}`` or ``{"ok": False, "error"}``.
    """
    api_key = str(candidate.get("api_key") or "").strip()
    if not api_key or api_key == API_KEY_MASK:
        return {"ok": False, "error": "API key is required to test the connection"}

    provider = str(candidate.get("provider") or "").strip()
    model = str(candidate.get("model") or "").strip()
    if not provider or not model:
        return {"ok": False, "error": "Provider and model are required"}

    body = {
        "model": f"{provider}/{model}",
        "api_key": api_key,
        "messages": [{"role": "user", "content": 'Reply with {"ok": true}'}],
        "max_tokens": 16,
        "temperature": 0.0,
    }

    try:
        import httpx

        start = time.monotonic()
        async with httpx.AsyncClient(timeout=LITELLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                LITELLM_URL,
                headers={"Authorization": f"Bearer {LITELLM_MASTER_KEY}"},
                json=body,
            )
        latency_ms = int((time.monotonic() - start) * 1000)
        if resp.status_code >= 400:
            detail = _error_detail(resp)
            return {"ok": False, "error": detail, "latency_ms": latency_ms}
        return {"ok": True, "latency_ms": latency_ms}
    except Exception as e:
        return {"ok": False, "error": f"Could not reach LiteLLM gateway: {e}"}


async def _read_config_row(db: AsyncSession) -> Optional[Dict[str, Any]]:
    row = await db.get(SystemSetting, AI_CONFIG_KEY)
    if row is None:
        return None
    value = row.value or {}
    return value if isinstance(value, dict) else None


def _error_detail(resp) -> str:
    """Best-effort extraction of the provider/LiteLLM error message."""
    try:
        data = resp.json()
    except Exception:
        return f"HTTP {resp.status_code}"
    if isinstance(data, dict):
        if isinstance(data.get("message"), str):
            return data["message"]
        if isinstance(data.get("detail"), str):
            return data["detail"]
        error = data.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(error, str):
            return error
    return f"HTTP {resp.status_code}"
