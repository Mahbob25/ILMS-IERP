"""Unit tests for the Teacher/HR report service functions (Phase 4, group C).

Covers C1 (Teacher Wallets), C2 (Teacher Payouts), C3 (Staff Payroll) and
C4 (Grade Summary) aggregations. Uses a mocked db session.
"""

import uuid
from datetime import date
from unittest.mock import AsyncMock, Mock

from app.modules.reports import service as reports_service


def _scalars_result(items):
    r = Mock()
    r.unique.return_value = r
    r.scalars.return_value.all.return_value = items
    return r


def _rows_result(rows):
    r = Mock()
    r.fetchall.return_value = rows
    return r


def _wallet(wallet_id, teacher_id, teacher_name="Teacher A", balance=100.0,
            frozen=20.0):
    w = Mock()
    w.id = wallet_id
    w.teacher_id = teacher_id
    w.balance = balance
    w.frozen_balance = frozen
    w.teacher_employee = Mock(name="teacher")
    w.teacher_employee.full_name = teacher_name
    return w


def _expense(expense_id, amount=50.0, recipient_id=None, teacher_name="Teacher A",
             expense_date=date(2026, 7, 10), receipt_number="V-001"):
    e = Mock()
    e.id = expense_id
    e.amount = amount
    e.date = expense_date
    e.receipt_number = receipt_number
    e.recipient_id = recipient_id
    e.recipient_name = teacher_name
    e.recipient_employee = Mock(name="recipient")
    e.recipient_employee.full_name = teacher_name if recipient_id else ""
    return e


class TestTeacherWallets:
    async def test_aggregates_wallet_balances(self, mock_db):
        wid1, wid2 = uuid.uuid4(), uuid.uuid4()
        tid1, tid2 = uuid.uuid4(), uuid.uuid4()
        w1 = _wallet(wid1, tid1, "Teacher A", balance=100.0, frozen=20.0)
        w2 = _wallet(wid2, tid2, "Teacher B", balance=200.0, frozen=0.0)
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([w1, w2]),
                _rows_result([(wid1, 5), (wid2, 3)]),
            ]
        )

        report = await reports_service.get_teacher_wallets(mock_db)

        assert report["total_wallets"] == 2
        assert report["total_balance"] == 300.0
        assert report["total_frozen"] == 20.0
        assert report["total_available"] == 280.0
        assert report["wallets"][0]["teacher_name"] == "Teacher A"
        assert report["wallets"][0]["available"] == 80.0
        assert report["wallets"][0]["entry_count"] == 5

    async def test_empty_wallets(self, mock_db):
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([]),
                _rows_result([]),
            ]
        )

        report = await reports_service.get_teacher_wallets(mock_db)

        assert report["total_wallets"] == 0
        assert report["total_balance"] == 0.0
        assert report["wallets"] == []

    async def test_wallet_without_teacher_employee(self, mock_db):
        wid = uuid.uuid4()
        w = _wallet(wid, uuid.uuid4())
        w.teacher_employee = None
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([w]),
                _rows_result([(wid, 0)]),
            ]
        )

        report = await reports_service.get_teacher_wallets(mock_db)

        assert report["wallets"][0]["teacher_name"] == ""
        assert report["wallets"][0]["entry_count"] == 0


class TestTeacherPayouts:
    async def test_aggregates_withdrawals_per_period(self, mock_db):
        eid1, eid2 = uuid.uuid4(), uuid.uuid4()
        tid1, tid2 = uuid.uuid4(), uuid.uuid4()
        exp1 = _expense(eid1, 50.0, tid1, "Teacher A", date(2026, 7, 5), "V-001")
        exp2 = _expense(eid2, 30.0, tid1, "Teacher A", date(2026, 7, 8), "V-002")
        mock_db.execute = AsyncMock(return_value=_scalars_result([exp1, exp2]))

        report = await reports_service.get_teacher_payouts(
            mock_db, date(2026, 7, 1), date(2026, 7, 31)
        )

        assert report["start_date"] == "2026-07-01"
        assert report["end_date"] == "2026-07-31"
        assert report["total_withdrawn"] == 80.0
        assert report["withdrawal_count"] == 2
        assert report["by_teacher"][0]["teacher_name"] == "Teacher A"
        assert report["by_teacher"][0]["total_withdrawn"] == 80.0
        assert report["by_teacher"][0]["withdrawal_count"] == 2
        assert report["withdrawals"][0]["receipt_number"] == "V-001"
        assert report["withdrawals"][0]["date"] == "2026-07-05"

    async def test_empty_period(self, mock_db):
        mock_db.execute = AsyncMock(return_value=_scalars_result([]))

        report = await reports_service.get_teacher_payouts(mock_db)

        assert report["total_withdrawn"] == 0.0
        assert report["withdrawal_count"] == 0
        assert report["by_teacher"] == []
        assert report["withdrawals"] == []

    async def test_no_employee_falls_back_to_recipient_name(self, mock_db):
        eid = uuid.uuid4()
        exp = _expense(eid, 25.0, None, "Legacy Teacher", date(2026, 7, 1), "V-003")
        exp.recipient_employee = None
        mock_db.execute = AsyncMock(return_value=_scalars_result([exp]))

        report = await reports_service.get_teacher_payouts(mock_db)

        assert report["total_withdrawn"] == 25.0
        assert report["withdrawals"][0]["teacher_name"] == "Legacy Teacher"
        assert report["by_teacher"][0]["teacher_name"] == "Legacy Teacher"
        assert report["by_teacher"][0]["teacher_id"] == ""


