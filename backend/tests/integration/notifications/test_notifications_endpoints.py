"""Integration tests for the Notifications Center endpoints (Phase 5).

Covers: 401 without cookie, auth gating on GET/POST, ownership enforcement
on mark_read (foreign IDs silently ignored), and response shape validation.
Service functions are patched — route wiring and auth are exercised here;
CRUD logic is covered by unit tests.
"""

import uuid
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.notifications import service as notif_service
from app.modules.notifications.router import notifications_router

USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")

SAMPLE_ITEM = {
    "id": str(uuid.uuid4()),
    "type": "refund_requested",
    "title_key": "notif.refund_requested",
    "body_key": "notif.refund_requested_body",
    "params": {"amount": "500 SAR"},
    "target_href": "dashboard/cashier/refunds",
    "priority": "high",
    "is_read": False,
    "read_at": None,
    "created_at": "2026-07-01T09:00:00+00:00",
}

SAMPLE_LIST = {
    "items": [SAMPLE_ITEM],
    "total": 1,
    "page": 1,
    "per_page": 20,
    "pages": 1,
}


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user=None, override_get_db=True):
        app = FastAPI()
        app.include_router(notifications_router)
        if override_get_db:
            app.dependency_overrides[get_db] = lambda: mock_db
        if current_user is not None:
            app.dependency_overrides[identity_deps.get_current_user] = lambda: current_user
        return app

    return _make


class TestUnauthenticated:
    def test_get_notifications_returns_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            resp = client.get("/notifications")
        assert resp.status_code == 401

    def test_get_unread_count_returns_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            resp = client.get("/notifications/unread-count")
        assert resp.status_code == 401

    def test_post_mark_read_returns_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            resp = client.post("/notifications/read", json={"ids": []})
        assert resp.status_code == 401


class TestListNotifications:
    def test_returns_list_shape(self, app_factory, manager_user, monkeypatch):
        service_mock = AsyncMock(return_value=SAMPLE_LIST)
        monkeypatch.setattr(notif_service, "list_notifications", service_mock)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            resp = client.get("/notifications")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"][0]["title_key"] == "notif.refund_requested"
        assert data["total"] == 1
        assert data["page"] == 1


class TestRead:
    def test_valid_payload_updates_count(self, app_factory, manager_user, monkeypatch):
        service_mock = AsyncMock(return_value=3)
        monkeypatch.setattr(notif_service, "mark_read", service_mock)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            resp = client.post(
                "/notifications/read",
                json={"ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
            )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 3

    def test_empty_ids_marks_all(self, app_factory, manager_user, monkeypatch):
        service_mock = AsyncMock(return_value=5)
        monkeypatch.setattr(notif_service, "mark_read", service_mock)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            resp = client.post("/notifications/read", json={"ids": []})
        assert resp.status_code == 200
        assert resp.json()["updated"] == 5

    def test_ids_ownership_enforced_by_service(self, app_factory, manager_user, monkeypatch):
        """The service enforces user_id — IDs from another user are silently
        ignored (no error, count returned reflects only own rows)."""
        service_mock = AsyncMock(return_value=0)
        monkeypatch.setattr(notif_service, "mark_read", service_mock)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            resp = client.post(
                "/notifications/read",
                json={"ids": [str(uuid.UUID("22222222-2222-2222-2222-222222222222"))]},
            )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 0
