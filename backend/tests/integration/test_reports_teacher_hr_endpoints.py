"""Integration tests for the Teacher/HR report endpoints (Phase 4, group C).

Covers: 200 response shape, 401 unauthenticated, 403 for disallowed roles.
Service functions are patched — these tests exercise the route wiring and
role gates, not the aggregation logic (covered by unit tests).
"""

import uuid
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.reports.router import reports_router
from app.modules.reports import service as reports_service

TID1 = str(uuid.uuid4())
TID2 = str(uuid.uuid4())

WALLETS_SAMPLE = {
    "total_wallets": 2,
    "total_balance": 300.0,
    "total_frozen": 20.0,
    "total_available": 280.0,
    "wallets": [
        {"teacher_id": TID1, "teacher_name": "Teacher A", "balance": 100.0,
         "frozen_balance": 20.0, "available": 80.0, "entry_count": 5},
        {"teacher_id": TID2, "teacher_name": "Teacher B", "balance": 200.0,
         "frozen_balance": 0.0, "available": 200.0, "entry_count": 3},
    ],
}

PAYOUTS_SAMPLE = {
    "start_date": "2026-07-01",
    "end_date": "2026-07-31",
    "total_withdrawn": 80.0,
    "withdrawal_count": 2,
    "by_teacher": [
        {"teacher_id": TID1, "teacher_name": "Teacher A",
         "total_withdrawn": 80.0, "withdrawal_count": 2},
    ],
    "withdrawals": [
        {"withdrawal_id": str(uuid.uuid4()), "amount": 50.0, "date": "2026-07-05",
         "receipt_number": "V-001", "teacher_name": "Teacher A"},
        {"withdrawal_id": str(uuid.uuid4()), "amount": 30.0, "date": "2026-07-08",
         "receipt_number": "V-002", "teacher_name": "Teacher A"},
    ],
}

PAYROLL_SAMPLE = {
    "month": "2026-07",
    "total_members": 1,
    "total_salary": 500.0,
    "total_drawn": 100.0,
    "total_remaining": 400.0,
    "members": [
        {"id": str(uuid.uuid4()), "full_name": "Sec A", "role": "secretary",
         "monthly_salary": 500.0, "total_drawn_this_month": 100.0,
         "remaining_balance": 400.0},
    ],
}

GRADES_SAMPLE = {
    "total_sections": 1,
    "total_graded_students": 3,
    "overall_average": 78.3,
    "sections": [
        {"section_id": str(uuid.uuid4()), "course_name": "Math", "teacher_name": "Teacher A",
         "status": "active", "graded_count": 3, "average_score": 78.3,
         "distribution": {"Excellent": 1, "Very Good": 1, "Fail": 1}},
    ],
}

HR_PATHS = [
    "/reports/teachers/wallets",
    "/reports/teachers/payouts",
    "/reports/payroll",
    "/reports/grades",
]


def make_user(role_name: str, is_superadmin: bool = False):
    user = Mock()
    user.is_superadmin = is_superadmin
    user.role = Mock()
    user.role.name = role_name
    return user


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


@pytest.fixture
def accountant_user():
    return make_user("accountant")


def _patch_all(monkeypatch):
    """Stub every HR service function with a canned sample."""
    monkeypatch.setattr(
        reports_service, "get_teacher_wallets", AsyncMock(return_value=WALLETS_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_teacher_payouts", AsyncMock(return_value=PAYOUTS_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_staff_payroll_report", AsyncMock(return_value=PAYROLL_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_grade_summary", AsyncMock(return_value=GRADES_SAMPLE)
    )


class TestTeacherHrEndpoints:

    def test_manager_gets_wallets_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/teachers/wallets")

        assert response.status_code == 200
        data = response.json()
        assert data["total_wallets"] == 2
        assert data["wallets"][0]["teacher_name"] == "Teacher A"

    def test_manager_gets_payouts_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/reports/teachers/payouts?start_date=2026-07-01&end_date=2026-07-31"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total_withdrawn"] == 80.0
        assert data["by_teacher"][0]["withdrawal_count"] == 2

    def test_manager_gets_payroll_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/payroll?month=2026-07-01")

        assert response.status_code == 200
        data = response.json()
        assert data["month"] == "2026-07"
        assert data["members"][0]["full_name"] == "Sec A"

    def test_manager_gets_grades_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/grades")

        assert response.status_code == 200
        data = response.json()
        assert data["total_graded_students"] == 3
        assert data["sections"][0]["distribution"]["Excellent"] == 1

    def test_teacher_allowed_on_grades_only(self, app_factory, teacher_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=teacher_user)
        with TestClient(app) as client:
            assert client.get("/reports/grades").status_code == 200
            assert client.get("/reports/teachers/wallets").status_code == 403
            assert client.get("/reports/teachers/payouts").status_code == 403
            assert client.get("/reports/payroll").status_code == 403

    def test_secretary_allowed_on_payroll_only(self, app_factory, secretary_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            assert client.get("/reports/payroll").status_code == 200
            assert client.get("/reports/teachers/wallets").status_code == 403
            assert client.get("/reports/teachers/payouts").status_code == 403
            assert client.get("/reports/grades").status_code == 403

    def test_accountant_blocked_from_all_hr(self, app_factory, accountant_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=accountant_user)
        with TestClient(app) as client:
            for path in HR_PATHS:
                response = client.get(path)
                assert response.status_code == 403, f"{path} should block accountant"

    def test_unauthenticated_401(self, app_factory, mock_db):
        app = app_factory()  # no current_user override -> real auth dependency
        with TestClient(app) as client:
            for path in HR_PATHS:
                response = client.get(path)
                assert response.status_code == 401, f"{path} should require auth"

    def test_superadmin_allowed(self, app_factory, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=make_user("superadmin", is_superadmin=True))
        with TestClient(app) as client:
            for path in HR_PATHS:
                response = client.get(path)
                assert response.status_code == 200, f"{path} should allow superadmin"