class TestStaffPayroll:
    async def test_delegates_and_builds_totals(self, mock_db, monkeypatch):
        members = [
            {"id": "m1", "full_name": "Sec A", "role": "secretary",
             "monthly_salary": 500.0, "total_drawn_this_month": 100.0,
             "remaining_balance": 400.0},
            {"id": "m2", "full_name": "Cleaner B", "role": "cleaner",
             "monthly_salary": 300.0, "total_drawn_this_month": 300.0,
             "remaining_balance": 0.0},
        ]
        monkeypatch.setattr(
            reports_service, "list_staff_for_payroll", AsyncMock(return_value=members)
        )

        report = await reports_service.get_staff_payroll_report(
            mock_db, month=date(2026, 7, 1)
        )

        assert report["month"] == "2026-07"
        assert report["total_members"] == 2
        assert report["total_salary"] == 800.0
        assert report["total_drawn"] == 400.0
        assert report["total_remaining"] == 400.0
        assert report["members"][0]["full_name"] == "Sec A"

    async def test_month_none_returns_current_month(self, mock_db, monkeypatch):
        monkeypatch.setattr(
            reports_service, "list_staff_for_payroll", AsyncMock(return_value=[])
        )

        report = await reports_service.get_staff_payroll_report(mock_db)

        assert report["month"] is None
        assert report["total_members"] == 0
        assert report["members"] == []


class TestGradeSummary:
    async def test_builds_distribution_per_section(self, mock_db):
        sid1, sid2 = uuid.uuid4(), uuid.uuid4()
        mock_db.execute = AsyncMock(
            side_effect=[
                _rows_result([
                    (sid1, 95.0),
                    (sid1, 85.0),
                    (sid1, 55.0),
                    (sid2, 72.0),
                ]),
                _rows_result([
                    (_mock_section(sid1, "Math", "Teacher A", "active"), "Math"),
                    (_mock_section(sid2, "Science", "Teacher B", "active"), "Science"),
                ]),
            ]
        )

        report = await reports_service.get_grade_summary(mock_db)

        assert report["total_sections"] == 2
        assert report["total_graded_students"] == 4
        assert report["overall_average"] == 76.8
        sections = {s["section_id"]: s for s in report["sections"]}
        math = sections[str(sid1)]
        assert math["course_name"] == "Math"
        assert math["graded_count"] == 3
        assert math["average_score"] == 78.3
        assert math["distribution"]["Excellent"] == 1
        assert math["distribution"]["Very Good"] == 1
        assert math["distribution"]["Fail"] == 1
        assert math["teacher_name"] == "Teacher A"

    async def test_empty_returns_zeroes(self, mock_db):
        mock_db.execute = AsyncMock(return_value=_rows_result([]))

        report = await reports_service.get_grade_summary(mock_db)

        assert report["total_sections"] == 0
        assert report["total_graded_students"] == 0
        assert report["overall_average"] == 0
        assert report["sections"] == []

    async def test_section_filter_passed(self, mock_db):
        sid1 = uuid.uuid4()
        mock_db.execute = AsyncMock(
            side_effect=[
                _rows_result([(sid1, 90.0)]),
                _rows_result([(_mock_section(sid1, "Math", "Teacher A", "active"), "Math")]),
            ]
        )

        report = await reports_service.get_grade_summary(mock_db, section_id=sid1)

        assert report["total_sections"] == 1
        assert report["sections"][0]["distribution"]["Excellent"] == 1


def _mock_section(section_id, course_name, teacher_name, status):
    s = Mock()
    s.id = section_id
    s.status = status
    s.teacher_employee = Mock(name="teacher")
    s.teacher_employee.full_name = teacher_name
    return s
