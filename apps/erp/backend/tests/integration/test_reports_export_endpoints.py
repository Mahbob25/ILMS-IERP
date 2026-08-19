"""Integration tests for the report export/print endpoints (Phase 5).

Covers: CSV download (200, content-type, disposition), print HTML (200,
HTML body), role gates per report code (403), unknown code (404), and
unauthenticated requests (401). Service functions are patched.
"""

from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.reports.router import reports_router
from app.modules.reports import service as reports_service

WALLETS_SAMPLE = {
    "total_wallets": 1,
    "total_balance": 500.0,
    "total_frozen": 100.0,
    "total_available": 400.0,
    "wallets": [
        {"teacher_name": "Teacher One", "balance": 500.0, "frozen_balance": 100.0,
         "available": 400.0, "entry_count": 3},
    ],
}

STUDENT_SAMPLE = {
    "total_students": 1,
    "active_count": 1,
    "unenrolled_count": 0,
    "status": "all",
    "students": [
        {"student_code": "STU001", "full_name": "Test Student", "email": "", "is_enrolled": True},
    ],
}

PNL_SAMPLE = {
    "total_revenue": 1000.0,
    "total_expenses": 300.0,
    "total_refunds": 50.0,
    "net_revenue": 650.0,
    "transaction_count": 10,
    "daily_breakdown": [],
    "unclosed_days": [],
}


def make_user(role_name: str, is_superadmin: bool = False):
    user = Mock()
    user.is_superadmin = is_superadmin
    user.role = Mock()
    user.role.name = role_name
    return user


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user=None):
        app = FastAPI()
        app.include_router(reports_router)
        app.dependency_overrides[get_db] = lambda: mock_db
        if current_user is not None:
            app.dependency_overrides[identity_deps.get_current_user] = lambda: current_user
        return app

    return _make


@pytest.fixture
def manager_user():
    return make_user("manager")


@pytest.fixture
def secretary_user():
    return make_user("secretary")


class TestExportCsvEndpoints:

    def test_manager_exports_csv(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/export.csv?locale=ar")

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert response.headers["content-disposition"].endswith('filename="teacher_wallets.csv"')
        assert "Teacher One" in response.text

    def test_csv_passes_query_params_to_service(
        self, app_factory, manager_user, monkeypatch
    ):
        stub = AsyncMock(return_value=PNL_SAMPLE)
        monkeypatch.setattr(reports_service, "get_pnl_report", stub)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/reports/pnl_summary/export.csv?start_date=2026-07-01&end_date=2026-07-02"
            )

        assert response.status_code == 200
        call_args = stub.call_args
        assert call_args.args[1].isoformat() == "2026-07-01"
        assert call_args.args[2].isoformat() == "2026-07-02"

    def test_csv_forbids_wrong_role(self, app_factory, secretary_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
        )
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/export.csv")

        assert response.status_code == 403

    def test_csv_unknown_code_404(self, app_factory, manager_user, monkeypatch):
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/not_a_report/export.csv")

        assert response.status_code == 404

    def test_csv_unauthenticated_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/export.csv")

        assert response.status_code == 401

    def test_csv_invalid_locale_422(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_student_register", AsyncMock(return_value=STUDENT_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/student_register/export.csv?locale=fr")

        assert response.status_code == 422


class TestPrintEndpoints:

    def test_print_returns_html(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/print?locale=ar")

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert "Teacher One" in response.text
        assert "<table>" in response.text

    def test_print_locale_english(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/print?locale=en")

        assert response.status_code == 200
        assert "Teacher Wallet Balances" in response.text

    def test_print_to_forbids_wrong_role(self, app_factory, secretary_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
        )
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/print")

        assert response.status_code == 403

    def test_print_unknown_code_404(self, app_factory, manager_user):
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/nope/print")

        assert response.status_code == 404

    def test_print_unauthenticated_401(self, app_factory):
        app = app_factory()
        with TestClient(app) as client:
            response = client.get("/reports/teacher_wallets/print")

        assert response.status_code == 401

    def test_print_for_student_register_uses_status_filter(
        self, app_factory, manager_user, monkeypatch
    ):
        stub = AsyncMock(return_value=STUDENT_SAMPLE)
        monkeypatch.setattr(reports_service, "get_student_register", stub)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/student_register/print?status=enrolled")

        assert response.status_code == 200
        assert "Test Student" in response.text
        assert stub.call_args.kwargs["status"] == "enrolled"