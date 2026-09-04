"""Smoke-test the image gateway (Phase 2, layer 2) with a mocked httpx client.

Covers the two paths that matter for graceful degradation:
  * success: a b64_json payload is decoded into raw PNG bytes;
  * failure: an HTTP error raises GatewayError (the worker treats it as
    "no image" and falls back to the sticker/emoji layer).
Also locks the size guardrail: only 256x256 / 512x512 are allowed, and the
per-call timeout is strict so a stalled provider cannot hang a job.
"""
import asyncio
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services import llm_gateway
from app.services.llm_gateway import GatewayError, generate_image

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32  # not a real decode target; we only pass bytes through


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _patch(payload=None, status=200, error=None, capture=None):
    """Swap httpx.AsyncClient for a stubbed client that yields a fake response
    (or raises ``error``). Pass a list as ``capture`` to record the POST bodies.
    Restore with ``llm_gateway.httpx.AsyncClient = ret``."""

    class _Patched:
        def __init__(self, *a, **kw):
            self.timeout = kw.get("timeout")

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, headers=None, json=None):
            if capture is not None:
                capture.append((url, headers, json))
            if error is not None:
                raise error
            return _FakeResponse(status, payload)

    original = llm_gateway.httpx.AsyncClient
    llm_gateway.httpx.AsyncClient = _Patched
    return original


def _run(coro):
    return asyncio.run(coro)


async def test_success_b64():
    settings.LITELLM_URL = "http://litellm:4000/v1"
    settings.LITELLM_MASTER_KEY = "sk-test"
    b64 = base64.b64encode(PNG_BYTES).decode("ascii")
    orig = _patch(payload={"data": [{"b64_json": b64}]}, status=200)
    try:
        raw = await generate_image("a cute sticker of a rocket", model="google/gemini-2.5-flash-image-preview", api_key="k")
    finally:
        llm_gateway.httpx.AsyncClient = orig
    assert raw == PNG_BYTES


async def test_failure_http_error_raises_gateway_error():
    settings.LITELLM_URL = "http://litellm:4000/v1"
    settings.LITELLM_MASTER_KEY = "sk-test"
    orig = _patch(payload={"error": {"message": "blocked"}}, status=400)
    try:
        try:
            await generate_image("bad", model="m", api_key="k")
            raise AssertionError("expected GatewayError")
        except GatewayError as e:
            assert "400" in str(e)
    finally:
        llm_gateway.httpx.AsyncClient = orig


async def test_transport_error_raises_gateway_error():
    import httpx

    settings.LITELLM_URL = "http://litellm:4000/v1"
    settings.LITELLM_MASTER_KEY = "sk-test"
    orig = _patch(error=httpx.ConnectError("boom"))
    try:
        try:
            await generate_image("x", model="m", api_key="k")
            raise AssertionError("expected GatewayError")
        except GatewayError:
            pass
    finally:
        llm_gateway.httpx.AsyncClient = orig


def test_size_is_restricted_and_endpoint_and_timeout_are_locked():
    settings.LITELLM_URL = "http://litellm:4000/v1"
    settings.LITELLM_MASTER_KEY = "sk-test"
    captured = []
    gated = []

    class _Patched:
        def __init__(self, *a, **kw):
            gated.append(kw.get("timeout"))

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, headers=None, json=None):
            captured.append((url, json["size"]))
            return _FakeResponse(200, {"data": [{"b64_json": base64.b64encode(PNG_BYTES).decode("ascii")}]})

    orig = llm_gateway.httpx.AsyncClient
    try:
        llm_gateway.httpx.AsyncClient = _Patched
        _run(generate_image("s", model="m", api_key="k", size="256x256"))
        _run(generate_image("s", model="m", api_key="k", size="512x512"))
        _run(generate_image("s", model="m", api_key="k", size="1024x1024"))  # not in the allowed pair
    finally:
        llm_gateway.httpx.AsyncClient = orig

    # Endpoint is the OpenAI-compatible images route on the LiteLLM proxy.
    urls = [u for u, _ in captured]
    assert all(u.endswith("/images/generations") for u in urls), urls
    # Valid sizes pass through verbatim.
    assert captured[0][1] == "256x256"
    assert captured[1][1] == "512x512"
    # An unsupported size falls back to the safe default.
    assert captured[2][1] == "512x512"
    # Strict per-call timeout (locked-down guardrail).
    assert all(t == llm_gateway._IMAGE_TIMEOUT_SECONDS for t in gated)
    assert llm_gateway._IMAGE_TIMEOUT_SECONDS <= 8.0


def test_timeout_constant_is_strict():
    # Locked down guardrail: image calls must not hang worker jobs.
    assert llm_gateway._IMAGE_TIMEOUT_SECONDS <= 8.0


if __name__ == "__main__":
    _run(test_success_b64())
    _run(test_failure_http_error_raises_gateway_error())
    _run(test_transport_error_raises_gateway_error())
    test_size_is_restricted_and_endpoint_and_timeout_are_locked()
    test_timeout_constant_is_strict()
    print("image gateway smoke test PASSED")