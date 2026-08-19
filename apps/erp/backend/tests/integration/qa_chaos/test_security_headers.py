from unittest.mock import AsyncMock, Mock
import pytest
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'"
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


@pytest.fixture
def app():
    app = FastAPI()

    @app.get("/")
    async def root():
        return {"status": "ok"}

    @app.get("/api/health")
    async def health():
        return {"status": "healthy"}

    return app


@pytest.fixture
def client(app):
    app.add_middleware(SecurityHeadersMiddleware)
    return TestClient(app)


class TestSecurityHeaders:

    def test_csp_header_present(self, client):
        response = client.get("/")
        csp = response.headers.get("content-security-policy")
        assert csp is not None, "CSP header must be present"
        assert "default-src 'self'" in csp
        assert "unsafe-inline" in csp

    def test_hsts_header_present(self, client):
        response = client.get("/")
        hsts = response.headers.get("strict-transport-security")
        assert hsts is not None, "HSTS header must be present"
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts

    def test_x_frame_options_header_present(self, client):
        response = client.get("/")
        xfo = response.headers.get("x-frame-options")
        assert xfo is not None, "X-Frame-Options header must be present"
        assert xfo == "DENY"

    def test_x_content_type_options_header_present(self, client):
        response = client.get("/")
        xcto = response.headers.get("x-content-type-options")
        assert xcto is not None, "X-Content-Type-Options header must be present"
        assert xcto == "nosniff"

    def test_referrer_policy_header_present(self, client):
        response = client.get("/")
        rp = response.headers.get("referrer-policy")
        assert rp is not None, "Referrer-Policy header must be present"
        assert "strict-origin" in rp

    def test_all_security_headers_on_api_endpoint(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert "content-security-policy" in response.headers
        assert "strict-transport-security" in response.headers
        assert "x-frame-options" in response.headers
        assert "x-content-type-options" in response.headers
        assert "referrer-policy" in response.headers

    def test_no_security_headers_leak_on_error(self, client):
        response = client.get("/nonexistent")
        assert response.status_code == 404
        assert "content-security-policy" in response.headers
