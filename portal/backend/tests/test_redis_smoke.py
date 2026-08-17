"""Phase 2 gate smoke test — real Redis, no mocks.

Exercises the read-through cache end-to-end against a live Redis:
- first fetch is X-Cache: MISS (proxies ERP via a mocked client)
- second fetch is X-Cache: HIT (served from Redis)
- ?refresh=1 bypasses the cache (MISS again, ERP called)
- /api/health/cache reports hit rate >= 90% after the warm loop

Requires: REDIS_URL env var + reachable redis. The ERP hop is mocked, so
no backend/database is needed.

    docker run -d --name portal_redis --network lims-internal -p 6379:6379 redis:7-alpine
    set REDIS_URL=redis://localhost:6379/0
    pytest tests/test_redis_smoke.py -v
"""

import os

import pytest
from httpx import ASGITransport, AsyncClient

# The module-level `cache` singleton holds a redis connection bound to the
# loop it was first used on. Function-scoped loops (Windows Proactor) would
# kill it between tests, so the whole file shares one session loop.
pytestmark = [
    pytest.mark.asyncio(loop_scope="session"),
    pytest.mark.skipif(
        os.getenv("REDIS_URL") is None,
        reason="Redis integration test requires REDIS_URL",
    ),
]

TEST_JWT_SECRET = "test_portal_jwt_secret_12345678901234567890123456789012"

USER_ID = "11111111-1111-1111-1111-111111111111"
STUDENT_ID = "22222222-2222-2222-2222-222222222222"

GRADES_PAYLOAD = [
    {
        "section_id": "33333333-3333-3333-3333-333333333333",
        "course_name": "Mathematics",
        "final_score": 92.5,
        "graded_at": "2026-07-01T00:00:00+00:00",
    },
    {
        "section_id": "44444444-4444-4444-4444-444444444444",
        "course_name": "Physics",
        "final_score": 87.0,
        "graded_at": "2026-07-02T00:00:00+00:00",
    },
]


@pytest.fixture(autouse=True)
def _redis_settings():
    from app.core.config import settings

    settings.PORTAL_JWT_SECRET = TEST_JWT_SECRET
    settings.ENVIRONMENT = "development"
    settings.REDIS_URL = os.getenv("REDIS_URL")
    settings.ERP_SERVICE_KEY = "test_service_key"
    settings.ERP_INTERNAL_URL = "http://backend:8000"  # never reached — ERP mocked
    yield
    settings.REDIS_URL = ""


@pytest.fixture
async def redis_app():
    from fastapi import FastAPI

    from app.main import app
    from app.db.session import get_db
    from app.modules.auth.dependencies import get_current_portal_user
    from app.services.cache import cache, stats

    assert isinstance(app, FastAPI)

    # Reset stats + flush redis so the run is deterministic.
    stats.reset()
    client = await cache._client()
    assert client is not None, "REDIS_URL must point at a reachable redis"
    await client.flushdb()

    fake_db = object()  # no DB calls in the read path — auth is overridden

    async def _fake_get_db():
        yield fake_db

    async def _fake_portal_user():
        return {
            "id": USER_ID,
            "phone": "+966500000000",
            "is_active": True,
            "full_name": "Parent One",
            "locale_pref": "ar",
        }

    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_current_portal_user] = _fake_portal_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await client.flushdb()


@pytest.mark.asyncio
async def test_read_through_hit_rate_and_refresh(redis_app):
    from unittest.mock import AsyncMock, patch

    from app.services import erp_client as erp_mod
    from app.services.cache import stats

    with patch.object(erp_mod.erp_client, "get_grades", new_callable=AsyncMock) as m_grades:
        m_grades.return_value = GRADES_PAYLOAD

        # 1. Cold → MISS, proxies ERP.
        resp1 = await redis_app.get(
            "/api/me/grades", params={"student_id": STUDENT_ID}
        )
        assert resp1.status_code == 200
        assert resp1.headers.get("x-cache") == "MISS"
        assert resp1.headers.get("x-data-as-of")
        assert resp1.json() == GRADES_PAYLOAD

        # 2. Warm → HIT, ERP NOT called again.
        resp2 = await redis_app.get(
            "/api/me/grades", params={"student_id": STUDENT_ID}
        )
        assert resp2.status_code == 200
        assert resp2.headers.get("x-cache") == "HIT"
        assert resp2.json() == GRADES_PAYLOAD
        m_grades.assert_awaited_once()

        # 3. Force refresh (?refresh=1) → MISS even though cache is warm,
        #    ERP called again.
        resp3 = await redis_app.get(
            "/api/me/grades", params={"student_id": STUDENT_ID, "refresh": "1"}
        )
        assert resp3.status_code == 200
        assert resp3.headers.get("x-cache") == "MISS"
        assert m_grades.await_count == 2

        # 4. Repeat the warm read several times to push hit rate above 90%.
        #    hits: 1 (step 2) + 19 = 20; misses: 2 (steps 1 + 3) → 20/22 ≈ 0.91
        for _ in range(19):
            r = await redis_app.get(
                "/api/me/grades", params={"student_id": STUDENT_ID}
            )
            assert r.headers.get("x-cache") == "HIT"

        # 5. Gate: /api/health/cache reports >= 0.9 hit rate at 60s TTL.
        h = await redis_app.get("/api/health/cache")
        assert h.status_code == 200
        body = h.json()
        assert body["ttl_seconds"] == 60
        assert body["hits"] >= 1
        assert body["misses"] >= 1
        assert body["hit_rate"] is not None
        assert body["hit_rate"] >= 0.9, f"hit_rate {body['hit_rate']} < 0.9"


@pytest.mark.asyncio
async def test_profile_write_invalidates_cache(redis_app):
    from unittest.mock import AsyncMock, patch

    from app.services import erp_client as erp_mod

    me_payload = {
        "actor_id": USER_ID,
        "linked_students": [
            {
                "student_id": STUDENT_ID,
                "full_name": "Student One",
                "student_code": "STU001",
            }
        ],
    }
    with (
        patch.object(erp_mod.erp_client, "get_me", new_callable=AsyncMock) as m_me,
        patch.object(erp_mod.erp_client, "update_profile", new_callable=AsyncMock) as m_update,
    ):
        m_me.return_value = me_payload
        m_update.return_value = {"updated": True}

        # Warm the /me cache.
        r1 = await redis_app.get("/api/me")
        assert r1.headers.get("x-cache") == "MISS"
        r2 = await redis_app.get("/api/me")
        assert r2.headers.get("x-cache") == "HIT"

        # Profile write → real Redis invalidation of the me + profile keys.
        r3 = await redis_app.post(
            "/api/me/profile",
            json={"locale_pref": "en"},
            params={"student_id": STUDENT_ID},
        )
        assert r3.status_code == 200
        m_update.assert_awaited_once()

        # Cache was invalidated → next read is a MISS (fresh data).
        r4 = await redis_app.get("/api/me")
        assert r4.headers.get("x-cache") == "MISS"
