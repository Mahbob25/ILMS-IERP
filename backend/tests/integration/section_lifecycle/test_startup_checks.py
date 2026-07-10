from datetime import date, timedelta
from unittest.mock import AsyncMock, Mock, patch
import pytest

from app.modules.academic.section_startup_checks import (
    run_daily_section_checks,
    _process_overdue_sections,
    _process_upcoming_deadlines,
    _check_payment_deadlines,
)


DATE_TODAY = date(2026, 7, 10)


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.section_startup_checks.get_today",
        lambda: DATE_TODAY,
    )


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    m.unique.return_value = m
    return m


class TestRunDailyChecks:
    async def test_idempotency_prevents_double_run(self, mock_db):
        mock_db.execute.return_value = result_mock(scalar_one_or_none=Mock())

        await run_daily_section_checks(mock_db)

        assert mock_db.commit.call_count == 0

    async def test_skips_soft_deleted_sections(self, mock_db):
        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=None))
        mock_db.add = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch(
            "app.modules.academic.section_startup_checks._process_overdue_sections",
            new_callable=AsyncMock, return_value=[],
        ) as mock_overdue:
            with patch(
                "app.modules.academic.section_startup_checks._process_upcoming_deadlines",
                new_callable=AsyncMock, return_value=[],
            ) as mock_upcoming:
                with patch(
                    "app.modules.academic.section_startup_checks._check_payment_deadlines",
                    new_callable=AsyncMock,
                ) as mock_payments:
                    await run_daily_section_checks(mock_db)

                    assert mock_db.add.call_count >= 1

    async def test_skips_completed_and_cancelled(self, mock_db):
        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=None))
        mock_db.add = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch(
            "app.modules.academic.section_startup_checks._process_overdue_sections",
            new_callable=AsyncMock, return_value=[],
        ):
            await run_daily_section_checks(mock_db)

            assert mock_db.add.call_count >= 1


class TestOverdueSections:
    async def test_overdue_section_becomes_ready_for_completion(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY - timedelta(days=1)
        section.deleted_at = None
        section.flags = {}

        mock_db.execute.return_value = result_mock(scalars_all=[section], scalar=0)

        results = await _process_overdue_sections(mock_db, DATE_TODAY)

        assert section in results
        assert section.status == "ready_for_completion"

    async def test_overdue_section_with_ungraded_students(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY - timedelta(days=1)
        section.deleted_at = None
        section.flags = {}

        mock_db.execute.return_value = result_mock(scalars_all=[section], scalar=2)

        results = await _process_overdue_sections(mock_db, DATE_TODAY)

        assert section.status == "active"
        assert section.flags.get("overdue") is True
        assert section.flags.get("ungraded_count") == 2

    async def test_overdue_section_with_zero_scores(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY - timedelta(days=1)
        section.deleted_at = None
        section.flags = {}

        mock_db.execute.return_value = result_mock(scalars_all=[section], scalar=0)

        results = await _process_overdue_sections(mock_db, DATE_TODAY)

        assert section.status == "ready_for_completion"


class TestUpcomingDeadlines:
    async def test_upcoming_deadline_warning(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY + timedelta(days=3)
        section.deleted_at = None
        section.flags = {}

        config_mock = Mock()
        config_mock.value = "7"

        def side_effect(query):
            from sqlalchemy.sql.selectable import Select
            if isinstance(query, Select):
                qs = str(query)
                if "section_lifecycle_config" in qs:
                    return result_mock(scalar_one_or_none=config_mock)
            return result_mock(scalars_all=[section])

        mock_db.execute = AsyncMock(side_effect=side_effect)

        results = await _process_upcoming_deadlines(mock_db, DATE_TODAY)

        assert len(results) == 1
        assert results[0].flags.get("approaching_end") is True

    async def test_no_change_for_future_sections(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY + timedelta(days=30)
        section.deleted_at = None
        section.flags = {}

        config_mock = Mock()
        config_mock.value = "7"

        def side_effect(query):
            from sqlalchemy.sql.selectable import Select
            if isinstance(query, Select):
                qs = str(query)
                if "section_lifecycle_config" in qs:
                    return result_mock(scalar_one_or_none=config_mock)
            return result_mock(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=side_effect)

        results = await _process_upcoming_deadlines(mock_db, DATE_TODAY)

        assert len(results) == 0


class TestPaymentDeadlines:
    async def test_payment_deadline_flag(self, mock_db):
        section = Mock()
        section.id = 99
        section.status = "active"
        section.end_date = DATE_TODAY + timedelta(days=7)
        section.deleted_at = None
        section.flags = {}
        section.price = 500

        enrollment = Mock()
        enrollment.id = 199
        enrollment.agreed_price = 500
        enrollment.deleted_at = None

        config_mock = Mock()
        config_mock.value = "14"

        call_no = [0]

        def side_effect(query):
            from sqlalchemy.sql.selectable import Select
            if isinstance(query, Select):
                qs = str(query)
                if "section_lifecycle_config" in qs:
                    return result_mock(scalar_one_or_none=config_mock)
            if call_no[0] == 0:
                call_no[0] += 1
                return result_mock(scalars_all=[section])
            if call_no[0] == 1:
                call_no[0] += 1
                return result_mock(scalars_all=[enrollment])
            return result_mock(scalar=0)

        mock_db.execute = AsyncMock(side_effect=side_effect)

        await _check_payment_deadlines(mock_db, DATE_TODAY)

        assert section.flags.get("has_unpaid_enrollments") is True
        assert section.flags.get("unpaid_enrollment_count") == 1
