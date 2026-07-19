from unittest.mock import MagicMock, AsyncMock, patch
import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_csrf_rejects_without_token():
    from app.middleware.csrf import CSRFMiddleware

    request = MagicMock()
    request.method = "POST"
    request.headers = {}
    request.cookies = {"access_token": "some-token"}

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = CSRFMiddleware(lambda r: None)

    with pytest.raises(HTTPException) as exc:
        await middleware.dispatch(request, call_next)
    assert exc.value.status_code == 403
    assert "CSRF" in exc.value.detail


@pytest.mark.asyncio
async def test_csrf_rejects_mismatched_tokens():
    from app.middleware.csrf import CSRFMiddleware

    request = MagicMock()
    request.method = "POST"
    request.headers = {"X-CSRF-Token": "token-from-header"}
    request.cookies = {"csrf_token": "token-from-cookie-different", "access_token": "some-token"}

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = CSRFMiddleware(lambda r: None)

    with pytest.raises(HTTPException) as exc:
        await middleware.dispatch(request, call_next)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_csrf_passes_with_valid_token():
    from app.middleware.csrf import CSRFMiddleware

    request = MagicMock()
    request.method = "POST"
    request.headers = {"X-CSRF-Token": "valid-token"}
    request.cookies = {"csrf_token": "valid-token"}

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = CSRFMiddleware(lambda r: None)
    response = await middleware.dispatch(request, call_next)
    assert response is not None
    assert response.status_code == 200
    call_next.assert_called_once()


@pytest.mark.asyncio
async def test_csrf_skips_safe_methods():
    from app.middleware.csrf import CSRFMiddleware

    for method in ["GET", "HEAD", "OPTIONS"]:
        request = MagicMock()
        request.method = method

        call_next = AsyncMock()
        call_next.return_value = MagicMock(status_code=200)

        middleware = CSRFMiddleware(lambda r: None)
        response = await middleware.dispatch(request, call_next)
        assert response.status_code == 200
        call_next.assert_called_once_with(request)


def test_rate_limit_key_func_uses_forwarded_for():
    from app.core.rate_limit import get_client_ip

    request = MagicMock()
    request.headers = {"X-Forwarded-For": "203.0.113.1, 10.0.0.1"}

    ip = get_client_ip(request)
    assert ip == "203.0.113.1"


def test_rate_limit_key_func_fallback():
    from app.core.rate_limit import get_client_ip

    request = MagicMock()
    request.headers = {}

    with patch("app.core.rate_limit.get_remote_address", return_value="127.0.0.1"):
        ip = get_client_ip(request)
        assert ip == "127.0.0.1"


def test_rate_limit_key_func_single_ip():
    from app.core.rate_limit import get_client_ip

    request = MagicMock()
    request.headers = {"X-Forwarded-For": "198.51.100.1"}

    ip = get_client_ip(request)
    assert ip == "198.51.100.1"


def test_rate_limit_limiter_created():
    from app.core.rate_limit import limiter

    assert hasattr(limiter, "_default_limits")
    assert len(limiter._default_limits) > 0


@pytest.mark.asyncio
async def test_real_ip_middleware_parses_forwarded_for():
    from app.middleware.real_ip import RealIPMiddleware

    request = MagicMock()
    request.headers = {"X-Forwarded-For": "198.51.100.1, 10.0.0.1"}
    request.scope = {"client": ("127.0.0.1", 8080)}

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = RealIPMiddleware(lambda r: None)
    await middleware.dispatch(request, call_next)
    assert request.scope["client"] == ("198.51.100.1", 8080)
