"""Smoke check for Phase 0 portal internal router registration & service key gate.

Avoids importing app.main directly (Sentry init fails in this env when
sentry-sdk 2.x scans stale dists). Instead it builds the FastAPI app via
the router module itself — the unit under test.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings
from app.modules.portal_internal.router import internal_router


def test_internal_router_paths():
    paths = [r.path for r in internal_router.routes]
    assert "/internal/portal/me" in paths
    assert "/internal/portal/grades" in paths
    assert "/internal/portal/attendance" in paths
    assert "/internal/portal/payments" in paths
    assert "/internal/portal/sections" in paths
    assert "/internal/portal/profile" in paths
    assert "/internal/portal/photo" in paths


def test_internal_router_methods():
    # Collect per path — /internal/portal/photo is registered twice (upload and
    # remove), so keying a dict by path alone would silently drop one of them.
    methods_by_path: dict[str, set] = {}
    for route in internal_router.routes:
        methods_by_path.setdefault(route.path, set()).update(route.methods)

    assert "GET" in methods_by_path["/internal/portal/me"]
    assert "POST" in methods_by_path["/internal/portal/profile"]
    assert {"POST", "DELETE"} <= methods_by_path["/internal/portal/photo"]


def test_photo_delete_clears_the_column_and_removes_the_file():
    """DELETE /photo must null the column AND unlink the stored file.

    Clearing without unlinking would orphan every replaced photo on the volume;
    unlinking without clearing would leave the DB pointing at a deleted file.
    """
    from app.modules.portal_internal import router as portal_router
    from app.modules.portal_internal import service as portal_service

    with (
        patch.object(portal_service, "get_student", new_callable=AsyncMock) as m_get,
        patch.object(portal_service, "student_is_linked", new_callable=AsyncMock) as m_linked,
        patch.object(portal_service, "set_student_photo", new_callable=AsyncMock) as m_set,
        patch.object(portal_router, "_write_audit", new_callable=AsyncMock),
        patch.object(portal_router, "delete_file") as m_delete,
    ):
        from fastapi import FastAPI
        from httpx import ASGITransport, AsyncClient

        settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"
        m_get.return_value = {"id": "22222222-2222-2222-2222-222222222222"}
        m_linked.return_value = True
        m_set.return_value = "avatars/old.jpg"

        app = FastAPI()
        app.include_router(internal_router, prefix="/api/v1")

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r = await c.delete(
                    "/api/v1/internal/portal/photo"
                    "?student_id=22222222-2222-2222-2222-222222222222",
                    headers={
                        "X-Service-Key": settings.ERP_SERVICE_KEY,
                        "X-Actor-Id": "11111111-1111-1111-1111-111111111111",
                    },
                )
                return r.status_code, r.json()

        status, body = asyncio.run(run())

    assert status == 200
    assert body["photo_url"] is None
    # Cleared by passing None...
    assert m_set.await_args.args[2] is None
    # ...and the previous file is unlinked.
    m_delete.assert_called_once_with("avatars/old.jpg")


def test_photo_delete_removes_no_file_when_none_was_set():
    """A no-op removal (already cleared) must not touch the volume."""
    from app.modules.portal_internal import router as portal_router
    from app.modules.portal_internal import service as portal_service

    with (
        patch.object(portal_service, "get_student", new_callable=AsyncMock) as m_get,
        patch.object(portal_service, "student_is_linked", new_callable=AsyncMock) as m_linked,
        patch.object(portal_service, "set_student_photo", new_callable=AsyncMock) as m_set,
        patch.object(portal_router, "_write_audit", new_callable=AsyncMock),
        patch.object(portal_router, "delete_file") as m_delete,
    ):
        from fastapi import FastAPI
        from httpx import ASGITransport, AsyncClient

        settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"
        m_get.return_value = {"id": "22222222-2222-2222-2222-222222222222"}
        m_linked.return_value = True
        m_set.return_value = None

        app = FastAPI()
        app.include_router(internal_router, prefix="/api/v1")

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r = await c.delete(
                    "/api/v1/internal/portal/photo"
                    "?student_id=22222222-2222-2222-2222-222222222222",
                    headers={
                        "X-Service-Key": settings.ERP_SERVICE_KEY,
                        "X-Actor-Id": "11111111-1111-1111-1111-111111111111",
                    },
                )
                return r.status_code

        assert asyncio.run(run()) == 200

    m_delete.assert_not_called()


def test_verify_service_key_401_when_missing():
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"

    app = FastAPI()
    app.include_router(internal_router, prefix="/api/v1")

    async def run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get("/api/v1/internal/portal/me")
            return r.status_code

    assert asyncio.run(run()) == 401


def test_verify_service_key_actor_required():
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"

    app = FastAPI()
    app.include_router(internal_router, prefix="/api/v1")

    async def run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get(
                "/api/v1/internal/portal/me",
                headers={"X-Service-Key": settings.ERP_SERVICE_KEY},
            )
            return r.status_code

    # Correct key but missing actor -> 401 (actor required), never 500 on key.
    assert asyncio.run(run()) == 401


def test_me_response_exposes_the_registration_date():
    """/me must forward the registration date, not just the identity fields.

    Guards the seam the service test cannot: the SQL alias and the DTO field name
    have to agree, or the portal silently renders no badge.
    """
    from datetime import datetime, timezone

    from app.modules.portal_internal import router as portal_router
    from app.modules.portal_internal import service as portal_service

    # The audit row is written inline; stubbing it keeps this test off the DB
    # (and off the session-teardown commit that follows).
    with (
        patch.object(
            portal_service, "get_linked_students", new_callable=AsyncMock
        ) as m_students,
        patch.object(portal_router, "_write_audit", new_callable=AsyncMock),
    ):
        from fastapi import FastAPI
        from httpx import ASGITransport, AsyncClient

        settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"
        m_students.return_value = [
            {
                "student_id": "22222222-2222-2222-2222-222222222222",
                "full_name": "Student One",
                "student_code": "STU001",
                "registered_at": datetime(2025, 9, 1, tzinfo=timezone.utc),
            }
        ]

        app = FastAPI()
        app.include_router(internal_router, prefix="/api/v1")

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r = await c.get(
                    "/api/v1/internal/portal/me",
                    headers={
                        "X-Service-Key": settings.ERP_SERVICE_KEY,
                        "X-Actor-Id": "11111111-1111-1111-1111-111111111111",
                    },
                )
                return r.status_code, r.json()

        status, body = asyncio.run(run())

    assert status == 200
    assert body["linked_students"][0]["registered_at"].startswith("2025-09-01")


def test_student_access_checks_are_awaited():
    """Regression: access checks must be awaited so unlinked actors / unknown
    students get 403/404 instead of silently passing."""
    from app.modules.portal_internal import service as portal_service

    with (
        patch.object(portal_service, "get_student", new_callable=AsyncMock) as m_get,
        patch.object(portal_service, "student_is_linked", new_callable=AsyncMock) as m_linked,
        patch.object(portal_service, "get_grades", new_callable=AsyncMock) as m_grades,
    ):
        from fastapi import FastAPI, HTTPException
        from httpx import ASGITransport, AsyncClient

        settings.ERP_SERVICE_KEY = "test_service_key_for_smoke"
        m_get.return_value = {"id": "s1"}
        m_linked.return_value = False
        m_grades.return_value = []

        app = FastAPI()
        app.include_router(internal_router, prefix="/api/v1")

        async def run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r = await c.get(
                    "/api/v1/internal/portal/grades?student_id=s1",
                    headers={
                        "X-Service-Key": settings.ERP_SERVICE_KEY,
                        "X-Actor-Id": "11111111-1111-1111-1111-111111111111",
                    },
                )
                return r.status_code

        assert asyncio.run(run()) == 403
        m_linked.assert_awaited_once()
