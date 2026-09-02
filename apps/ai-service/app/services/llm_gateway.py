"""LLM gateway — single path to LiteLLM for every provider.

Config resolution order (per job):
  1) Redis GET ``ai:config`` (memoized ~30s in-process)
  2) Redis miss -> ERP internal endpoint (X-Service-Key) -> repopulate Redis
  3) both unavailable -> env fallback for local dev (GEMINI/OPENAI keys)

The call itself is one OpenAI-compatible POST to the LiteLLM proxy with a
provider-prefixed model (``gemini/gemini-2.5-flash``, ``openai/gpt-4o-mini``,
...) and a per-request ``api_key`` override so the proxy needs no stored keys.
"""
import asyncio
import json
import logging
import time
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_MEMO_TTL = 30  # seconds — how long a loaded config is trusted in-process


class GatewayError(RuntimeError):
    """Raised when the LLM config cannot be resolved or the call fails."""


_memo: Dict[str, Any] = {"at": 0.0, "config": None}


def _reset_memo() -> None:
    """Drop the in-process config cache (used by tests)."""
    _memo["at"] = 0.0
    _memo["config"] = None


async def load_config() -> dict:
    """Return the current runtime AI config {provider, model, api_key, ...}.

    Raises GatewayError only if Redis AND the ERP internal endpoint AND the
    env fallback all fail to produce a usable config.
    """
    # 1) Redis (memoized)
    cached = await _from_redis_cached()
    if cached:
        return cached

    # 2) ERP internal endpoint fallback
    try:
        erp_cfg = await _from_erp_internal()
        if erp_cfg:
            return erp_cfg
    except Exception:
        logger.exception("llm_gateway: ERP internal config fetch failed")

    # 3) Local-dev env fallback (no Redis / no ERP reachable)
    env_cfg = _from_env()
    if env_cfg:
        logger.warning(
            "llm_gateway: falling back to env-based LLM config "
            "(Redis + ERP internal unavailable)"
        )
        return env_cfg

    raise GatewayError(
        "No LLM config available: Redis ai:config empty, ERP internal "
        "endpoint unreachable, and no GEMINI_API_KEY/OPENAI_API_KEY set"
    )


async def chat_json(
    prompt: str,
    *,
    model: str,
    api_key: str,
    max_output_tokens: int,
    temperature: float,
    schema_hint: str = "",
    system: str = "",
) -> str:
    """POST one chat completion to LiteLLM and return the assistant content.

    The proxy master key authenticates to LiteLLM; the per-request ``api_key``
    is the real provider key LiteLLM forwards upstream. ``response_format``
    asks for JSON; providers that cannot honor it ignore/drop the param
    (LiteLLM ``drop_params``), so the caller still validates the payload.
    """
    url = f"{settings.LITELLM_URL.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {settings.LITELLM_MASTER_KEY}"}
    body: Dict[str, Any] = {
        "model": model,
        "api_key": api_key,
        "messages": [
            {
                "role": "system",
                "content": system
                or (
                    "You are LessonForge, an expert teacher-focused learning-resource "
                    "generator. Respond with valid JSON only, matching the schema in "
                    "the request." + (f" Schema: {schema_hint}" if schema_hint else "")
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_output_tokens,
        "response_format": {"type": "json_object"},
    }

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(url, headers=headers, json=body)
    except httpx.HTTPError as e:
        raise GatewayError(f"LLM gateway request failed: {e}") from e
    elapsed_ms = int((time.monotonic() - started) * 1000)

    if resp.status_code >= 400:
        detail = _error_detail(resp)
        raise GatewayError(
            f"LiteLLM returned HTTP {resp.status_code} after {elapsed_ms}ms: {detail}"
        )

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as e:
        raise GatewayError(
            f"Malformed LiteLLM response after {elapsed_ms}ms: {e}"
        ) from e
    return content or "{}"


# ── config sources ──────────────────────────────────────────────────


async def _from_redis_cached() -> Optional[dict]:
    """Redis GET ai:config, memoized in-process for ~30s."""
    now = time.monotonic()
    if _memo["config"] is not None and (now - _memo["at"]) < _MEMO_TTL:
        return dict(_memo["config"])

    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            raw = await client.get(settings.CONFIG_REDIS_KEY)
        finally:
            await client.aclose()
        if raw:
            try:
                cfg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("llm_gateway: malformed ai:config JSON in Redis")
                return None
            _memo["at"] = now
            _memo["config"] = cfg
            return dict(cfg)
    except Exception:
        logger.warning("llm_gateway: Redis GET ai:config failed", exc_info=True)
    return None


async def _from_erp_internal() -> Optional[dict]:
    """GET {ERP_INTERNAL_URL}/api/v1/internal/ai/config with X-Service-Key.

    On success the result is written back to Redis (no TTL) so subsequent jobs
    skip the HTTP hop until the ERP publishes a newer config.
    """
    if not settings.ERP_SERVICE_KEY:
        return None
    url = f"{settings.ERP_INTERNAL_URL.rstrip('/')}/api/v1/internal/ai/config"
    headers = {"X-Service-Key": settings.ERP_SERVICE_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as e:
        logger.warning("llm_gateway: ERP internal config unreachable: %s", e)
        return None
    if resp.status_code != 200:
        logger.warning(
            "llm_gateway: ERP internal config HTTP %s", resp.status_code
        )
        return None
    try:
        cfg = resp.json()
    except ValueError:
        logger.warning("llm_gateway: malformed ERP internal config response")
        return None

    if not isinstance(cfg, dict) or not cfg.get("api_key"):
        return None

    # Repopulate Redis so future jobs skip this HTTP round-trip.
    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            # No TTL — persistent key, matching publish_config on the ERP side.
            await client.set(settings.CONFIG_REDIS_KEY, json.dumps(cfg))
        finally:
            await client.aclose()
    except Exception:
        logger.warning("llm_gateway: failed to repopulate Redis ai:config", exc_info=True)
    return cfg


def _from_env() -> Optional[dict]:
    """Local-dev fallback when neither Redis nor the ERP is available."""
    provider = (settings.LLM_PROVIDER or "gemini").strip().lower()
    if provider == "openai" and settings.OPENAI_API_KEY:
        return {
            "provider": "openai",
            "model": settings.OPENAI_MODEL,
            "api_key": settings.OPENAI_API_KEY,
            "max_output_tokens": 16000,
            "temperature": 0.7,
        }
    if settings.GEMINI_API_KEY:
        return {
            "provider": "gemini",
            "model": settings.GEMINI_MODEL,
            "api_key": settings.GEMINI_API_KEY,
            "max_output_tokens": 32000,
            "temperature": 0.7,
        }
    return None


def _error_detail(resp: httpx.Response) -> str:
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
