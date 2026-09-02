"""Pydantic schemas for the AI Management surface.

The stored config lives in ``system_settings['ai_config']`` (JSONB). The
``api_key`` is write-only from the admin's perspective: responses always carry
the mask (``"•••"``) or an empty string — never the real key.
"""
from typing import Optional

from pydantic import BaseModel, Field


# Sentinel used by the UI when an API key is already stored — the frontend
# shows the mask and the backend treats it as "keep the existing key".
API_KEY_MASK = "•••"

AI_CONFIG_KEY = "ai_config"

DEFAULT_AI_CONFIG = {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key": "",
    "max_output_tokens": 32000,
    "temperature": 0.7,
}


class AiConfig(BaseModel):
    """Write model — what the admin may change. Blank/None api_key = keep."""

    provider: str = Field(default="gemini", pattern=r"^[a-z0-9_]+$")
    model: str = Field(default="gemini-2.5-flash", min_length=1)
    api_key: Optional[str] = None
    max_output_tokens: int = Field(default=32000, ge=256, le=128000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class AiConfigResponse(BaseModel):
    """Read model — api_key is always masked, never echoed."""

    provider: str
    model: str
    api_key: str = ""
    max_output_tokens: int = 32000
    temperature: float = 0.7


class AiTestRequest(AiConfig):
    """A candidate config to live-test through LiteLLM (same fields)."""

    pass


class AiTestResponse(BaseModel):
    ok: bool
    error: Optional[str] = None
    latency_ms: Optional[int] = None
