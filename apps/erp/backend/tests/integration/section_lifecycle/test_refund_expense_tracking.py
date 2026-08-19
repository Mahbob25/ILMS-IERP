from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest

from app.modules.lms.financial_service import get_revenue_overview
from app.modules.lms.closure_service import get_daily_ledger, list_closures
from app.modules.lms.voucher_service import get_refund_voucher_html_content


DATE_TODAY = date(2026, 7, 10)


def _make_result(one=None, scalar=0, scalar_one_or_none=None, fetchall=None):
    m = Mock()
    m.one.return_value = one or (0, 0)
    m.scalar.return_value = scalar
    m.scalar_one_or_none.return_value = scalar_one_or_none
    m.fetchall.return_value = fetchall if fetchall is not None else []
    s = Mock()
    s.all.return_value = []
    m.scalars.return_value = s
    return m


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr(
        "app.modules.lms.financial_service.get_today",
        lambda: DATE_TODAY,
    )


def _match_sql(qs: str, *patterns: str) -> bool:
    lower = qs.lower()
    return all(p in lower for p in patterns)


class TestRevenueOverviewRefunds:
    async def _setup_revenue_mock(self, mock_db, revenue, expense, refund, txn_count, student_count):
        queries = iter([
            _make_result(one=(Decimal(str(revenue)), txn_count)),
            _make_result(scalar=Decimal(str(expense))),
            _make_result(scalar=Decimal(str(refund))),
            _make_result(scalar=student_count),
            _make_result(scalar=Decimal(str(revenue))),
        ])

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "monthly_revenue"):
                return _make_result(fetchall=[
                    ("2026-07", Decimal(str(revenue)), Decimal(str(expense)), Decimal(str(refund))),
                ])
            if _match_sql(qs, "daily_revenue"):
                return _make_result(fetchall=[
                    ("2026-07-10", Decimal(str(revenue)), Decimal(str(expense)), Decimal(str(refund))),
                ])
            if _match_sql(qs, "as course_name"):
                return _make_result(fetchall=[("Course A", Decimal(str(revenue)))])
            if _match_sql(qs, "as teacher_name"):
                return _make_result(fetchall=[("Teacher 1", Decimal(str(revenue)))])
            if _match_sql(qs, "distinct", "student_id"):
                return next(queries)
            if _match_sql(qs, "prev", "sum", "payments"):
                return next(queries)
            if _match_sql(qs, "from payments", "sum"):
                return next(queries)
            if _match_sql(qs, "from expenses", "sum"):
                return next(queries)
            if _match_sql(qs, "from refunds"):
                return next(queries)

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

    async def test_revenue_overview_includes_refunds(self, mock_db):
        await self._setup_revenue_mock(mock_db, 2000, 500, 300, 3, 5)
        result = await get_revenue_overview(mock_db, DATE_TODAY, DATE_TODAY)
        assert result["total_revenue"] == 2000.0
        assert result["total_expenses"] == 500.0
        assert result["total_refunds"] == 300.0
        assert result["net_revenue"] == 1200.0
        assert result["transaction_count"] == 3
        assert "total_refunds" in result

    async def test_revenue_overview_no_refunds(self, mock_db):
        await self._setup_revenue_mock(mock_db, 1000, 200, 0, 2, 3)
        result = await get_revenue_overview(mock_db, DATE_TODAY, DATE_TODAY)
        assert result["total_refunds"] == 0.0
        assert result["net_revenue"] == 800.0

    async def test_revenue_monthly_trend_includes_refunds(self, mock_db):
        queries = iter([
            _make_result(one=(Decimal("3000"), 4)),
            _make_result(scalar=Decimal("400")),
            _make_result(scalar=Decimal("100")),
            _make_result(scalar=6),
            _make_result(scalar=Decimal("1500")),
        ])

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "monthly_revenue"):
                return _make_result(fetchall=[
                    ("2026-06", Decimal("1500"), Decimal("200"), Decimal("50")),
                    ("2026-07", Decimal("3000"), Decimal("400"), Decimal("100")),
                ])
            if _match_sql(qs, "daily_revenue"):
                return _make_result(fetchall=[
                    ("2026-07-10", Decimal("3000"), Decimal("400"), Decimal("100")),
                ])
            if _match_sql(qs, "as course_name"):
                return _make_result(fetchall=[("Course A", Decimal("3000"))])
            if _match_sql(qs, "as teacher_name"):
                return _make_result(fetchall=[("Teacher 1", Decimal("3000"))])
            if _match_sql(qs, "distinct", "student_id"):
                return next(queries)
            if _match_sql(qs, "prev", "sum", "payments"):
                return next(queries)
            if _match_sql(qs, "from payments", "sum"):
                return next(queries)
            if _match_sql(qs, "from expenses", "sum"):
                return next(queries)
            if _match_sql(qs, "from refunds"):
                return next(queries)

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_revenue_overview(mock_db, DATE_TODAY, DATE_TODAY)

        assert len(result["monthly_trend"]) == 2
        for item in result["monthly_trend"]:
            assert "refunds" in item
        assert result["monthly_trend"][1]["refunds"] == 100.0
        assert result["monthly_trend"][0]["refunds"] == 50.0

    async def test_revenue_daily_breakdown_includes_refunds(self, mock_db):
        await self._setup_revenue_mock(mock_db, 500, 100, 50, 1, 2)
        result = await get_revenue_overview(mock_db, DATE_TODAY, DATE_TODAY)
        assert len(result["daily_breakdown"]) == 1
        assert "refunds" in result["daily_breakdown"][0]
        assert result["daily_breakdown"][0]["refunds"] == 50.0


