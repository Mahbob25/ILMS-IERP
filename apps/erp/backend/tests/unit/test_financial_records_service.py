"""Unit tests for the Financial Records Center service (Phase 1).

Covers query construction, source-specific mapping, three-way merge,
global sorting, pagination, and total aggregation. SqlAlchemy statements
are never executed - the helper builders are asserted on compiled SQL,
and the service path is exercised against a mock AsyncSession.
"""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, Mock

import pytest

from app.modules.lms import financial_records_service as frs

PAYMENT_ID = "11111111-1111-1111-1111-111111111111"
EXPENSE_ID = "22222222-2222-2222-2222-222222222222"
REFUND_ID = "33333333-3333-3333-3333-333333333333"

PAYMENT_ROW = (
    PAYMENT_ID, "RCP-20260710-0001", date(2026, 7, 10), Decimal("500.00"),
    "cash", "TRX-01", "Ali Ahmed", "STU001", "Math 101", "Cashier One",
)
EXPENSE_ROW = (
    EXPENSE_ID, "VCHR-20260711-0001", date(2026, 7, 11), Decimal("120.00"),
    "rent", "Office rent for July", "Landlord LLC", "Manager Two",
)
REFUND_ROW = (
    REFUND_ID, "REF-20260709-0001", date(2026, 7, 9), Decimal("80.00"),
    "Withdrew after drop", "Sara Khalid", "STU045", "Physics 202", "Secretary Roa",
)


def _mock_result(rows=None, scalar=None):
    result = Mock()
    result.fetchall.return_value = rows if rows is not None else []
    result.scalar.return_value = scalar
    return result


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def capture_side_effect(mock_db):
    """Replaces mock_db.execute with a wrapper that records compiled SQL and
    pops from a provided list of canned results."""

    def _install(results):
        executed = []
        results = list(results)

        async def _execute(statement, *args, **kwargs):
            executed.append(str(statement.compile()))
            return results.pop(0)

        mock_db.execute = AsyncMock(side_effect=_execute)
        return executed

    return _install


