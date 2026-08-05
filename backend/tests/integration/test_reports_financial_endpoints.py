"""Integration tests for the financial report endpoints (Phase 2).

Covers: 200 response shape, 401 unauthenticated, 403 for disallowed roles.
Service functions are patched — these tests exercise the route wiring and
role gates, not the aggregation logic (covered by unit tests).
"""

from datetime import date
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.reports.router import reports_router
from app.modules.reports import service as reports_service

LEDGER_DATE = date(2026, 7, 14)

PNL_SAMPLE = {
    "total_revenue": 1000.0,
    "total_expenses": 300.0,
    "total_refunds": 50.0,
    "net_revenue": 650.0,
    "transaction_count": 10,
    "avg_per_student": 100.0,
    "comparison": {"current_period": 1000.0, "previous_period": 800.0, "change_pct": 25.0},
    "monthly_trend": [],
    "by_course": [],
    "by_teacher": [],
    "daily_breakdown": [
        {"date": "2026-07-01", "revenue": 500.0, "expenses": 100.0, "refunds": 0.0, "closure_status": "closed"},
        {"date": "2026-07-02", "revenue": 500.0, "expenses": 200.0, "refunds": 50.0, "closure_status": "pending"},
    ],
    "unclosed_days": ["2026-07-02"],
}

LEDGER_SAMPLE = {
    "date": "2026-07-14",
    "total_payments_in": 500.0,
    "total_expenses_out": 100.0,
    "total_refunds_out": 0.0,
    "net_cash_flow": 400.0,
    "status": "closed",
    "closed_by_manager_id": None,
    "payments": [],
    "expenses": [],
    "refunds": [],
    "prev_date": "2026-07-13",
    "next_date": "2026-07-15",
}

CLOSURES_SAMPLE = [
    {"date": "2026-07-14", "status": "closed", "closed_by_manager_id": None,
     "total_payments_in": 500.0, "total_expenses_out": 100.0,
     "total_refunds_out": 0.0, "net_cash_flow": 400.0}
]

RECONCILIATION_SAMPLE = {
    "report_date": "2026-07-14",
    "generated_at": "2026-07-14T10:00:00+00:00",
    "summary": {
        "total_active_sections": 45,
        "newly_ready_for_completion": 1,
        "sections_cancelled_today": 0,
        "cancellations": [],
        "refunds_disbursed_today": [],
        "overrides_today": [],
        "overdue_sections_count": 2,
        "unclaimed_pending_refunds_total": 15000.0,
    },
    "closure_status": "closed",
    "is_closed": True,
}


def make_user(role_name: str, is_superadmin: bool = False):
    user = Mock()
    user.is_superadmin = is_superadmin
    user.role = Mock()
    user.role.name = role_name
    return user


@pytest.fixture
def mock_result():
    def _make(rows=None, scalar=None):
        m = Mock()
        m.fetchall.return_value = rows if rows is not None else []
        m.scalar.return_value = scalar
        return m

    return _make


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user=None, override_get_db=True):
        app = FastAPI()
        app.include_router(reports_router)
        if override_get_db:
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


@pytest.fixture
def teacher_user():
    return make_user("teacher")


class TestFinancialReportEndpoints:

    def test_manager_gets_pnl_shape(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_pnl_report", AsyncMock(return_value=PNL_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/pnl?start_date=2026-07-01&end_date=2026-07-02")

        assert response.status_code == 200
        data = response.json()
        assert data["net_revenue"] == 650.0
        assert data["unclosed_days"] == ["2026-07-02"]
        assert data["daily_breakdown"][0]["closure_status"] == "closed"

    def test_manager_gets_ledger_shape(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_daily_ledger_report", AsyncMock(return_value=LEDGER_SAMPLE)
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/ledger/2026-07-14")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "closed"
        assert data["total_payments_in"] == 500.0
        assert data["prev_date"] == "2026-07-13"

    def test_manager_gets_reconciliation_shape(self, app_factory, manager_user, monkeypatch):
        monkeypatch.setattr(
            reports_service,
            "get_daily_reconciliation_report",
            AsyncMock(return_value=RECONCILIATION_SAMPLE),
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/reconciliation/2026-07-14")

        assert response.status_code == 200
        data = response.json()
        assert data["is_closed"] is True
        assert data["summary"]["total_active_sections"] == 45

    def test_unauthenticated_401(self, app_factory, mock_db):
        app = app_factory()  # no current_user override → real auth dependency
        with TestClient(app) as client:
            for path in [
                "/reports/financial/pnl",
                "/reports/financial/ledger/2026-07-14",
                "/reports/financial/closures",
                "/reports/financial/reconciliation/2026-07-14",
            ]:
                response = client.get(path)
                assert response.status_code == 401, f"{path} should require auth"

    def test_secretary_blocked_from_pnl(self, app_factory, secretary_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_pnl_report", AsyncMock(return_value=PNL_SAMPLE)
        )
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/pnl")

        assert response.status_code == 403

    def test_secretary_blocked_from_closures(self, app_factory, secretary_user, monkeypatch):
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/closures")

        assert response.status_code == 403

    def test_secretary_blocked_from_reconciliation(self, app_factory, secretary_user, monkeypatch):
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/reconciliation/2026-07-14")

        assert response.status_code == 403

    def test_accountant_allowed_on_ledger(self, app_factory, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_daily_ledger_report", AsyncMock(return_value=LEDGER_SAMPLE)
        )
        app = app_factory(current_user=make_user("accountant"))
        with TestClient(app) as client:
            response = client.get("/reports/financial/ledger/2026-07-14")

        assert response.status_code == 200

    def test_teacher_blocked_from_pnl(self, app_factory, teacher_user, monkeypatch):
        monkeypatch.setattr(
            reports_service, "get_pnl_report", AsyncMock(return_value=PNL_SAMPLE)
        )
        app = app_factory(current_user=teacher_user)
        with TestClient(app) as client:
            response = client.get("/reports/financial/pnl")

        assert response.status_code == 403

    def test_catalog_requires_permission(self, app_factory, secretary_user, mock_db, mock_result):
        denied_db = Mock()
        denied_db.execute = AsyncMock(return_value=mock_result())
        denied_db.execute.return_value.first.return_value = None
        app = app_factory(current_user=secretary_user, override_get_db=False)
        app.dependency_overrides[get_db] = lambda: denied_db

        with TestClient(app) as client:
            response = client.get("/reports/catalog")

        assert response.status_code == 403

    def test_catalog_allowed_with_permission(self, app_factory, secretary_user, mock_db):
        granted_db = Mock()
        granted_db.execute = AsyncMock(return_value=Mock())
        granted_db.execute.return_value.first.return_value = Mock()
        app = app_factory(current_user=secretary_user, override_get_db=False)
        app.dependency_overrides[get_db] = lambda: granted_db

        with TestClient(app) as client:
            response = client.get("/reports/catalog")

        assert response.status_code == 200
        assert response.json()["reports"]
