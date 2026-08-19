from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware


class CSRFTestMiddleware(BaseHTTPMiddleware):
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

    async def dispatch(self, request: Request, call_next):
        try:
            if request.method in self.SAFE_METHODS:
                return await call_next(request)

            csrf_token = request.headers.get("X-CSRF-Token")
            csrf_cookie = request.cookies.get("csrf_token")

            if not csrf_token or not csrf_cookie or csrf_token != csrf_cookie:
                raise HTTPException(status_code=403, detail="CSRF token mismatch")

            return await call_next(request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )


@pytest.fixture
def app():
    app = FastAPI()

    @app.get("/api/public")
    async def public():
        return {"status": "ok"}

    @app.post("/api/payments")
    async def create_payment():
        return {"status": "payment_created"}

    @app.post("/api/enrollments")
    async def create_enrollment():
        return {"status": "enrollment_created"}

    return app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestCSRFIntegration:

    def test_get_requests_bypass_csrf(self, client):
        app = client.app
        app.add_middleware(CSRFTestMiddleware)
        with TestClient(app) as test_client:
            response = test_client.get("/api/public")
        assert response.status_code == 200

    def test_post_without_csrf_token_returns_403(self, client):
        app = client.app
        app.add_middleware(CSRFTestMiddleware)
        with TestClient(app) as test_client:
            response = test_client.post("/api/payments")
        assert response.status_code == 403
        assert "csrf" in response.text.lower()

    def test_post_with_valid_csrf_token_succeeds(self, client):
        app = client.app
        app.add_middleware(CSRFTestMiddleware)
        with TestClient(app) as test_client:
            test_client.cookies.set("csrf_token", "valid-token-123")
            response = test_client.post(
                "/api/payments",
                headers={"X-CSRF-Token": "valid-token-123"},
            )
        assert response.status_code == 200

    def test_post_with_mismatched_csrf_token_fails(self, client):
        app = client.app
        app.add_middleware(CSRFTestMiddleware)
        with TestClient(app) as test_client:
            test_client.cookies.set("csrf_token", "cookie-token")
            response = test_client.post(
                "/api/enrollments",
                headers={"X-CSRF-Token": "different-token"},
            )
        assert response.status_code == 403

    def test_post_without_csrf_cookie_fails(self, client):
        app = client.app
        app.add_middleware(CSRFTestMiddleware)
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/payments",
                headers={"X-CSRF-Token": "some-token"},
            )
        assert response.status_code == 403

    def test_safe_methods_list_includes_options_and_head(self):
        middleware = CSRFTestMiddleware
        assert "GET" in middleware.SAFE_METHODS
        assert "HEAD" in middleware.SAFE_METHODS
        assert "OPTIONS" in middleware.SAFE_METHODS
        assert "TRACE" in middleware.SAFE_METHODS
        assert "POST" not in middleware.SAFE_METHODS
        assert "PUT" not in middleware.SAFE_METHODS
        assert "DELETE" not in middleware.SAFE_METHODS
        assert "PATCH" not in middleware.SAFE_METHODS
