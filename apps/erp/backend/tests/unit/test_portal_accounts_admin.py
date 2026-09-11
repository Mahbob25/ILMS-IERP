"""Tests for the portal-account admin API (list/search, reset, activate/
deactivate/unlock, parent linking, and superadmin impersonation).

These exercise the router via a FastAPI app built from the router itself and
stub the service layer, so no database is required.
"""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.modules.identity.dependencies import get_current_user
from app.modules.portal_accounts import service as portal_service
from app.modules.portal_accounts.router import portal_accounts_router


class _FakeResult:
    def __init__(self, rows=None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._scalar


def _user(role="manager", is_superadmin=False):
    return SimpleNamespace(
        id=uuid.uuid4(), role=SimpleNamespace(name=role), is_superadmin=is_superadmin
    )


def _app_for(user):
    app = FastAPI()
    app.include_router(portal_accounts_router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    return app


async def _request(app, method, url, **kwargs):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, url, **kwargs)


# --- Routing ---

def test_router_paths():
    paths = {route.path for route in portal_accounts_router.routes}
    assert "/portal-accounts" in paths
    assert "/portal-accounts/{user_id}" in paths
    assert "/portal-accounts/{user_id}/reset-password" in paths
    assert "/portal-accounts/{user_id}/activate" in paths
    assert "/portal-accounts/{user_id}/deactivate" in paths
    assert "/portal-accounts/{user_id}/unlock" in paths
    assert "/portal-accounts/{user_id}/links" in paths
    assert "/portal-accounts/{user_id}/links/{student_id}" in paths
    assert "/portal-accounts/{user_id}/impersonate" in paths


# --- RBAC ---

def test_teacher_cannot_list_accounts():
    app = _app_for(_user(role="teacher"))
    response = asyncio.run(_request(app, "GET", "/api/v1/portal-accounts"))
    assert response.status_code == 403


def test_manager_can_list_accounts():
    app = _app_for(_user(role="manager"))
    with patch.object(
        portal_service, "list_portal_accounts", new_callable=AsyncMock
    ) as mock_list:
        mock_list.return_value = ([], 0)
        response = asyncio.run(_request(app, "GET", "/api/v1/portal-accounts"))
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


def test_impersonate_forbidden_for_manager():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with patch.object(
        portal_service, "get_portal_account", new_callable=AsyncMock
    ) as mock_get:
        mock_get.return_value = {"id": user_id, "is_active": True, "account_type": "student"}
        response = asyncio.run(
            _request(app, "POST", f"/api/v1/portal-accounts/{user_id}/impersonate")
        )
    assert response.status_code == 403


def test_impersonate_returns_sso_url_for_superadmin():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="superadmin", is_superadmin=True))
    with (
        patch.object(portal_service, "get_portal_account", new_callable=AsyncMock) as mock_get,
        patch(
            "app.modules.portal_accounts.router.create_sso_ticket", return_value="TICKET"
        ),
        patch(
            "app.modules.portal_accounts.router.create_audit_log", new_callable=AsyncMock
        ),
    ):
        mock_get.return_value = {"id": user_id, "is_active": True, "account_type": "student"}
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/impersonate?locale=en",
            )
        )
    assert response.status_code == 200
    assert response.json()["url"].endswith("/en/login?ticket=TICKET")


def test_impersonate_rejects_deactivated_account():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="superadmin", is_superadmin=True))
    with patch.object(
        portal_service, "get_portal_account", new_callable=AsyncMock
    ) as mock_get:
        mock_get.return_value = {"id": user_id, "is_active": False, "account_type": "student"}
        response = asyncio.run(
            _request(app, "POST", f"/api/v1/portal-accounts/{user_id}/impersonate")
        )
    assert response.status_code == 422


# --- Reset password ---

def test_reset_password_phone_mode_uses_phone():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="secretary"))
    with (
        patch.object(portal_service, "get_portal_account", new_callable=AsyncMock) as mock_get,
        patch.object(portal_service, "set_portal_password", new_callable=AsyncMock) as mock_set,
        patch(
            "app.modules.portal_accounts.router.create_audit_log", new_callable=AsyncMock
        ),
    ):
        mock_get.return_value = {
            "id": user_id,
            "email": "a@b.c",
            "phone": "774257025",
            "is_active": True,
        }
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/reset-password",
                json={"mode": "phone"},
            )
        )
    assert response.status_code == 200
    assert response.json()["new_password"] == "774257025"
    mock_set.assert_awaited_once()
    assert mock_set.await_args.args[2] == "774257025"


def test_reset_password_phone_mode_without_phone_422():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with patch.object(
        portal_service, "get_portal_account", new_callable=AsyncMock
    ) as mock_get:
        mock_get.return_value = {"id": user_id, "email": None, "phone": None, "is_active": True}
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/reset-password",
                json={"mode": "phone"},
            )
        )
    assert response.status_code == 422


def test_reset_password_custom_rejects_weak_password():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="manager"))
    response = asyncio.run(
        _request(
            app,
            "POST",
            f"/api/v1/portal-accounts/{user_id}/reset-password",
            json={"mode": "custom", "new_password": "weak"},
        )
    )
    assert response.status_code == 422


def test_reset_password_missing_account_404():
    user_id = uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with patch.object(
        portal_service, "get_portal_account", new_callable=AsyncMock
    ) as mock_get:
        mock_get.return_value = None
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/reset-password",
                json={"mode": "phone"},
            )
        )
    assert response.status_code == 404


