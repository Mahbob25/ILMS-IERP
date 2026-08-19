import uuid
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch
import pytest

from app.modules.academic.cancellation_service import cancel_section


def _result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    m.unique.return_value = m
    m.one.return_value = (Decimal("0"), Decimal("0"))
    return m


@pytest.fixture(autouse=True)
def mock_utcnow(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.cancellation_service.utcnow",
        lambda: datetime.now(timezone.utc),
    )


class TestCancelSectionTransaction:

    async def test_failure_after_wallet_reversal_rolls_back(
        self, mock_db, mock_course, mock_teacher_employee, mock_user, mock_contract
    ):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.course = mock_course
        section.teacher_employee = mock_teacher_employee
        section.teacher_id = mock_teacher_employee.id
        section.contract = mock_contract
        section.attendance_sessions = []
        section.final_grades = []
        section.certificates = []
        section.enrollments = []

        ledger_aggr = Mock()
        ledger_aggr.one.return_value = (Decimal("400"), Decimal("100"))

        query_results = [
            _result_mock(scalar_one_or_none=section),
            ledger_aggr,
            _result_mock(scalar=Decimal("0")),
            _result_mock(),
            _result_mock(),
            _result_mock(),
        ]
        query_index = 0

        async def execute_side_effect(query):
            nonlocal query_index
            result = query_results[query_index % len(query_results)]
            query_index += 1
            return result

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        ledger_cancel_called = [False]

        async def ledger_cancel_side_effect(db, contract_id, cancelled_by, reason, **kwargs):
            ledger_cancel_called[0] = True
            return Mock()

        with patch(
            "app.modules.academic.cancellation_service.ledger_cancel_contract",
            side_effect=ledger_cancel_side_effect,
        ):
            mock_db.add = Mock(side_effect=Exception("DB failure after wallet reversal"))
            mock_db.flush = AsyncMock()

            with pytest.raises(Exception, match="DB failure after wallet reversal"):
                await cancel_section(
                    mock_db,
                    section_id=section.id,
                    cancelled_by=mock_user.id,
                    reason="Test rollback after wallet reversal",
                    refund_policy="authorize_refunds",
                )

        assert ledger_cancel_called[0], "ledger_cancel_contract should have been called"
        mock_db.flush.assert_not_called()

    async def test_no_orphaned_pending_refund_on_failure(
        self, mock_db, mock_course, mock_teacher_employee, mock_user, mock_student
    ):
        enrollment = Mock()
        enrollment.id = uuid.uuid4()
        enrollment.student_id = mock_student.id
        enrollment.student = mock_student
        enrollment.agreed_price = Decimal("500")
        enrollment.admin_discount = None

        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.course = mock_course
        section.teacher_employee = mock_teacher_employee
        section.teacher_id = mock_teacher_employee.id
        section.contract = None
        section.attendance_sessions = []
        section.final_grades = []
        section.certificates = []
        section.enrollments = [enrollment]

        ledger_aggr = Mock()
        ledger_aggr.one.return_value = (Decimal("0"), Decimal("0"))

        query_results = [
            _result_mock(scalar_one_or_none=section),
            _result_mock(scalar=Decimal("500")),
            _result_mock(scalar=Decimal("500")),
        ]

        def execute_side_effect(query):
            return query_results.pop(0)

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock(side_effect=Exception("Simulated failure before flush"))
        mock_db.flush = AsyncMock()

        with pytest.raises(Exception):
            await cancel_section(
                mock_db,
                section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test rollback refunds",
                refund_policy="authorize_refunds",
            )

        pending_refund_added = False
        for call_args in mock_db.add.call_args_list:
            args, _ = call_args
            arg_class = args[0].__class__.__name__ if hasattr(args[0], "__class__") else ""
            if "PendingRefund" in arg_class:
                pending_refund_added = True

        assert not pending_refund_added, (
            "PendingRefund should NOT be created if the transaction fails"
        )

    async def test_cancel_section_rolls_back_on_db_failure(
        self, mock_db, mock_course, mock_teacher_employee, mock_user
    ):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.course = mock_course
        section.teacher_employee = mock_teacher_employee
        section.teacher_id = mock_teacher_employee.id
        section.contract = None
        section.attendance_sessions = []
        section.final_grades = []
        section.certificates = []
        section.enrollments = []

        async def execute_side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return _result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return _result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return _result_mock(scalar=Decimal("0"))
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock(side_effect=Exception("DB failure"))

        with pytest.raises(Exception):
            await cancel_section(
                mock_db,
                section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test rollback",
                refund_policy="no_refund",
            )

        mock_db.flush.assert_not_called()
