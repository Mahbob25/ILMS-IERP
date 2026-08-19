from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest

from app.modules.academic.cancellation_service import (
    can_cancel_section,
    cancel_section,
    preview_cancellation_impact,
)


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
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


class TestCancellation:
    async def test_cancel_section_happy_path(self, mock_db, mock_course, mock_teacher_employee, mock_user):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return result_mock(scalar=Decimal("0"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        cancellation = await cancel_section(
            mock_db, section_id=section.id,
            cancelled_by=mock_user.id,
            reason="Section no longer viable",
            refund_policy="no_refund",
        )

        assert cancellation is not None
        assert cancellation.section_id == section.id
        assert cancellation.refund_policy == "no_refund"
        assert section.status == "cancelled"

    async def test_cancel_section_no_refund(self, mock_db, mock_course, mock_teacher_employee, mock_user):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return result_mock(scalar=Decimal("0"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        cancellation = await cancel_section(
            mock_db, section_id=section.id,
            cancelled_by=mock_user.id,
            reason="Test no refund",
            refund_policy="no_refund",
        )

        assert cancellation.refund_policy == "no_refund"
        assert cancellation.total_refund_authorized == 0

    async def test_cancel_section_authorize_refund(self, mock_db, mock_course, mock_teacher_employee, mock_user, mock_student):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return result_mock(scalar=500)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        cancellation = await cancel_section(
            mock_db, section_id=section.id,
            cancelled_by=mock_user.id,
            reason="Test with refunds",
            refund_policy="authorize_refunds",
        )

        assert cancellation.refund_policy == "authorize_refunds"
        assert mock_db.add.called

    async def test_cancel_already_completed_fails(self):
        section = Mock()
        section.status = "completed"
        section.attendance_sessions = []
        section.final_grades = []
        section.certificates = []

        precondition = await can_cancel_section(section)

        assert precondition.can_cancel is False
        assert len(precondition.warnings) > 0

    async def test_cancel_with_certificates_fails(self):
        section = Mock()
        section.status = "active"
        section.attendance_sessions = []
        section.final_grades = []
        section.certificates = [Mock()]

        precondition = await can_cancel_section(section)

        assert precondition.can_cancel is False
        assert any("certificate" in w.lower() for w in precondition.warnings)

    async def test_cancel_reverses_teacher_wallet(self, mock_db, mock_course, mock_teacher_employee, mock_user, mock_contract):
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

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),  # section query
            ledger_aggr,  # ledger aggregate
            result_mock(scalar=Decimal("0")),  # payments sum
        ])
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        with patch("app.modules.academic.cancellation_service.ledger_cancel_contract", AsyncMock()):
            cancellation = await cancel_section(
                mock_db, section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Cancel with wallet reversal",
                refund_policy="no_refund",
            )

        assert cancellation.teacher_wallet_reversal_amount > 0

    async def test_cancel_rollback_on_db_failure(self, mock_db, mock_course, mock_teacher_employee, mock_user):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return result_mock(scalar=Decimal("0"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = Mock(side_effect=Exception("DB failure"))

        with pytest.raises(Exception):
            await cancel_section(
                mock_db, section_id=section.id,
                cancelled_by=mock_user.id,
                reason="Test rollback",
                refund_policy="no_refund",
            )

        # On DB failure, the cancellation record should not have been committed
        # Verify db.commit was never called (since flush failed)
        mock_db.flush.assert_not_called()

    async def test_preview_shows_correct_impact(self, mock_db, mock_course, mock_teacher_employee, mock_student):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                mr = result_mock()
                mr.one.return_value = (Decimal("0"), Decimal("0"))
                return mr
            if "sum" in qs:
                return result_mock(scalar=Decimal("500"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        preview = await preview_cancellation_impact(mock_db, section.id)

        assert preview.enrolled_count == 1
        assert preview.payments_collected == Decimal("500")

    async def test_cancel_saves_audit_record(self, mock_db, mock_course, mock_teacher_employee, mock_user):
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

        def side_effect(query):
            qs = str(query)
            if "course_sections" in qs:
                return result_mock(scalar_one_or_none=section)
            if "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "sum" in qs:
                return result_mock(scalar=Decimal("0"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        cancellation = await cancel_section(
            mock_db, section_id=section.id,
            cancelled_by=mock_user.id,
            reason="Audit test",
            refund_policy="no_refund",
        )

        assert cancellation.reason == "Audit test"
        assert cancellation.cancelled_by == mock_user.id