# --- Parent linking ---

def test_link_rejected_for_student_account():
    user_id, student_id = uuid.uuid4(), uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with (
        patch.object(portal_service, "get_portal_account", new_callable=AsyncMock) as mock_get,
        patch.object(portal_service, "student_exists", new_callable=AsyncMock) as mock_student,
    ):
        mock_get.return_value = {"id": user_id, "account_type": "student", "is_active": True}
        mock_student.return_value = True
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/links",
                json={"student_id": str(student_id)},
            )
        )
    assert response.status_code == 422


def test_link_unknown_student_404():
    user_id, student_id = uuid.uuid4(), uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with (
        patch.object(portal_service, "get_portal_account", new_callable=AsyncMock) as mock_get,
        patch.object(portal_service, "student_exists", new_callable=AsyncMock) as mock_student,
    ):
        mock_get.return_value = {"id": user_id, "account_type": "parent", "is_active": True}
        mock_student.return_value = False
        response = asyncio.run(
            _request(
                app,
                "POST",
                f"/api/v1/portal-accounts/{user_id}/links",
                json={"student_id": str(student_id)},
            )
        )
    assert response.status_code == 404


def test_unlink_missing_link_404():
    user_id, student_id = uuid.uuid4(), uuid.uuid4()
    app = _app_for(_user(role="manager"))
    with (
        patch.object(portal_service, "get_portal_account", new_callable=AsyncMock) as mock_get,
        patch.object(
            portal_service, "unlink_parent_from_student", new_callable=AsyncMock
        ) as mock_unlink,
    ):
        mock_get.return_value = {"id": user_id, "account_type": "parent", "is_active": True}
        mock_unlink.return_value = 0
        response = asyncio.run(
            _request(
                app, "DELETE", f"/api/v1/portal-accounts/{user_id}/links/{student_id}"
            )
        )
    assert response.status_code == 404


# --- Service-level filtering / SQL safety ---

def test_account_where_builds_search_and_filters():
    where, params = portal_service._account_where("ali", "parent", "locked")
    assert "g.id IS NOT NULL" in where
    assert "locked_until > now()" in where
    assert params["q"] == "%ali%"


def test_account_where_empty_when_no_filters():
    where, params = portal_service._account_where(None, "all", "all")
    assert where == ""
    assert params == {}


def test_list_uses_whitelisted_sort_column():
    db = AsyncMock()
    captured = {}

    async def execute(statement, params=None):
        sql = str(statement)
        if sql.strip().upper().startswith("SELECT COUNT"):
            return _FakeResult(scalar=1)
        captured["sql"] = sql
        return _FakeResult(rows=[])

    db.execute = AsyncMock(side_effect=execute)

    asyncio.run(
        portal_service.list_portal_accounts(
            db, sort_by="u.password_hash; DROP TABLE portal.users", sort_order="asc"
        )
    )
    assert "password_hash" not in captured["sql"]
    assert "ORDER BY u.created_at ASC" in captured["sql"]


def test_set_portal_active_deactivate_revokes_tokens():
    db = AsyncMock()
    sqls = []

    async def execute(statement, params=None):
        sqls.append(str(statement))
        return _FakeResult(
            rows=[
                {
                    "id": uuid.uuid4(),
                    "is_active": False,
                    "failed_login_attempts": 0,
                    "locked_until": None,
                }
            ]
        )

    db.execute = AsyncMock(side_effect=execute)
    asyncio.run(portal_service.set_portal_active(db, uuid.uuid4(), False))
    assert any("portal.refresh_tokens" in sql for sql in sqls)


def test_set_portal_active_activate_keeps_tokens():
    db = AsyncMock()
    sqls = []

    async def execute(statement, params=None):
        sqls.append(str(statement))
        return _FakeResult(
            rows=[
                {
                    "id": uuid.uuid4(),
                    "is_active": True,
                    "failed_login_attempts": 0,
                    "locked_until": None,
                }
            ]
        )

    db.execute = AsyncMock(side_effect=execute)
    asyncio.run(portal_service.set_portal_active(db, uuid.uuid4(), True))
    assert not any("portal.refresh_tokens" in sql for sql in sqls)


def test_unlock_clears_lockout():
    db = AsyncMock()
    captured = {}

    async def execute(statement, params=None):
        captured["sql"] = str(statement)
        return _FakeResult(
            rows=[
                {
                    "id": uuid.uuid4(),
                    "is_active": True,
                    "failed_login_attempts": 0,
                    "locked_until": None,
                }
            ]
        )

    db.execute = AsyncMock(side_effect=execute)
    asyncio.run(portal_service.unlock_portal_account(db, uuid.uuid4()))
    assert "locked_until = NULL" in captured["sql"]
    assert "failed_login_attempts = 0" in captured["sql"]


# --- Deleting a student disables their portal login ---

def test_delete_student_deactivates_portal_account():
    from app.modules.academic import service as academic_service

    student = SimpleNamespace(id=uuid.uuid4(), deleted_at=None)
    db = AsyncMock()

    with (
        patch.object(academic_service, "get_student", new_callable=AsyncMock) as mock_get,
        patch.object(
            portal_service, "deactivate_portal_account_for_student", new_callable=AsyncMock
        ) as mock_deactivate,
    ):
        mock_get.return_value = student
        result = asyncio.run(academic_service.delete_student(db, student.id))

    assert result is True
    mock_deactivate.assert_awaited_once()
