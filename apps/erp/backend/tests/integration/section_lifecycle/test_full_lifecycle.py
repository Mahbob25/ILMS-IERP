from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest

from app.modules.academic.service import complete_section, deactivate_section
from app.modules.academic.cancellation_service import cancel_section


DATE_TODAY = date(2026, 7, 10)


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    m.unique.return_value = m
    return m


def _make_section(**kwargs):
    s = Mock()
    s.id = kwargs.get("id", uuid.uuid4())
    s.status = kwargs.get("status", "active")
    s.course = kwargs.get("course")
    s.teacher_id = kwargs.get("teacher_id", uuid.uuid4())
    s.teacher_employee = kwargs.get("teacher_employee") or Mock(full_name="Teacher")
    s.contract = kwargs.get("contract")
    s.price = kwargs.get("price", Decimal("500"))
    s.flags = kwargs.get("flags", {})
    s.enrolled_count = kwargs.get("enrolled_count", 1)
    s.start_date = kwargs.get("start_date")
    s.end_date = kwargs.get("end_date")
    s.attendance_sessions = kwargs.get("attendance_sessions", [])
    s.final_grades = kwargs.get("final_grades", [])
    s.certificates = kwargs.get("certificates", [])
    s.enrollments = kwargs.get("enrollments", [])
    s.cancelled_at = None
    s.cancelled_by = None
    s.cancellation_reason = None
    s.deleted_at = None
    return s


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr("app.modules.academic.service.get_today", lambda: DATE_TODAY)


@pytest.fixture(autouse=True)
def mock_utcnow(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.cancellation_service.utcnow",
        lambda: datetime.now(timezone.utc),
    )


class TestFullLifecycle:
    async def test_full_successful_lifecycle(self, mock_db, mock_user, mock_course, mock_student):
        enrollment = Mock()
        enrollment.id = uuid.uuid4()
        enrollment.section_id = uuid.uuid4()
        enrollment.student_id = mock_student.id
        enrollment.student = mock_student
        enrollment.agreed_price = Decimal("500")
        enrollment.admin_discount = None

        section = _make_section(
            course=mock_course,
            start_date=DATE_TODAY - timedelta(days=90),
            end_date=DATE_TODAY - timedelta(days=1),
        )
        enrollment.section = section
        enrollment.section_id = section.id

        exec_order = [
            result_mock(scalar_one_or_none=section),  # get_course_section
            result_mock(scalar=1),  # enrolled count
            result_mock(scalar=1),  # graded count
            result_mock(scalars_all=[enrollment]),  # enrollments
            result_mock(scalar=Decimal("500")),  # payment sum
            result_mock(scalar_one_or_none=None),  # config
            result_mock(scalars_all=[enrollment]),  # second enrollment query
        ]

        mock_db.execute = AsyncMock(side_effect=exec_order)
        mock_db.scalar = AsyncMock(return_value=1)
        mock_db.flush = AsyncMock()

        with patch("app.modules.academic.service._is_date_closed", AsyncMock(return_value=False)):
            with patch("app.modules.academic.service._get_config_bool", AsyncMock(return_value=True)):
                with patch("app.modules.academic.service.create_certificate", AsyncMock()):
                    result = await complete_section(mock_db, section.id, mock_user)

        assert result is not None
        assert result.status == "completed"

    async def test_cancellation_flow_full(self, mock_db, mock_user, mock_course, mock_student):
        enrollment = Mock()
        enrollment.id = uuid.uuid4()
        enrollment.student_id = mock_student.id
        enrollment.student = mock_student
        enrollment.agreed_price = Decimal("500")
        enrollment.admin_discount = None

        section = _make_section(course=mock_course)
        enrollment.section = section

        exec_order = [
            result_mock(scalar_one_or_none=section),  # cancel_section query
            result_mock(scalar=Decimal("0")),  # ledger sum
            result_mock(scalar=Decimal("0")),  # payments sum
            result_mock(scalar=Decimal("500")),  # enrollment payment sum
        ]
        mock_db.execute = AsyncMock(side_effect=exec_order)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        cancellation = await cancel_section(
            mock_db, section_id=section.id,
            cancelled_by=mock_user.id,
            reason="Full flow cancellation test",
            refund_policy="authorize_refunds",
        )

        assert cancellation is not None
        assert cancellation.refund_policy == "authorize_refunds"

    async def test_deactivation_flow_full(self, mock_db, mock_user):
        section = _make_section(status="active")
        mock_db.get = AsyncMock(return_value=section)
        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar=False),  # _section_has_payments
            result_mock(scalar_one_or_none=None),  # SectionContract
        ])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        result = await deactivate_section(
            mock_db, section.id, mock_user, reason="Schedule change"
        )

        assert result.status == "pending"

    async def test_force_override_flow(self, mock_db, mock_user, mock_course):
        enrollment = Mock()
        enrollment.id = uuid.uuid4()
        enrollment.student_id = uuid.uuid4()
        enrollment.agreed_price = Decimal("500")
        enrollment.admin_discount = None

        section = _make_section(
            course=mock_course,
            start_date=DATE_TODAY - timedelta(days=90),
            end_date=DATE_TODAY - timedelta(days=1),
        )
        enrollment.section = section

        exec_order = [
            result_mock(scalar_one_or_none=section),  # get_course_section
            result_mock(scalars_all=[enrollment]),  # enrollments for payment check
            result_mock(scalars_all=[enrollment]),  # enrollments for certificates
        ]

        mock_db.execute = AsyncMock(side_effect=exec_order)
        mock_db.scalar = AsyncMock(side_effect=[2, 1, Decimal("500")])
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        with patch("app.modules.academic.service._is_date_closed", AsyncMock(return_value=False)):
            with patch("app.modules.academic.service._get_config_bool", AsyncMock(return_value=True)):
                with patch("app.modules.academic.service.create_certificate", AsyncMock()):
                    with patch("app.modules.academic.service._get_ungraded_students", AsyncMock(return_value=[{"full_name": "Ungraded Student"}])):
                        result = await complete_section(
                        mock_db, section.id, mock_user,
                        force=True, force_reason="Emergency manager override",
                    )

        assert result is not None
        assert result.status == "completed"
        assert mock_db.add.called