class TestDailyLedgerRefunds:
    async def test_daily_ledger_shows_refunds(self, mock_db):
        row_data = (
            uuid.uuid4(),
            Decimal("200"),
            "RFD-20260710-0001",
            datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc),
            uuid.uuid4(),
            None,
            "Test Student",
            "Test Course",
            "Cashier Name",
        )

        queries = iter([
            _make_result(scalar=Decimal("1000")),
            _make_result(scalar=Decimal("300")),
            _make_result(scalar=Decimal("200")),
        ])

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "sum", "payments"):
                return next(queries)
            if _match_sql(qs, "sum", "expenses"):
                return next(queries)
            if _match_sql(qs, "sum", "refund"):
                return next(queries)
            if _match_sql(qs, "pending_refund"):
                return _make_result(fetchall=[row_data])
            if "outerjoin" in qs.lower():
                return _make_result(fetchall=[])
            if "DailyClosure" in qs:
                return _make_result(scalar_one_or_none=None)

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_daily_ledger(mock_db, DATE_TODAY)

        assert result["total_refunds_out"] == 200.0
        assert result["net_cash_flow"] == 500.0
        assert len(result["refunds"]) == 1
        assert result["refunds"][0]["receipt_number"] == "RFD-20260710-0001"
        assert result["refunds"][0]["student_name"] == "Test Student"
        assert result["refunds"][0]["course_name"] == "Test Course"
        assert result["refunds"][0]["amount"] == 200.0

    async def test_daily_ledger_no_refunds(self, mock_db):
        queries = iter([
            _make_result(scalar=Decimal("500")),
            _make_result(scalar=Decimal("100")),
            _make_result(scalar=Decimal("0")),
        ])

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "sum", "payments"):
                return next(queries)
            if _match_sql(qs, "sum", "expenses"):
                return next(queries)
            if _match_sql(qs, "sum", "refund"):
                return next(queries)
            if _match_sql(qs, "pending_refund"):
                return _make_result(fetchall=[])
            if "outerjoin" in qs.lower():
                return _make_result(fetchall=[])
            if "DailyClosure" in qs:
                return _make_result(scalar_one_or_none=None)

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_daily_ledger(mock_db, DATE_TODAY)

        assert result["total_refunds_out"] == 0.0
        assert len(result["refunds"]) == 0
        assert result["net_cash_flow"] == 400.0


class TestClosuresListRefunds:
    async def test_closure_list_includes_refund_dates(self, mock_db):
        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "select", "date", "order by"):
                row = Mock()
                row.date = DATE_TODAY
                row.total_payments_in = Decimal("500")
                row.total_expenses_out = Decimal("100")
                row.total_refunds_out = Decimal("50")
                row.status = "pending"
                row.closed_by_manager_id = None
                return _make_result(fetchall=[row])

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await list_closures(mock_db, DATE_TODAY, DATE_TODAY)

        assert len(result) >= 1
        assert result[0]["date"] == DATE_TODAY
        assert result[0]["total_refunds_out"] == 50.0

    async def test_closure_refund_only_day_appears(self, mock_db):
        refund_only_date = date(2026, 7, 8)

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)

            if _match_sql(qs, "select", "date", "order by"):
                row = Mock()
                row.date = refund_only_date
                row.total_payments_in = Decimal("0")
                row.total_expenses_out = Decimal("0")
                row.total_refunds_out = Decimal("200")
                row.status = "pending"
                row.closed_by_manager_id = None
                return _make_result(fetchall=[row])

            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await list_closures(mock_db, refund_only_date, refund_only_date)

        assert len(result) == 1
        assert result[0]["date"] == refund_only_date
        assert result[0]["total_payments_in"] == 0.0
        assert result[0]["total_expenses_out"] == 0.0
        assert result[0]["total_refunds_out"] == 200.0
        assert result[0]["net_cash_flow"] == -200.0


class TestRefundVoucherPreview:
    async def test_refund_voucher_preview_returns_html(self, mock_db):
        student = Mock(full_name="Test Student")
        course = Mock(name="Test Course")
        section = Mock()
        section.course = course
        enrollment = Mock(student=student, section=section)

        pending_refund = Mock(enrollment=enrollment)

        cashier_user = Mock(full_name="Cashier Name")
        cashier_user.employee = Mock()

        refund = Mock()
        refund.id = uuid.uuid4()
        refund.receipt_number = "RFD-20260710-0001"
        refund.amount = Decimal("500")
        refund.disbursed_at = datetime(2026, 7, 10, 10, 30, 0, tzinfo=timezone.utc)
        refund.disbursed_by = uuid.uuid4()
        refund.notes = "Test refund"
        refund.pending_refund = pending_refund
        refund.disbursed_by_user = cashier_user

        async def execute_side_effect(*args):
            query = args[0]
            qs = str(query)
            if _match_sql(qs, "from refunds"):
                return _make_result(scalar_one_or_none=refund)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_refund_voucher_html_content(mock_db, refund.id)

        assert result is not None
        assert isinstance(result, str)
        assert "RFD-20260710-0001" in result
        assert "Test Student" in result

    async def test_refund_voucher_not_found(self, mock_db):
        async def execute_side_effect(*args):
            return _make_result(scalar_one_or_none=None)

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_refund_voucher_html_content(mock_db, uuid.uuid4())

        assert result is None