class TestSearchFinancialRecords:

    async def test_maps_rows_and_merges_three_sources(
        self, mock_db, capture_side_effect
    ):
        capture_side_effect(
            [
                _mock_result(rows=[PAYMENT_ROW]),
                _mock_result(rows=[], scalar=1),
                _mock_result(rows=[EXPENSE_ROW]),
                _mock_result(rows=[], scalar=1),
                _mock_result(rows=[REFUND_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        response = await frs.search_financial_records(mock_db)

        assert response.total == 3
        assert len(response.items) == 3
        doc_types = {item.doc_type for item in response.items}
        assert doc_types == {"receipt", "voucher", "refund"}

    async def test_refund_query_filters_on_utc_date(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[], scalar=0),
                _mock_result(rows=[], scalar=0),
                _mock_result(rows=[REFUND_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        await frs.search_financial_records(
            mock_db,
            doc_type="refund",
            date_from=date(2026, 7, 9),
            date_to=date(2026, 7, 9),
        )
        refund_sqls = [sql for sql in executed if "refunds" in sql]
        assert refund_sqls, "refund statements should have been executed"
        assert any("date(refunds.disbursed_at) >=" in sql for sql in refund_sqls)
        assert any("date(refunds.disbursed_at) <=" in sql for sql in refund_sqls)

    async def test_doc_type_receipt_skips_other_sources(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[PAYMENT_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        response = await frs.search_financial_records(mock_db, doc_type="receipt")

        assert response.total == 1
        assert len(response.items) == 1
        assert response.items[0].doc_type == "receipt"
        assert any("payments" in sql for sql in executed)
        assert not any("expenses" in sql for sql in executed)
        assert not any("refunds" in sql for sql in executed)

    async def test_doc_type_voucher_skips_other_sources(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[EXPENSE_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        response = await frs.search_financial_records(mock_db, doc_type="voucher")

        assert response.total == 1
        assert response.items[0].doc_type == "voucher"
        assert any("expenses" in sql for sql in executed)
        assert not any("payments" in sql for sql in executed)
        assert not any("refunds" in sql for sql in executed)

    async def test_doc_type_refund_skips_other_sources(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[REFUND_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        response = await frs.search_financial_records(mock_db, doc_type="refund")

        assert response.total == 1
        assert response.items[0].doc_type == "refund"
        assert any("refunds" in sql for sql in executed)
        assert not any("payments" in sql for sql in executed)
        assert not any("expenses" in sql for sql in executed)

    async def test_payments_search_and_name_filters_applied(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[PAYMENT_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        await frs.search_financial_records(
            mock_db, doc_type="receipt", search="RCP-2026", name="Ali"
        )

        payment_sql = next(sql for sql in executed if "payments" in sql)
        assert "lower(payments.receipt_number) LIKE" in payment_sql
        assert "lower(students.full_name) LIKE" in payment_sql

    async def test_expenses_search_and_name_filters_applied(
        self, mock_db, capture_side_effect
    ):
        executed = capture_side_effect(
            [
                _mock_result(rows=[EXPENSE_ROW]),
                _mock_result(rows=[], scalar=1),
            ]
        )

        await frs.search_financial_records(
            mock_db, doc_type="voucher", search="VCHR", name="Landlord"
        )

        expense_sql = next(sql for sql in executed if "expenses" in sql)
        assert "lower(expenses.receipt_number) LIKE" in expense_sql
        assert "lower(expenses.recipient_name) LIKE" in expense_sql

    async def test_merges_sorted_by_date_desc_then_receipt_number(
        self, mock_db, capture_side_effect
    ):
        older_payment = (
            "22222222-2222-2222-2222-222222222221", "RCP-20260708-0001", date(2026, 7, 8), Decimal("10.00"),
            "cash", None, "Bob", "STU002", "Course B", "",
        )
        newer_expense = (
            "44444444-4444-4444-4444-444444444444", "VCHR-20260712-0001", date(2026, 7, 12), Decimal("20.00"),
            "supplies", "Pens", "Office Shop", "",
        )
        capture_side_effect(
            [
                _mock_result(rows=[older_payment]),
                _mock_result(rows=[], scalar=1),
                _mock_result(rows=[newer_expense]),
                _mock_result(rows=[], scalar=1),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
            ]
        )

        response = await frs.search_financial_records(mock_db)

        assert [item.doc_type for item in response.items] == ["voucher", "receipt"]

    async def test_applies_limit_and_offset_in_python(
        self, mock_db, capture_side_effect
    ):
        ids = [
            "11111111-1111-1111-1111-111111111110",
            PAYMENT_ID,
            "22222222-2222-2222-2222-222222222221",
        ]
        rows = []
        for i in range(3):
            rows.append(
                (
                    ids[i], f"RCP-20260710-000{i + 1}", date(2026, 7, 10),
                    Decimal("10.00"), "cash", None, "Ali", "STU001", "Math", "",
                )
            )
        capture_side_effect(
            [
                _mock_result(rows=rows),
                _mock_result(rows=[], scalar=3),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
            ]
        )

        response = await frs.search_financial_records(mock_db, limit=2, offset=1)

        assert response.total == 3
        assert len(response.items) == 2
        assert response.items[0].source_id == uuid.UUID(PAYMENT_ID)
        assert response.items[1].source_id == uuid.UUID("22222222-2222-2222-2222-222222222221")

    async def test_totals_sum_across_sources(self, mock_db, capture_side_effect):
        capture_side_effect(
            [
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=5),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=2),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=7),
            ]
        )

        response = await frs.search_financial_records(mock_db)

        assert response.total == 14
        assert response.items == []

    async def test_empty_database_returns_empty_list(self, mock_db, capture_side_effect):
        capture_side_effect(
            [
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
                _mock_result(rows=[]),
                _mock_result(rows=[], scalar=0),
            ]
        )

        response = await frs.search_financial_records(mock_db)

        assert response.total == 0
        assert response.items == []


class TestMapping:

    def test_payment_map_builds_preview_url_and_detail(self):
        item = frs._map_payment(PAYMENT_ROW)

        assert item.doc_type == "receipt"
        assert item.source_id == uuid.UUID(PAYMENT_ID)
        assert item.receipt_number == "RCP-20260710-0001"
        assert item.date == date(2026, 7, 10)
        assert item.amount == 500.0
        assert item.counterparty == "Ali Ahmed"
        assert item.created_by_name == "Cashier One"
        assert item.payment_method == "cash"
        assert item.transaction_number == "TRX-01"
        assert item.student_code == "STU001"
        assert item.course_name == "Math 101"
        assert item.preview_url == "/api/v1/lms/payments/11111111-1111-1111-1111-111111111111/preview"

    def test_expense_map_composes_type_and_description(self):
        item = frs._map_expense(EXPENSE_ROW)

        assert item.doc_type == "voucher"
        assert item.detail == "rent: Office rent for July"
        assert item.expense_type == "rent"
        assert item.notes == "Office rent for July"
        assert item.amount == 120.0
        assert item.preview_url == "/api/v1/lms/expenses/22222222-2222-2222-2222-222222222222/preview"

    def test_expense_map_shortens_long_detail(self):
        long_description = "x" * 500
        row = EXPENSE_ROW[:5] + (long_description,) + EXPENSE_ROW[6:]
        item = frs._map_expense(row)

        assert len(item.detail) <= frs.DETAIL_MAX_LENGTH
        assert item.detail.endswith("...")

    def test_refund_map_uses_notes_and_student(self):
        item = frs._map_refund(REFUND_ROW)

        assert item.doc_type == "refund"
        assert item.counterparty == "Sara Khalid"
        assert item.notes == "Withdrew after drop"
        assert item.detail == "Withdrew after drop"
        assert item.student_code == "STU045"
        assert item.course_name == "Physics 202"
        assert item.preview_url == "/api/v1/lms/cashier/refunds/33333333-3333-3333-3333-333333333333/preview"

    def test_merge_records_sorts_receipt_before_voucher_on_same_date(
        self,
    ):
        expense_same_date = EXPENSE_ROW[:2] + (date(2026, 7, 10),) + EXPENSE_ROW[3:]
        items = frs.merge_records(
            payments=[PAYMENT_ROW], expenses=[expense_same_date], refunds=[]
        )

        assert [item.doc_type for item in items] == ["receipt", "voucher"]


class TestQueryBuilders:

    def test_payments_query_uses_limit_offset_plus_limit(self):
        statement = frs._payments_query(
            date_from=None, date_to=None, search=None, name=None,
            limit=50, offset=20,
        )
        sql = str(statement.compile())
        assert "LIMIT" in sql
        assert "payments.date DESC" in sql

    def test_refund_query_orders_by_disbursement_date_desc(self):
        statement = frs._refunds_query(
            date_from=None, date_to=None, search=None, name=None,
            limit=50, offset=0,
        )
        sql = str(statement.compile())
        assert "date(refunds.disbursed_at) DESC" in sql
