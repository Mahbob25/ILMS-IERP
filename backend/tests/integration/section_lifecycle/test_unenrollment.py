from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest

from app.modules.academic.unenrollment_service import (
    can_unenroll_student,
    preview_unenrollment_impact,
    unenroll_student,
    calculate_reversal_amount,
)


import app.modules.academic.models as _acad_models
import app.modules.lms.models as _lms_models
import app.modules.identity.models as _identity_models
_ = (_acad_models, _lms_models, _identity_models)


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


def make_enrollment(**kwargs):
    e = Mock()
    e.id = kwargs.get("id", uuid.uuid4())
    e.student_id = kwargs.get("student_id", uuid.uuid4())
    e.section_id = kwargs.get("section_id", uuid.uuid4())
    e.deleted_at = kwargs.get("deleted_at", None)
    e.agreed_price = kwargs.get("agreed_price", Decimal("5000"))
    e.admin_discount = kwargs.get("admin_discount", Decimal("10"))
    e.section = kwargs.get("section")
    e.student = kwargs.get("student")
    return e


def make_section(**kwargs):
    s = Mock()
    s.id = kwargs.get("id", uuid.uuid4())
    s.status = kwargs.get("status", "active")
    s.course = kwargs.get("course")
    s.teacher_employee = kwargs.get("teacher_employee")
    s.teacher_id = kwargs.get("teacher_id")
    s.contract = kwargs.get("contract")
    s.attendance_sessions = kwargs.get("attendance_sessions", [])
    s.enrollments = kwargs.get("enrollments", [])
    s.enrolled_count = kwargs.get("enrolled_count", 5)
    return s


@pytest.fixture(autouse=True)
def mock_utcnow(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.unenrollment_service.utcnow",
        lambda: datetime.now(timezone.utc),
    )


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.unenrollment_service.get_today",
        lambda: date(2026, 7, 12),
    )


class TestCanUnenroll:
    async def test_can_unenroll_active_enrollment(self, mock_db, mock_course, mock_student):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student)

        mock_db.execute.return_value = result_mock(scalar_one_or_none=enrollment)
        mock_db.get.return_value = section

        result = await can_unenroll_student(mock_db, enrollment.id)
        assert result.can_unenroll is True

    async def test_cannot_unenroll_already_deleted(self, mock_db, mock_course, mock_student):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student, deleted_at=datetime.now(timezone.utc))

        mock_db.execute.return_value = result_mock(scalar_one_or_none=enrollment)

        result = await can_unenroll_student(mock_db, enrollment.id)
        assert result.can_unenroll is False

    async def test_cannot_unenroll_completed_section(self, mock_db, mock_course, mock_student):
        section = make_section(course=mock_course, status="completed")
        enrollment = make_enrollment(section=section, student=mock_student)

        mock_db.execute.return_value = result_mock(scalar_one_or_none=enrollment)

        result = await can_unenroll_student(mock_db, enrollment.id)
        assert result.can_unenroll is False

    async def test_cannot_unenroll_cancelled_section(self, mock_db, mock_course, mock_student):
        section = make_section(course=mock_course, status="cancelled")
        enrollment = make_enrollment(section=section, student=mock_student)

        mock_db.execute.return_value = result_mock(scalar_one_or_none=enrollment)

        result = await can_unenroll_student(mock_db, enrollment.id)
        assert result.can_unenroll is False


