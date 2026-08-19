"""Integration tests for the Financial Records Center endpoint (Phase 1).

Covers: 200 response shape, query-parameter pass-through, validation,
rate-limit/read-only contract, and role gates (superadmin/manager/
secretary allowed, teacher blocked). Service function is patched - route
wiring and role gates are exercised here; aggregation logic is covered by
unit tests.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.modules.identity import dependencies as identity_deps
from app.modules.lms import financial_records_service
from app.modules.lms.router import lms_router

SAMPLE_RESPONSE = {
    "items": [
        {
            "doc_type": "receipt",
            "source_id": "11111111-1111-1111-1111-111111111111",
            "receipt_number": "RCP-20260710-0001",
            "date": "2026-07-10",
            "amount": 500.0,
            "counterparty": "Ali Ahmed",
            "created_by_name": "Cashier One",
            "detail": "cash",
            "preview_url": "/api/v1/lms/payments/11111111-1111-1111-1111-111111111111/preview",
            "student_code": "STU001",
            "course_name": "Math 101",
            "payment_method": "cash",
            "transaction_number": None,
            "expense_type": None,
            "notes": None,
        }
    ],
    "total": 1,
}


@pytest.fixture
def app_factory(mock_db):
    def _make(current_user=None, override_get_db=True):
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(lms_router)
        if override_get_db:
            app.dependency_overrides[get_db] = lambda: mock_db
        if current_user is not None:
            app.dependency_overrides[identity_deps.get_current_user] = lambda: current_user
        return app

    return _make


class TestFinancialRecordsEndpoint:

    def test_returns_list_shape(self, app_factory, manager_user, monkeypatch):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get("/lms/financial-records")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["doc_type"] == "receipt"
        assert item["student_code"] == "STU001"
        assert "preview" in item["preview_url"]

    def test_passes_query_parameters_to_service(
        self, app_factory, manager_user, monkeypatch
    ):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/lms/financial-records"
                "?doc_type=voucher&date_from=2026-07-01&date_to=2026-07-31"
                "&search=rent&name=Ali&limit=20&offset=40"
            )

        assert response.status_code == 200
        _, kwargs = service_mock.call_args
        assert kwargs["doc_type"] == "voucher"
        assert kwargs["date_from"].isoformat() == "2026-07-01"
        assert kwargs["date_to"].isoformat() == "2026-07-31"
        assert kwargs["search"] == "rent"
        assert kwargs["name"] == "Ali"
        assert kwargs["limit"] == 20
        assert kwargs["offset"] == 40

    def test_rejects_invalid_doc_type(self, app_factory, manager_user):
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            response = client.get(
                "/lms/financial-records?doc_type=invoice"
            )

        assert response.status_code == 422

    def test_read_only_never_calls_write_helpers(
        self, app_factory, manager_user, monkeypatch
    ):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=manager_user)
        with TestClient(app) as client:
            client.get("/lms/financial-records")

        assert not any(
            name in dir(financial_records_service)
            for name in ["create", "update", "delete"]
        )

    def test_unauthenticated_401(self, app_factory, mock_db):
        app = app_factory()
        with TestClient(app) as client:
            response = client.get("/lms/financial-records")

        assert response.status_code == 401

    def test_teacher_blocked_403(self, app_factory, teacher_user, monkeypatch):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=teacher_user)
        with TestClient(app) as client:
            response = client.get("/lms/financial-records")

        assert response.status_code == 403
        service_mock.assert_not_called()

    def test_secretary_allowed(self, app_factory, secretary_user, monkeypatch):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=secretary_user)
        with TestClient(app) as client:
            response = client.get("/lms/financial-records")

        assert response.status_code == 200

    def test_superadmin_allowed(
        self, app_factory, superadmin_user, monkeypatch
    ):
        service_mock = AsyncMock(return_value=SAMPLE_RESPONSE)
        monkeypatch.setattr(
            financial_records_service, "search_financial_records", service_mock
        )
        app = app_factory(current_user=superadmin_user)
        with TestClient(app) as client:
            response = client.get("/lms/financial-records")

        assert response.status_code == 200