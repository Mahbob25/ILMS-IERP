"""Smoke checks for the AI Management router registration + internal gate.

Follows test_portal_internal_routes.py: builds small FastAPI apps from the
router modules (not app.main) so no Sentry/DB boot is needed.
"""
import asyncio

from app.modules.ai_management.router import ai_management_router, internal_ai_router


def test_ai_management_router_paths():
    routes = [(r.path, m) for r in ai_management_router.routes for m in (r.methods or set())]
    assert ("/ai-management/config", "GET") in routes
    assert ("/ai-management/config", "PUT") in routes
    assert ("/ai-management/test", "POST") in routes


def test_internal_ai_router_path():
    paths = [r.path for r in internal_ai_router.routes]
    assert "/internal/ai/config" in paths


def test_internal_ai_config_401_without_service_key():
    from unittest.mock import AsyncMock, patch

    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from app.core.config import settings

    settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"

    app = FastAPI()
    app.include_router(internal_ai_router, prefix="/api/v1")

    with patch(
        "app.modules.ai_management.router.ai_service.get_internal_config",
        new_callable=AsyncMock,
    ) as m_get:
        m_get.return_value = {"provider": "gemini", "api_key": "secret"}

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                return await c.get("/api/v1/internal/ai/config")

        resp = asyncio.run(run())
        assert resp.status_code == 401
        m_get.assert_not_awaited()


def test_internal_ai_config_200_with_service_key():
    from unittest.mock import AsyncMock, patch

    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from app.core.config import settings

    settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"

    app = FastAPI()
    app.include_router(internal_ai_router, prefix="/api/v1")

    with patch(
        "app.modules.ai_management.router.ai_service.get_internal_config",
        new_callable=AsyncMock,
    ) as m_get:
        m_get.return_value = {"provider": "gemini", "api_key": "secret"}

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                return await c.get(
                    "/api/v1/internal/ai/config",
                    headers={"X-Service-Key": settings.ERP_SERVICE_KEY},
                )

        resp = asyncio.run(run())
        assert resp.status_code == 200
        assert resp.json()["api_key"] == "secret"
        m_get.assert_awaited_once()
