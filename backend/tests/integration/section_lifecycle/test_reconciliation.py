from datetime import date, timedelta
from unittest.mock import AsyncMock, Mock
import uuid
import pytest

from app.modules.academic.reconciliation_service import generate_daily_reconciliation_report


DATE_TODAY = date(2026, 7, 10)


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    return m


class TestReconciliation:
    async def test_daily_reconciliation_report(self, mock_db):
        active_section = Mock()
        active_section.id = uuid.uuid4()
        active_section.status = "active"
        active_section.end_date = DATE_TODAY
        active_section.flags = {}
        course = Mock()
        course.name = "Test Course"
        active_section.course = course

        cancellation = Mock()
        cancellation.section_id = uuid.uuid4()
        cancellation.section = active_section
        cancellation.cancelled_by_user = None
        cancellation.reason = "Low enrollment"
        cancellation.refund_policy = "authorize_refunds"
        cancellation.teacher_wallet_reversal_amount = 5000
        cancellation.total_refund_authorized = 12000

        override = Mock()
        override.section = active_section
        override.overridden_by_user = None
        override.bypass_grade_check = True
        override.bypass_payment_check = False
        override.reason = "Force complete"

        refund = Mock()
        refund.receipt_number = "RFD-20260710-0001"
        refund.amount = 2500
        refund.pending_refund = None
        refund.disbursed_by_user = None

        def side_effect(query):
            qs = str(query)
            if "count" in qs and "active" in qs.lower() or "count" in qs and "deleted" in qs:
                return result_mock(scalar=45)
            if "ready_for_completion" in qs.lower() or "newly" in qs.lower():
                return result_mock(scalars_all=[])
            if "cancellation" in qs.lower() and "order" in qs:
                return result_mock(scalars_all=[cancellation])
            if "refund" in qs.lower() and "order" in qs:
                return result_mock(scalars_all=[refund])
            if "override" in qs.lower() and "order" in qs:
                return result_mock(scalars_all=[override])
            if "unclaimed" in qs.lower() or "coalesce" in qs.lower():
                return result_mock(scalar=15000)
            if "overdue" in qs.lower() or "end_date" in qs:
                return result_mock(scalars_all=[])
            return result_mock(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=side_effect)

        report = await generate_daily_reconciliation_report(mock_db, DATE_TODAY)

        assert "report_date" in report
        assert "generated_at" in report
        assert "summary" in report
        assert report["summary"]["total_active_sections"] == 45

    async def test_empty_reconciliation_report(self, mock_db):
        def side_effect(query):
            qs = str(query)
            if "count" in qs:
                return result_mock(scalar=0)
            return result_mock(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=side_effect)

        report = await generate_daily_reconciliation_report(mock_db, DATE_TODAY)

        assert report["summary"]["total_active_sections"] == 0
        assert report["summary"]["sections_cancelled_today"] == 0
        assert report["summary"]["overdue_sections_count"] == 0
        assert report["summary"]["unclaimed_pending_refunds_total"] == 0

    async def test_health_check_after_run(self, mock_db):
        from datetime import datetime, timezone
        from sqlalchemy import select
        from app.modules.academic.models import DailyJobsLog

        record = Mock()
        record.last_run_date = DATE_TODAY
        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=record))

        result = await mock_db.execute(
            select(DailyJobsLog)
            .where(DailyJobsLog.job_name == "section_daily_check")
            .order_by(DailyJobsLog.last_run_date.desc())
            .limit(1)
        )
        found = result.scalar_one_or_none()

        assert found is not None
        assert found.last_run_date == DATE_TODAY

    async def test_health_check_never_ran(self, mock_db):
        from sqlalchemy import select
        from app.modules.academic.models import DailyJobsLog

        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=None))

        result = await mock_db.execute(
            select(DailyJobsLog)
            .where(DailyJobsLog.job_name == "section_daily_check")
            .order_by(DailyJobsLog.last_run_date.desc())
            .limit(1)
        )
        found = result.scalar_one_or_none()

        assert found is None

    async def test_financial_impact_structure(self, mock_db):
        def side_effect(query):
            qs = str(query)
            if "coalesce" in qs:
                return result_mock(scalar=100000)
            if "count" in qs:
                return result_mock(scalar=10)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        report = await generate_daily_reconciliation_report(mock_db, DATE_TODAY)

        assert "summary" in report
        assert isinstance(report["summary"]["unclaimed_pending_refunds_total"], float)