class TestPreviewUnenrollmentImpact:
    async def test_preview_shows_correct_data(self, mock_db, mock_course, mock_teacher_employee, mock_student):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
            teacher_id=mock_teacher_employee.id,
            contract=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4()),
        )
        enrollment = make_enrollment(section=section, student=mock_student)

        wallet = Mock(balance=Decimal("5000"), frozen_balance=Decimal("500"))

        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            qs = str(args[0]) if args else ""
            if "teacher_wallet" in qs.lower() or "teacher_wallets" in qs.lower():
                return result_mock(scalar_one_or_none=wallet)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "ledger" in qs.lower() and "available_delta" in qs.lower():
                return result_mock(scalar=Decimal("1200"))
            if "sum" in qs and "payment" in qs.lower():
                call_count += 1
                if call_count == 1:
                    return result_mock(scalar=Decimal("3000"))
                return result_mock(scalar=Decimal("0"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        result = await preview_unenrollment_impact(mock_db, enrollment.id)

        assert result.enrollment_id == enrollment.id
        assert result.student_name == mock_student.full_name
        assert result.total_paid == Decimal("3000")
        assert result.teacher_share_reversal_amount == Decimal("1200")
        assert result.has_attendance_records is False
        assert result.has_grades is False
        assert result.can_unenroll is True

    async def test_preview_shows_warnings_for_grades(self, mock_db, mock_course, mock_student):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student)

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = True
                return r
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        result = await preview_unenrollment_impact(mock_db, enrollment.id)

        assert result.has_grades is True
        assert "grades" in result.warnings[0].lower() or "grades" in str(result.warnings)


class TestUnenrollStudent:
    async def test_unenroll_no_payments(self, mock_db, mock_course, mock_teacher_employee, mock_student, mock_user):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
        )
        enrollment = make_enrollment(section=section, student=mock_student)

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "ledger" in qs.lower() or "payments" in qs:
                return result_mock(scalar=Decimal("0"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        record = await unenroll_student(
            mock_db,
            enrollment_id=enrollment.id,
            unenrolled_by=mock_user.id,
            reason="Student requested withdrawal",
            refund_policy="no_refund",
        )

        assert record is not None
        assert record.refund_policy == "no_refund"
        assert record.total_paid == Decimal("0")
        assert record.teacher_share_reversed == Decimal("0")

    async def test_unenroll_with_refund(self, mock_db, mock_course, mock_teacher_employee, mock_student, mock_user):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
            contract=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4()),
        )
        enrollment = make_enrollment(section=section, student=mock_student)
        wallet = Mock(id=uuid.uuid4(), balance=Decimal("5000"), frozen_balance=Decimal("500"))
        wallet.teacher_id = uuid.uuid4()

        def side_effect(query):
            qs = str(query)
            if "teacher_wallet" in qs.lower() or "teacher_wallets" in qs.lower():
                return result_mock(scalar_one_or_none=wallet)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("1200"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("3000"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.scalar = AsyncMock(return_value=None)

        record = await unenroll_student(
            mock_db,
            enrollment_id=enrollment.id,
            unenrolled_by=mock_user.id,
            reason="Student transferred to another section",
            refund_policy="authorize_refund",
        )

        assert record is not None
        assert record.refund_policy == "authorize_refund"
        assert record.total_paid == Decimal("3000")
        assert record.refund_authorized_amount == Decimal("3000")

    async def test_unenroll_no_refund_with_payments(self, mock_db, mock_course, mock_teacher_employee, mock_student, mock_user):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
            contract=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4()),
        )
        enrollment = make_enrollment(section=section, student=mock_student)
        wallet = Mock(id=uuid.uuid4(), balance=Decimal("5000"), frozen_balance=Decimal("500"))
        wallet.teacher_id = uuid.uuid4()

        def side_effect(query):
            qs = str(query)
            if "teacher_wallet" in qs.lower() or "teacher_wallets" in qs.lower():
                return result_mock(scalar_one_or_none=wallet)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("1200"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("3000"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        record = await unenroll_student(
            mock_db,
            enrollment_id=enrollment.id,
            unenrolled_by=mock_user.id,
            reason="Student withdrew — manual refund handled externally",
            refund_policy="no_refund",
        )

        assert record is not None
        assert record.refund_policy == "no_refund"
        assert record.total_paid == Decimal("3000")
        assert record.refund_authorized_amount == Decimal("0")
        assert record.teacher_share_reversed == Decimal("1200")

    async def test_unenroll_force_with_grades(self, mock_db, mock_course, mock_teacher_employee, mock_student, mock_user):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
        )
        enrollment = make_enrollment(section=section, student=mock_student)

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = True
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        record = await unenroll_student(
            mock_db,
            enrollment_id=enrollment.id,
            unenrolled_by=mock_user.id,
            reason="Student expelled — force unenrollment",
            refund_policy="no_refund",
            force=True,
            force_reason="Administrative decision — student grades voided",
        )

        assert record is not None
        assert record.has_grades is True

    async def test_unenroll_fails_without_force_when_grades_exist(self, mock_db, mock_course, mock_student, mock_user):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student)

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = True
                return r
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with pytest.raises(ValueError, match="has entered grades"):
            await unenroll_student(
                mock_db,
                enrollment_id=enrollment.id,
                unenrolled_by=mock_user.id,
                reason="Test",
                refund_policy="no_refund",
                force=False,
            )

    async def test_unenroll_blocked_by_certificates(self, mock_db, mock_course, mock_student, mock_user):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student)

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = True
                return r
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with pytest.raises(ValueError, match="certificates"):
            await unenroll_student(
                mock_db,
                enrollment_id=enrollment.id,
                unenrolled_by=mock_user.id,
                reason="Test",
                refund_policy="no_refund",
            )

    async def test_unenroll_blocked_on_closed_day(self, mock_db, mock_course, mock_student, mock_user, monkeypatch):
        section = make_section(
            course=mock_course,
            contract=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4()),
        )
        enrollment = make_enrollment(section=section, student=mock_student)
        wallet = Mock(id=uuid.uuid4(), balance=Decimal("5000"), frozen_balance=Decimal("500"))
        wallet.teacher_id = uuid.uuid4()

        monkeypatch.setattr(
            "app.modules.academic.service._is_date_closed",
            AsyncMock(return_value=True),
        )

        def side_effect(query):
            qs = str(query)
            if "teacher_wallet" in qs.lower() or "teacher_wallets" in qs.lower():
                return result_mock(scalar_one_or_none=wallet)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("1200"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("3000"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        with pytest.raises(ValueError, match="closed financial day"):
            await unenroll_student(
                mock_db,
                enrollment_id=enrollment.id,
                unenrolled_by=mock_user.id,
                reason="Test",
                refund_policy="authorize_refund",
            )

    async def test_unenroll_partial_refund(self, mock_db, mock_course, mock_teacher_employee, mock_student, mock_user):
        section = make_section(
            course=mock_course,
            teacher_employee=mock_teacher_employee,
            contract=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4()),
        )
        enrollment = make_enrollment(section=section, student=mock_student)
        wallet = Mock(id=uuid.uuid4(), balance=Decimal("5000"), frozen_balance=Decimal("500"))
        wallet.teacher_id = uuid.uuid4()

        def side_effect(query):
            qs = str(query)
            if "teacher_wallet" in qs.lower() or "teacher_wallets" in qs.lower():
                return result_mock(scalar_one_or_none=wallet)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("1200"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("3000"))
            if "daily_jobs" in qs.lower():
                return result_mock(scalar_one_or_none=None)
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.scalar = AsyncMock(return_value=None)

        record = await unenroll_student(
            mock_db,
            enrollment_id=enrollment.id,
            unenrolled_by=mock_user.id,
            reason="Partial refund agreed",
            refund_policy="authorize_refund",
            refund_amount=Decimal("1500"),
        )

        assert record.refund_authorized_amount == Decimal("1500")

    async def test_unenroll_fails_refund_exceeds_paid(self, mock_db, mock_course, mock_student, mock_user, monkeypatch):
        section = make_section(course=mock_course)
        enrollment = make_enrollment(section=section, student=mock_student)

        monkeypatch.setattr(
            "app.modules.academic.service._is_date_closed",
            AsyncMock(return_value=False),
        )

        def side_effect(query):
            qs = str(query)
            if "enrollments" in qs and "student" in qs.lower():
                return result_mock(scalar_one_or_none=enrollment)
            if "certificate" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "final" in qs.lower() and "grade" in qs.lower():
                r = Mock()
                r.scalar.return_value = False
                return r
            if "ledger_entry" in qs.lower() or "ledger" in qs.lower():
                return result_mock(scalar=Decimal("0"))
            if "payment" in qs.lower():
                return result_mock(scalar=Decimal("3000"))
            return result_mock()

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with pytest.raises(ValueError, match="cannot exceed total paid"):
            await unenroll_student(
                mock_db,
                enrollment_id=enrollment.id,
                unenrolled_by=mock_user.id,
                reason="Test",
                refund_policy="authorize_refund",
                refund_amount=Decimal("5000"),
            )
