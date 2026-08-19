"""Integration tests for the operational report endpoints (Phase 3, group B).

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

SID1 = str(uuid.uuid4())
SID2 = str(uuid.uuid4())

STUDENTS_SAMPLE = {
    "total_students": 2,
    "active_count": 1,
    "unenrolled_count": 1,
    "status": "all",
    "students": [
        {"student_id": SID1, "student_code": "S1", "full_name": "Alice",
         "email": "a@x.com", "is_enrolled": True},
        {"student_id": SID2, "student_code": "S2", "full_name": "Bob",
         "email": None, "is_enrolled": False},
    ],
}

ENROLLMENTS_SAMPLE = {
    "start_date": "2026-07-01",
    "end_date": "2026-07-31",
    "total_enrollments": 5,
    "by_course": [{"course_name": "Math", "enrollments": 3}],
    "by_section": [{"section_id": SID1, "course_name": "Math", "enrollments": 3}],
}

OCCUPANCY_SAMPLE = {
    "total_sections": 1,
    "total_capacity": 30,
    "total_enrolled": 15,
    "overall_occupancy_rate": 50.0,
    "sections": [
        {"section_id": SID1, "course_name": "Math", "teacher_name": "Teacher A",
         "status": "active", "enrolled_count": 15, "capacity": 30,
         "occupancy_rate": 50.0},
    ],
}

ATTENDANCE_SAMPLE = {
    "start_date": "2026-07-01",
    "end_date": "2026-07-31",
    "total_sections": 1,
    "total_sessions": 5,
    "total_records": 50,
    "sections": [
        {"section_id": SID1, "course_name": "Math", "teacher_name": "Teacher A",
         "status": "active", "enrolled_count": 10, "sessions_count": 5,
         "records_count": 50, "coverage_rate": 100.0},
    ],
}

OPERATIONAL_PATHS = [
    "/reports/students",
    "/reports/enrollments",
    "/reports/sections/occupancy",
    "/reports/attendance",
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


def _patch_all(monkeypatch):
    """Stub every operational service function with a canned sample."""
    monkeypatch.setattr(
        reports_service, "get_student_register", AsyncMock(return_value=STUDENTS_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_enrollment_summary", AsyncMock(return_value=ENROLLMENTS_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_section_occupancy", AsyncMock(return_value=OCCUPANCY_SAMPLE)
    )
    monkeypatch.setattr(
        reports_service, "get_attendance_summary", AsyncMock(return_value=ATTENDANCE_SAMPLE)
    )


class TestOperationalEndpoints:

    def test_manager_gets_student_register_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/students")

        assert response.status_code == 200
        data = response.json()
        assert data["total_students"] == 2
        assert data["active_count"] == 1
        assert data["students"][0]["full_name"] == "Alice"

    def test_manager_gets_enrollment_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/reports/enrollments?start_date=2026-07-01&end_date=2026-07-31"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total_enrollments"] == 5
        assert data["by_course"][0]["course_name"] == "Math"

    def test_manager_gets_occupancy_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/reports/sections/occupancy")

        assert response.status_code == 200
        data = response.json()
        assert data["overall_occupancy_rate"] == 50.0
        assert data["sections"][0]["course_name"] == "Math"

    def test_manager_gets_attendance_shape(self, app_factory, manager_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/reports/attendance?start_date=2026-07-01&end_date=2026-07-31"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total_sessions"] == 5
        assert data["sections"][0]["coverage_rate"] == 100.0

    def test_secretary_allowed_on_all_operational(self, app_factory, secretary_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            for path in OPERATIONAL_PATHS:
                response = client.get(path)
                assert response.status_code == 200, f"{path} should allow secretary"

    def test_teacher_blocked_from_operational(self, app_factory, teacher_user, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=teacher_user)
        with TestClient(app) as client:
            for path in OPERATIONAL_PATHS:
                response = client.get(path)
                assert response.status_code == 403, f"{path} should block teacher"

    def test_unauthenticated_401(self, app_factory, mock_db):
        app = app_factory()  # no current_user override -> real auth dependency
        with TestClient(app) as client:
            for path in OPERATIONAL_PATHS:
                response = client.get(path)
                assert response.status_code == 401, f"{path} should require auth"

    def test_superadmin_allowed(self, app_factory, monkeypatch):
        _patch_all(monkeypatch)
        app = app_factory(current_user=make_user("superadmin", is_superadmin=True))
        with TestClient(app) as client:
            for path in OPERATIONAL_PATHS:
                response = client.get(path)
                assert response.status_code == 200, f"{path} should allow superadmin"
