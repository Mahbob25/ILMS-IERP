from datetime import date
from unittest.mock import AsyncMock, Mock

from app.modules.reports import service as reports_service

TODAY = date(2026, 7, 14)


def _result(rows=None, scalar=None):
    m = Mock()
    m.fetchall.return_value = rows if rows is not None else []
    m.scalar.return_value = scalar
    return m


def _sample_overview():
    return {
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
            {"date": "2026-07-01", "revenue": 500.0, "expenses": 100.0, "refunds": 0.0},
            {"date": "2026-07-02", "revenue": 500.0, "expenses": 200.0, "refunds": 50.0},
        ],
    }


class TestPnlReport:
    async def test_delegates_to_revenue_overview_and_marks_unclosed_days(
        self, mock_db, monkeypatch
    ):
        overview = _sample_overview()
        monkeypatch.setattr(
            reports_service, "get_revenue_overview", AsyncMock(return_value=overview)
        )
        mock_db.execute = AsyncMock(
            return_value=_result(
                rows=[(date(2026, 7, 1), "closed"), (date(2026, 7, 2), "pending")]
            )
        )

        report = await reports_service.get_pnl_report(
            mock_db, date(2026, 7, 1), date(2026, 7, 2)
        )

        assert report["daily_breakdown"][0]["closure_status"] == "closed"
        assert report["daily_breakdown"][1]["closure_status"] == "pending"
        assert report["unclosed_days"] == ["2026-07-02"]

    async def test_all_days_closed_gives_empty_unclosed(self, mock_db, monkeypatch):
        monkeypatch.setattr(
            reports_service,
            "get_revenue_overview",
            AsyncMock(return_value=_sample_overview()),
        )
        mock_db.execute = AsyncMock(
            return_value=_result(
                rows=[(date(2026, 7, 1), "closed"), (date(2026, 7, 2), "closed")]
            )
        )

        report = await reports_service.get_pnl_report(
            mock_db, date(2026, 7, 1), date(2026, 7, 2)
        )

        assert report["unclosed_days"] == []

    async def test_delegates_raw_dates_without_reimplementing_defaults(
        self, mock_db, monkeypatch
    ):
        overview = _sample_overview()
        captured = {}

        async def fake_overview(db, start_date, end_date):
            captured["start"] = start_date
            captured["end"] = end_date
            return overview

        monkeypatch.setattr(reports_service, "get_revenue_overview", fake_overview)
        monkeypatch.setattr(
            reports_service, "_get_closure_status_map", AsyncMock(return_value={})
        )

        await reports_service.get_pnl_report(mock_db, date(2026, 7, 1), date(2026, 7, 2))

        assert captured["start"] == date(2026, 7, 1)
        assert captured["end"] == date(2026, 7, 2)

    async def test_closure_status_map_defaults_to_current_month(
        self, mock_db, monkeypatch
    ):
        monkeypatch.setattr(
            reports_service,
            "get_revenue_overview",
            AsyncMock(return_value=_sample_overview()),
        )
        fake_map = AsyncMock(return_value={})
        monkeypatch.setattr(reports_service, "_get_closure_status_map", fake_map)

        await reports_service.get_pnl_report(mock_db)

        _db, effective_start, effective_end = fake_map.await_args.args
        assert effective_end == date.today()
        assert effective_start.replace(day=1) == date.today().replace(day=1)


class TestDailyLedgerReport:
    async def test_delegates_to_closure_service(self, mock_db, monkeypatch):
        expected = {"date": TODAY, "status": "closed"}
        monkeypatch.setattr(
            reports_service, "get_daily_ledger", AsyncMock(return_value=expected)
        )

        result = await reports_service.get_daily_ledger_report(mock_db, TODAY)

        assert result["date"] == TODAY
        assert result["status"] == "closed"


class TestClosuresRegister:
    async def test_delegates_and_forwards_dates(self, mock_db, monkeypatch):
        captured = {}

        async def fake_list_closures(db, **kwargs):
            captured.update(kwargs)
            return [{"date": TODAY, "status": "pending"}]

        monkeypatch.setattr(reports_service, "list_closures", fake_list_closures)

        result = await reports_service.get_closures_register(
            mock_db, date_from=date(2026, 7, 1), date_to=date(2026, 7, 10)
        )

        assert len(result) == 1
        assert captured["date_from"] == date(2026, 7, 1)
        assert captured["date_to"] == date(2026, 7, 10)


class TestDailyReconciliationReport:
    async def test_delegates_and_surfaces_closed_status(self, mock_db, monkeypatch):
        base = {
            "report_date": TODAY.isoformat(),
            "generated_at": "2026-07-14T10:00:00+00:00",
            "summary": {"total_active_sections": 45},
        }
        monkeypatch.setattr(
            reports_service,
            "generate_daily_reconciliation_report",
            AsyncMock(return_value=base),
        )
        mock_db.execute = AsyncMock(return_value=_result(scalar="closed"))

        report = await reports_service.get_daily_reconciliation_report(mock_db, TODAY)

        assert report["closure_status"] == "closed"
        assert report["is_closed"] is True
        assert report["summary"]["total_active_sections"] == 45

    async def test_pending_closure_marks_partial(self, mock_db, monkeypatch):
        base = {
            "report_date": TODAY.isoformat(),
            "generated_at": "2026-07-14T10:00:00+00:00",
            "summary": {},
        }
        monkeypatch.setattr(
            reports_service,
            "generate_daily_reconciliation_report",
            AsyncMock(return_value=base),
        )
        mock_db.execute = AsyncMock(return_value=_result(scalar="pending"))

        report = await reports_service.get_daily_reconciliation_report(mock_db, TODAY)

        assert report["closure_status"] == "pending"
        assert report["is_closed"] is False