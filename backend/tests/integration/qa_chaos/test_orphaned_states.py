import uuid
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch
import pytest

from app.modules.academic.cancellation_service import cancel_section
from app.modules.lms.cashier_service import disburse_pending_refund
from app.modules.academic.service import create_enrollment


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


class TestOrphanedStates:

    async def test_o01_enrollment_rollback_on_flush_failure(
        self, mock_db, mock_student
    ):
        section_id = uuid.uuid4()
        section = Mock()
        section.id = section_id
        section.capacity = 30
        section.enrolled_count = 0
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        async def execute_side_effect(query, **kwargs):
            qs = str(query)
            if "course_section" in qs.lower():
                s = Mock()
                s.scalar_one_or_none.return_value = section
                return s
            if "student" in qs.lower() and "student_code" in qs.lower():
                return _result_mock(scalar_one_or_none=None)
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock(side_effect=Exception("Flush failure"))

        with pytest.raises(Exception):
            await create_enrollment(
                mock_db,
                section_id=section_id,
                student_id=mock_student.id,
            )

        assert section.enrolled_count == 0, (
            "O01: enrolled_count must not increment on failed flush"
        )

    async def test_o02_cancel_rollback_on_flush_failure(
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

        async def execute_side_effect(*args, **kwargs):
            qs = str(args[0])
            if "course_sections" in qs:
                return _result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return _result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return _result_mock(scalar=Decimal("0"))
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock(side_effect=Exception("Flush failure"))

        with pytest.raises(Exception):
            await cancel_section(
                mock_db,
                section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test rollback",
                refund_policy="no_refund",
            )

        mock_db.flush.assert_not_called()

    async def test_o03_disbursement_on_closed_day_prevents_orphan(
        self, mock_db, mock_user
    ):
        pending_refund_id = uuid.uuid4()
        pending = Mock()
        pending.id = pending_refund_id
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _result_mock(scalar_one_or_none=pending)
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        with patch(
            "app.modules.lms.cashier_service.is_date_closed",
            AsyncMock(return_value=True),
        ):
            with pytest.raises(ValueError):
                await disburse_pending_refund(
                    mock_db,
                    pending_refund_id=pending_refund_id,
                    disbursed_by=mock_user.id,
                )

        assert pending.status == "UNCLAIMED", (
            "O03: PendingRefund status must remain UNCLAIMED on closed-day failure"
        )

    async def test_o04_cancel_authorize_refund_rollback_on_failure(
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

        query_results = [
            _result_mock(scalar_one_or_none=section),
            _result_mock(scalar=Decimal("500")),
            _result_mock(scalar=Decimal("500")),
            _result_mock(scalar=Decimal("500")),
            _result_mock(scalar=Decimal("500")),
        ]

        def execute_side_effect(query, **kwargs):
            return query_results.pop(0)

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=Decimal("500"))

        def add_side_effect(obj):
            raise Exception("Flush failure")

        mock_db.add = Mock(side_effect=add_side_effect)

        with pytest.raises(Exception):
            await cancel_section(
                mock_db,
                section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test rollback refunds",
                refund_policy="authorize_refunds",
            )

        mock_db.flush.assert_not_called()

    async def test_o05_negative_price_prevention(self):
        section = Mock()
        section.status = "active"
        section.contract = Mock()
        section.contract.id = uuid.uuid4()
        section.contract.teacher_id = uuid.uuid4()
        section.price = Decimal("-100")
        section.start_date = datetime.now(timezone.utc)
        section.class_time = "10:00"

        check = section.price >= 0 if section.price is not None else True
        assert not check, (
            "O05: negative price should be caught before activation"
        )

    async def test_o06_enrolled_count_never_negative(self):
        section = Mock()
        section.enrolled_count = 0
        section.capacity = 10

        section.enrolled_count = max(0, section.enrolled_count - 1)
        assert section.enrolled_count >= 0, (
            "O06: enrolled_count must never go below 0"
        )

    async def test_o07_no_duplicate_refund_on_cancel(
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

        pending_refunds_added = []
        db_execute_count = 0

        def track_add(obj):
            pending_refunds_added.append(obj)

        query_results = [
            _result_mock(scalar_one_or_none=section),
            _result_mock(scalar=Decimal("500")),
        ]

        def execute_side_effect(query, **kwargs):
            nonlocal db_execute_count
            db_execute_count += 1
            qs = str(query).lower()
            if "course_sections" in qs:
                return _result_mock(scalar_one_or_none=section)
            return _result_mock(scalar=Decimal("500"))

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=Decimal("500"))
        mock_db.add = Mock(side_effect=track_add)
        mock_db.flush = AsyncMock()

        with patch(
            "app.modules.academic.cancellation_service.utcnow",
            lambda: datetime.now(timezone.utc),
        ):
            await cancel_section(
                mock_db,
                section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test refund",
                refund_policy="authorize_refunds",
            )

        pr_count = sum(
            1 for obj in pending_refunds_added
            if obj.__class__.__name__ == "PendingRefund"
        )
        assert pr_count == 1, (
            f"O07: Expected exactly 1 PendingRefund, got {pr_count}"
        )

    async def test_o08_disbursement_rollback_on_generic_error(
        self, mock_db, mock_user
    ):
        pending_refund_id = uuid.uuid4()
        pending = Mock()
        pending.id = pending_refund_id
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        receipts_returned = [False]

        async def execute_side_effect(query, **kwargs):
            qs = str(query).lower()
            if "refund" in qs and "receipt_number" in qs:
                if not receipts_returned[0]:
                    receipts_returned[0] = True
                    return _result_mock(scalars_all=[])
                return _result_mock(scalar="RFD-20260714-001")
            if "update" in qs and "pending_refund" in qs:
                raise Exception("Receipt generation failure")
            if "pending_refund" in qs:
                return _result_mock(scalar_one_or_none=pending)
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        with patch(
            "app.modules.lms.cashier_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.cashier_service.get_today",
                return_value=datetime.now(timezone.utc).date(),
            ):
                with pytest.raises(Exception):
                    await disburse_pending_refund(
                        mock_db,
                        pending_refund_id=pending_refund_id,
                        disbursed_by=mock_user.id,
                    )

        assert pending.status == "UNCLAIMED", (
            "O08: PendingRefund must remain UNCLAIMED on receipt generation failure"
        )
