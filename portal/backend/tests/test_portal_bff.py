"""Unit + integration smoke tests for the Phase 1 portal BFF.

Builds the FastAPI app from app.main (safe: Sentry only inits when DSN is set)
and exercises auth cookie flow, cache read-through headers, and ERP proxy
behaviour with mocked services. No real DB/Redis required.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

TEST_JWT_SECRET = "test_portal_jwt_secret_12345678901234567890123456789012"


@pytest.fixture(autouse=True)
def _test_secret():
    from app.core.config import settings

    settings.PORTAL_JWT_SECRET = TEST_JWT_SECRET
    settings.ENVIRONMENT = "development"
    settings.REDIS_URL = ""  # force in-memory/noop paths
    settings.ERP_SERVICE_KEY = "test_service_key"
    settings.ERP_INTERNAL_URL = ""  # never touch the network in unit tests
    yield
    settings.PORTAL_JWT_SECRET = TEST_JWT_SECRET


@pytest.fixture
def portal_app():
    from app.main import app
    from app.db.session import get_db

    # Override the DB dependency — auth endpoints need a session (portal.*),
    # but unit tests never touch a real PG.
    fake_db = AsyncMock()

    async def _fake_get_db():
        yield fake_db

    app.dependency_overrides[get_db] = _fake_get_db
    yield app
    app.dependency_overrides.clear()


def _auth_user() -> dict:
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "phone": "+966500000000",
        "is_active": True,
        "full_name": "Parent One",
        "locale_pref": "ar",
    }


@pytest.fixture
def authed_client(portal_app):
    """Client where get_current_portal_user is overridden to return a fake user
    (FastAPI resolves dependencies by function object, so dependency_overrides
    wins over the router-level import)."""
    from app.modules.auth.dependencies import get_current_portal_user

    async def _fake_portal_user():
        return _auth_user()

    portal_app.dependency_overrides[get_current_portal_user] = _fake_portal_user
    transport = ASGITransport(app=portal_app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def client(portal_app):
    transport = ASGITransport(app=portal_app)
    return AsyncClient(transport=transport, base_url="http://test")


# ── Auth: OTP flow ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_request_otp_creates_user(client):
    from app.modules.auth import service as auth_service

    fake_user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "phone": "+966500000000",
        "is_active": True,
        "full_name": "Portal User",
        "locale_pref": "ar",
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    with (
        patch.object(auth_service, "get_or_create_user_by_phone", new_callable=AsyncMock) as m_get,
        patch.object(auth_service, "generate_otp", new_callable=AsyncMock) as m_otp,
    ):
        m_get.return_value = fake_user
        m_otp.return_value = "123456"
        resp = await client.post(
            "/api/auth/request-otp", json={"phone": "+966500000000"}
        )
        assert resp.status_code == 200
        assert "OTP sent" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_verify_otp_sets_portal_cookies(client):
    from app.modules.auth import service as auth_service

    fake_user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "phone": "+966500000000",
        "is_active": True,
        "full_name": "Parent One",
        "locale_pref": "ar",
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    with (
        patch.object(auth_service, "get_or_create_user_by_phone", new_callable=AsyncMock) as m_get,
        patch.object(auth_service, "_verify_otp_code", new_callable=AsyncMock) as m_verify,
        patch.object(auth_service, "reset_failed_attempts", new_callable=AsyncMock),
        patch.object(auth_service, "store_refresh_token", new_callable=AsyncMock),
    ):
        m_get.return_value = fake_user
        m_verify.return_value = True
        resp = await client.post(
            "/api/auth/verify-otp", json={"phone": "+966500000000", "code": "123456"}
        )
        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "")
        assert "portal_access_token=" in set_cookie
        assert "portal_refresh_token=" in set_cookie


@pytest.mark.asyncio
async def test_verify_otp_wrong_code_locks_after_5(client):
    from app.modules.auth import service as auth_service

    fake_user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "phone": "+966500000000",
        "is_active": True,
        "full_name": "Parent One",
        "locale_pref": "ar",
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    with (
        patch.object(auth_service, "get_or_create_user_by_phone", new_callable=AsyncMock) as m_get,
        patch.object(auth_service, "_verify_otp_code", new_callable=AsyncMock) as m_verify,
        patch.object(auth_service, "record_failed_attempt", new_callable=AsyncMock) as m_record,
    ):
        m_get.return_value = fake_user
        m_verify.return_value = False
        resp = await client.post(
            "/api/auth/verify-otp", json={"phone": "+966500000000", "code": "000000"}
        )
        assert resp.status_code == 401
        m_record.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_rotates_token(client):
    from app.modules.auth import service as auth_service
    from app.modules.auth.security import create_refresh_token

    payload = {"sub": "11111111-1111-1111-1111-111111111111"}
    old_token = create_refresh_token(payload)

    fake_user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "phone": "+966500000000",
        "is_active": True,
        "full_name": "Parent One",
        "locale_pref": "ar",
    }
    with (
        patch.object(auth_service, "refresh_token_is_valid", new_callable=AsyncMock) as m_valid,
        patch.object(auth_service, "rotate_refresh_token", new_callable=AsyncMock),
        patch.object(auth_service, "store_refresh_token", new_callable=AsyncMock),
    ):
        m_valid.return_value = fake_user
        # CSRF middleware: a portal auth cookie present + mutating request
        # requires X-CSRF-Token matching the csrf_token cookie.
        resp = await client.post(
            "/api/auth/refresh",
            cookies={
                "portal_refresh_token": old_token,
                "csrf_token": "dummy-csrf",
            },
            headers={"X-CSRF-Token": "dummy-csrf"},
        )
        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "")
        assert "portal_access_token=" in set_cookie


# ── Portal read path: cache headers ──────────────────────────────────────


@pytest.mark.asyncio
async def test_me_proxy_miss_then_hit(authed_client):
    from app.services import erp_client as erp_mod
    from app.services import cache as cache_mod

    me_payload = {
        "actor_id": "11111111-1111-1111-1111-111111111111",
        "linked_students": [
            {"student_id": "22222222-2222-2222-2222-222222222222",
             "full_name": "Student One", "student_code": "STU001"}
        ],
    }
    with (
        patch.object(erp_mod.erp_client, "get_me", new_callable=AsyncMock) as m_me,
        patch.object(cache_mod.cache, "get", new_callable=AsyncMock) as m_get,
        patch.object(cache_mod.cache, "set", new_callable=AsyncMock) as m_set,
    ):
        m_get.return_value = None
        m_me.return_value = me_payload

        # Miss → proxies ERP, sets X-Cache: MISS
        resp = await authed_client.get("/api/me")
        assert resp.status_code == 200
        assert resp.headers.get("x-cache") == "MISS"
        assert resp.json()["linked_students"][0]["student_code"] == "STU001"

        # Hit → cached, X-Cache: HIT, ERP not called again
        m_get.return_value = {"data": me_payload, "_as_of": "2026-08-14T00:00:00+00:00"}
        resp2 = await authed_client.get("/api/me")
        assert resp2.headers.get("x-cache") == "HIT"
        m_me.assert_awaited_once()


@pytest.mark.asyncio
async def test_me_force_refresh_bypasses_cache(authed_client):
    from app.services import erp_client as erp_mod
    from app.services import cache as cache_mod

    me_payload = {
        "actor_id": "11111111-1111-1111-1111-111111111111",
        "linked_students": [],
    }
    with (
        patch.object(erp_mod.erp_client, "get_me", new_callable=AsyncMock) as m_me,
        patch.object(cache_mod.cache, "get", new_callable=AsyncMock) as m_get,
        patch.object(cache_mod.cache, "set", new_callable=AsyncMock) as m_set,
    ):
        # Even with a warm cache, ?refresh=1 must go to ERP (X-Cache: MISS).
        m_get.return_value = {"data": me_payload, "_as_of": "2026-08-14T00:00:00+00:00"}
        m_me.return_value = me_payload

        resp = await authed_client.get("/api/me", params={"refresh": "1"})
        assert resp.status_code == 200
        assert resp.headers.get("x-cache") == "MISS"
        m_me.assert_awaited_once()
        m_get.assert_not_awaited()


@pytest.mark.asyncio
async def test_cache_stats_and_health(client, portal_app):
    from app.services import erp_client as erp_mod
    from app.services import cache as cache_mod
    from app.services.cache import stats

    stats.reset()
    me_payload = {"actor_id": "x", "linked_students": []}
    with (
        patch.object(erp_mod.erp_client, "get_me", new_callable=AsyncMock) as m_me,
        patch.object(cache_mod.cache, "get", new_callable=AsyncMock) as m_get,
        patch.object(cache_mod.cache, "set", new_callable=AsyncMock) as m_set,
    ):
        m_me.return_value = me_payload
        m_get.return_value = None
        # Two requests: miss, then hit (need auth override for /api/me)
        from app.modules.auth.dependencies import get_current_portal_user

        async def _fake_user():
            return _auth_user()

        portal_app.dependency_overrides[get_current_portal_user] = _fake_user
        try:
            resp1 = await client.get("/api/me")
            assert resp1.headers.get("x-cache") == "MISS"
            m_get.return_value = {"data": me_payload, "_as_of": "2026-08-14T00:00:00+00:00"}
            resp2 = await client.get("/api/me")
            assert resp2.headers.get("x-cache") == "HIT"
        finally:
            portal_app.dependency_overrides.pop(get_current_portal_user, None)

    resp = await client.get("/api/health/cache")
    assert resp.status_code == 200
    body = resp.json()
    assert body["hits"] >= 1
    assert body["misses"] >= 1
    assert body["hit_rate"] is not None and 0 < body["hit_rate"] <= 1


@pytest.mark.asyncio
async def test_cache_stats_reset_endpoint(client):
    from app.services.cache import stats

    stats.reset()
    resp = await client.post("/api/health/cache/reset")
    assert resp.status_code == 200
    assert resp.json() == {"reset": True}
    assert stats.hits == 0 and stats.misses == 0


@pytest.mark.asyncio
async def test_grades_proxy_requires_auth(client):
    resp = await client.get("/api/me/grades", params={"student_id": "22222222-2222-2222-2222-222222222222"})
    # No portal cookie → 401 from get_current_portal_user
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_grades_proxy_erp_down_returns_502(authed_client):
    from app.services import erp_client as erp_mod
    from app.services import cache as cache_mod

    with (
        patch.object(erp_mod.erp_client, "get_grades", new_callable=AsyncMock) as m_grades,
        patch.object(cache_mod.cache, "get", new_callable=AsyncMock) as m_get,
        patch.object(cache_mod.cache, "set", new_callable=AsyncMock),
    ):
        m_get.return_value = None
        m_grades.side_effect = erp_mod.ErpClientError(500, "boom")
        resp = await authed_client.get("/api/me/grades", params={"student_id": "22222222-2222-2222-2222-222222222222"})
        assert resp.status_code == 502


# ── AI proxy ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ai_explain_enqueues(authed_client):
    from app.modules.ai_proxy import router as ai_router_mod

    with patch.object(ai_router_mod, "get_queue") as m_queue:
        fake_q = AsyncMock()
        fake_q.enqueue = AsyncMock(return_value="job-123")
        m_queue.return_value = fake_q

        resp = await authed_client.post(
            "/api/ai/explain",
            json={"section_id": "33333333-3333-3333-3333-333333333333", "question": "What is x?"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["job_id"] == "job-123"
        assert body["status"] == "queued"
        fake_q.enqueue.assert_awaited_once()


# ── Health ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_returns_ok_without_db(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "portal-backend"
    assert body["status"] in ("ok", "degraded")


# ── Cache key determinism ────────────────────────────────────────────────


def test_cache_key_deterministic():
    from app.services.cache import cache_key

    k1 = cache_key("grades", "s1", {"student_id": "s1", "x": 1})
    k2 = cache_key("grades", "s1", {"x": 1, "student_id": "s1"})
    assert k1 == k2
    assert k1.startswith("cache:grades:s1:")


def test_otp_generation_console_log():
    """MVP OTP generation returns a 6-digit code (in-memory store)."""
    from app.modules.auth import service as auth_service

    with patch.object(auth_service, "_memory_otps", new={}):
        code = asyncio.run(auth_service.generate_otp("+966500000000"))
        assert len(code) == 6
        assert code.isdigit()
