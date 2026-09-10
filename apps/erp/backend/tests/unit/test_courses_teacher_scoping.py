"""Route-wiring tests for teacher scoping of the academic list endpoints.

Covers GET /academic/courses and GET /academic/course-sections: a teacher must be
scoped to their own employee id, other roles must stay unscoped, and a teacher
without an employee id must fail closed instead of leaking the full list.

Service functions are patched — these tests exercise the route wiring, not the
query construction.
"""

import uuid
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.academic.router import academic_router
from app.modules.academic import service as academic_service


EMPLOYEE_ID = uuid.uuid4()
EMPTY_PAGE = {"items": [], "total": 0}


def make_user(role_name: str, employee_id=EMPLOYEE_ID, is_superadmin: bool = False):
    user = Mock()
    user.is_superadmin = is_superadmin
    user.employee_id = employee_id
    user.role = Mock()
    user.role.name = role_name
    return user


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user):
        app = FastAPI()
        app.include_router(academic_router)
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[identity_deps.get_current_user] = lambda: current_user
        return app

    return _make


@pytest.fixture
def courses_service(monkeypatch):
    mock = AsyncMock(return_value=EMPTY_PAGE)
    monkeypatch.setattr(academic_service, "list_courses", mock)
    return mock


@pytest.fixture
def sections_service(monkeypatch):
    mock = AsyncMock(return_value=EMPTY_PAGE)
    monkeypatch.setattr(academic_service, "list_course_sections", mock)
    return mock


class TestCoursesTeacherScoping:

    def test_teacher_is_scoped_to_own_employee(self, app_factory, courses_service):
        user = make_user("teacher")
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/courses?limit=1000")

        assert response.status_code == 200
        assert courses_service.await_args.kwargs["teacher_id"] == EMPLOYEE_ID

    def test_manager_is_not_scoped(self, app_factory, courses_service):
        user = make_user("manager")
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/courses?limit=1000")

        assert response.status_code == 200
        assert courses_service.await_args.kwargs["teacher_id"] is None

    def test_superadmin_is_not_scoped(self, app_factory, courses_service):
        user = make_user("superadmin", is_superadmin=True)
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/courses?limit=1000")

        assert response.status_code == 200
        assert courses_service.await_args.kwargs["teacher_id"] is None

    def test_teacher_without_employee_fails_closed(self, app_factory, courses_service):
        user = make_user("teacher", employee_id=None)
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/courses?limit=1000")

        assert response.status_code == 200
        assert response.json() == EMPTY_PAGE
        courses_service.assert_not_awaited()


class TestCourseSectionsTeacherScoping:

    def test_teacher_is_scoped_to_own_employee(self, app_factory, sections_service):
        user = make_user("teacher")
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/course-sections?limit=1000")

        assert response.status_code == 200
        assert sections_service.await_args.kwargs["teacher_id"] == EMPLOYEE_ID

    def test_secretary_is_not_scoped(self, app_factory, sections_service):
        user = make_user("secretary")
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/course-sections?limit=1000")

        assert response.status_code == 200
        assert sections_service.await_args.kwargs["teacher_id"] is None

    def test_teacher_without_employee_fails_closed(self, app_factory, sections_service):
        user = make_user("teacher", employee_id=None)
        with TestClient(app_factory(user)) as client:
            response = client.get("/academic/course-sections?limit=1000")

        assert response.status_code == 200
        assert response.json() == EMPTY_PAGE
        sections_service.assert_not_awaited()
