from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


class RealIPTestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
            port = request.scope.get("client", (None, None))[1] or 0
            request.scope["client"] = (client_ip, port)
        return await call_next(request)


def _make_app():
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["5/minute"],
        headers_enabled=True,
    )
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/api/test")
    async def test_endpoint(request: Request):
        return {"status": "ok"}

    @app.get("/api/unlimited")
    async def unlimited(request: Request):
        return {"status": "unlimited"}

    return app


class TestRateLimitHeaders:

    def test_rate_limit_headers_present(self):
        app = _make_app()
        app.add_middleware(SlowAPIMiddleware)
        with TestClient(app) as test_client:
            response = test_client.get("/api/test")

        assert response.status_code == 200
        headers_lower = {k.lower(): v for k, v in response.headers.items()}
        assert "x-ratelimit-limit" in headers_lower, (
            "X-RateLimit-Limit header must be present"
        )
        assert "x-ratelimit-remaining" in headers_lower, (
            "X-RateLimit-Remaining header must be present"
        )

    def test_rate_limit_remaining_decreases(self):
        app = _make_app()
        app.add_middleware(SlowAPIMiddleware)
        with TestClient(app) as test_client:
            first = test_client.get("/api/test")
            first_remaining = int(
                first.headers.get("x-ratelimit-remaining", 0)
            )

            second = test_client.get("/api/test")
            second_remaining = int(
                second.headers.get("x-ratelimit-remaining", 0)
            )

        assert second_remaining < first_remaining, (
            "X-RateLimit-Remaining should decrease after each request"
        )

    def test_rate_limit_429_after_exceeding(self):
        app = _make_app()
        app.add_middleware(SlowAPIMiddleware)
        with TestClient(app) as test_client:
            for _ in range(5):
                test_client.get("/api/test")

            overflow = test_client.get("/api/test")

        assert overflow.status_code == 429, (
            "Should return 429 after exceeding rate limit"
        )

    def test_rate_limit_resets_after_window(self):
        app = _make_app()
        app.add_middleware(SlowAPIMiddleware)
        with TestClient(app) as test_client:
            for _ in range(5):
                test_client.get("/api/test")

            overflow = test_client.get("/api/test")

        assert overflow.status_code == 429
        headers_lower = {k.lower(): v for k, v in overflow.headers.items()}
        assert "retry-after" in headers_lower or "x-ratelimit-reset" in headers_lower, (
            "Rate limited response should indicate retry time"
        )

    def test_different_ip_gets_fresh_limit(self):
        app = _make_app()
        app.add_middleware(SlowAPIMiddleware)
        with TestClient(app) as test_client:
            first = test_client.get(
                "/api/test",
                headers={"X-Forwarded-For": "10.0.0.1"},
            )
            second = test_client.get(
                "/api/test",
                headers={"X-Forwarded-For": "10.0.0.2"},
            )

        assert first.status_code == 200
        assert second.status_code == 200

    def test_x_forwarded_for_parsing_in_real_ip_middleware(self):
        app = FastAPI()

        @app.get("/api/echo-ip")
        async def echo_ip(request: Request):
            return {"client_ip": request.client.host if request.client else "unknown"}

        app.add_middleware(RealIPTestMiddleware)

        with TestClient(app) as test_client:
            response = test_client.get(
                "/api/echo-ip",
                headers={"X-Forwarded-For": "203.0.113.195, 10.0.0.1, 172.16.0.1"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["client_ip"] == "203.0.113.195", (
            "RealIPMiddleware should take the first IP from X-Forwarded-For"
        )

    def test_single_ip_in_x_forwarded_for(self):
        app = FastAPI()

        @app.get("/api/echo-ip")
        async def echo_ip(request: Request):
            return {"client_ip": request.client.host if request.client else "unknown"}

        app.add_middleware(RealIPTestMiddleware)

        with TestClient(app) as test_client:
            response = test_client.get(
                "/api/echo-ip",
                headers={"X-Forwarded-For": "198.51.100.1"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["client_ip"] == "198.51.100.1"

    def test_no_x_forwarded_for_uses_original_ip(self):
        app = FastAPI()

        @app.get("/api/echo-ip")
        async def echo_ip(request: Request):
            return {"client_ip": request.client.host if request.client else "unknown"}

        app.add_middleware(RealIPTestMiddleware)

        with TestClient(app) as test_client:
            response = test_client.get("/api/echo-ip")

        assert response.status_code == 200
