"""Integration tests for Promo Studio endpoints.

Covers plan §8: project CRUD auth matrix (marketing OK / teacher 403 /
anon 401), render enqueue → stream entry, quota exhaustion 429.
Service + queue layers are patched — route wiring and auth are exercised;
business logic is covered by unit tests.
"""
import uuid
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.promo import service as promo_service
from app.modules.promo.router import promo_router

VALID_PAYLOAD = {
    "heroL1": "Learn it",
    "heroL2": "with AI",
    "heroL3": "ship it same day.",
    "cta": "Book free trial",
    "kicker": "New course",
    "micro": "On-campus",
    "rows": [{"time": "08", "title": "English B1 — Room A", "meta": "Ms. Layla"}],
    "cards": [{"tag": "CODE", "name": "Computing", "badge": "12", "desc": "Ship weekly.", "seats": "5 left"}],
    "stats": [{"value": "12k+", "label": "graduates"}],
}


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user=None):
        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(promo_router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: mock_db
        if current_user is not None:
            app.dependency_overrides[identity_deps.get_current_user] = lambda: current_user
        return app
    return _make


def make_project_row(owner_id):
    row = Mock()
    row.id = uuid.uuid4()
    row.type = "course"
    row.locale = "ar"
    row.tone = "cinematic"
    row.payload = dict(VALID_PAYLOAD)
    row.status = "draft"
    row.created_at = None
    row.updated_at = None
    return row


class TestAuthMatrix:
    def test_anon_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            resp = client.post("/api/v1/promo/projects", json={"locale": "ar", "tone": "cinematic", "payload": VALID_PAYLOAD})
        assert resp.status_code == 401

    def test_teacher_403(self, app_factory, teacher_user):
        app = app_factory(current_user=teacher_user)
        with TestClient(app) as client:
            resp = client.post("/api/v1/promo/projects", json={"locale": "ar", "tone": "cinematic", "payload": VALID_PAYLOAD})
        assert resp.status_code == 403

    def test_marketing_ok(self, app_factory, marketing_user, mock_db, monkeypatch):
        row = make_project_row(marketing_user.id)
        monkeypatch.setattr(promo_service, "create_project", AsyncMock(return_value=row))
        monkeypatch.setattr("app.modules.identity.service.create_audit_log", AsyncMock(return_value=None))
        app = app_factory(current_user=marketing_user)
        with TestClient(app) as client:
            resp = client.post("/api/v1/promo/projects", json={"locale": "ar", "tone": "cinematic", "payload": VALID_PAYLOAD})
        assert resp.status_code == 201
        assert resp.json()["status"] == "draft"

    def test_quota_requires_auth(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            resp = client.get("/api/v1/promo/quota")
        assert resp.status_code == 401


class TestRenderEnqueue:
    def test_enqueue_returns_202_and_queues(self, app_factory, marketing_user, mock_db, monkeypatch):
        row = make_project_row(marketing_user.id)
        render = Mock(
            id=uuid.uuid4(), project_id=row.id, quality="draft",
            template_version="course-ad-v1", brand_kit_version=1,
            mp4_path=None, poster_path=None, share_copy="copy",
            duration_s=21.0, render_ms=None, status="queued", error=None,
            created_at=None,
        )
        monkeypatch.setattr(promo_service, "get_project", AsyncMock(return_value=row))
        monkeypatch.setattr(promo_service, "enqueue_render", AsyncMock(return_value=render))
        monkeypatch.setattr("app.modules.identity.service.create_audit_log", AsyncMock(return_value=None))
        app = app_factory(current_user=marketing_user)
        with TestClient(app) as client:
            resp = client.post(f"/api/v1/promo/projects/{row.id}/render?quality=draft")
        assert resp.status_code == 202
        assert resp.json()["render_id"] == str(render.id)

    def test_quota_exhaustion_429(self, app_factory, marketing_user, mock_db, monkeypatch):
        row = make_project_row(marketing_user.id)
        monkeypatch.setattr(promo_service, "get_project", AsyncMock(return_value=row))

        async def _raise(*a, **k):
            raise PermissionError("Monthly promo quota exhausted (20/20)")
        monkeypatch.setattr(promo_service, "enqueue_render", _raise)
        app = app_factory(current_user=marketing_user)
        with TestClient(app) as client:
            resp = client.post(f"/api/v1/promo/projects/{row.id}/render?quality=high")
        assert resp.status_code == 429
        assert resp.headers.get("Retry-After")

    def test_render_404_for_missing_project(self, app_factory, marketing_user, mock_db, monkeypatch):
        monkeypatch.setattr(promo_service, "get_project", AsyncMock(return_value=None))
        app = app_factory(current_user=marketing_user)
        with TestClient(app) as client:
            resp = client.post(f"/api/v1/promo/projects/{uuid.uuid4()}/render?quality=draft")
        assert resp.status_code == 404


class TestQuotaEndpoint:
    def test_quota_shape(self, app_factory, marketing_user, monkeypatch):
        monkeypatch.setattr(promo_service, "quota_used", AsyncMock(return_value=7))
        monkeypatch.setattr(promo_service, "quota_limit", AsyncMock(return_value=20))
        app = app_factory(current_user=marketing_user)
        with TestClient(app) as client:
            resp = client.get("/api/v1/promo/quota")
        assert resp.status_code == 200
        assert resp.json() == {"used": 7, "limit": 20, "reset_at": resp.json()["reset_at"]}
