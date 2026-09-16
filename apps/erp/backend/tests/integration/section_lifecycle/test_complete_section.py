from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest
from fastapi import HTTPException

from app.modules.academic.service import complete_section


DATE_TODAY = date(2026, 7, 10)


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0, rows_all=None):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.all.return_value = rows_all if rows_all is not None else (scalars_all if scalars_all is not None else [])
    m.scalar.return_value = scalar
    m.unique.return_value = m
    return m


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr(
        "app.modules.academic.service.get_today",
        lambda: DATE_TODAY,
    )


class TestCompleteSection:
    def _make_section(self, **kwargs):
        s = Mock()
        s.id = kwargs.get("id", uuid.uuid4())
        s.status = kwargs.get("status", "active")
        s.price = kwargs.get("price", Decimal("500"))
        s.flags = kwargs.get("flags", {})
        s.contract = kwargs.get("contract")
        s.teacher_id = kwargs.get("teacher_id")
        s.course = kwargs.get("course")
        return s

    def _make_enrollment(self, **kwargs):
        e = Mock()
        e.id = uuid.uuid4()
        e.student_id = kwargs.get("student_id", uuid.uuid4())
        e.agreed_price = kwargs.get("agreed_price", Decimal("500"))
        e.price_override = kwargs.get("price_override")
        e.admin_discount = kwargs.get("admin_discount")
        e.section = kwargs.get("section")
        e.student = kwargs.get("student") or Mock(full_name=kwargs.get("student_name", "Student One"))
        return e

    async def _run(self, mock_db, section_id, user, force=False, force_reason=None):
        with patch("app.modules.academic.service._is_date_closed", AsyncMock(return_value=False)):
            with patch("app.modules.academic.service._get_config_bool", AsyncMock(return_value=True)):
                with patch("app.modules.academic.service.create_certificates_batch", AsyncMock()):
                    return await complete_section(
                        mock_db, section_id, user,
                        force=force, force_reason=force_reason,
                    )

    async def test_complete_section_all_graded(self, mock_db, mock_user):
        section = self._make_section()

        exec_order = [
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[]),
        ]
        mock_db.execute = AsyncMock(side_effect=exec_order)
        mock_db.scalar = AsyncMock(return_value=1)

        result = await self._run(mock_db, section.id, mock_user)

        assert result is not None
        assert result.status == "completed"

    async def test_complete_section_blocked_ungraded(self, mock_db, mock_user):
        section = self._make_section()

        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=section))
        scalar_calls = [2, 1]
        mock_db.scalar = AsyncMock(side_effect=scalar_calls)

        with patch("app.modules.academic.service._get_ungraded_students", AsyncMock(return_value=[{"full_name": "Ungraded Student"}])):
            with pytest.raises(HTTPException) as exc_info:
                await self._run(mock_db, section.id, mock_user)

        assert exc_info.value.status_code == 400
        assert "ungraded" in str(exc_info.value.detail).lower()

    async def test_complete_section_blocked_unpaid(self, mock_db, mock_user):
        section = self._make_section()
        student = Mock(id=uuid.uuid4(), full_name="Unpaid Student")
        enrollment = self._make_enrollment(student_id=student.id, student=student, section=section)

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[enrollment]),
            result_mock(rows_all=[(enrollment.id, Decimal("0"))]),
        ])
        mock_db.scalar = AsyncMock(side_effect=[1, 1])

        with pytest.raises(HTTPException) as exc_info:
            await self._run(mock_db, section.id, mock_user)

        assert exc_info.value.status_code == 400
        assert "unpaid" in str(exc_info.value.detail).lower()

    async def test_force_override_bypasses_grade_check(self, mock_db, mock_user):
        section = self._make_section()

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[]),
        ])
        mock_db.scalar = AsyncMock(side_effect=[2, 1])
        mock_db.add = Mock()

        with patch("app.modules.academic.service._get_ungraded_students", AsyncMock(return_value=[{"full_name": "Ungraded Student"}])):
            result = await self._run(mock_db, section.id, mock_user, force=True, force_reason="Override for ungraded")

        assert result is not None
        assert result.status == "completed"
        assert mock_db.add.called

    async def test_force_override_bypasses_payment_check(self, mock_db, mock_user):
        section = self._make_section()
        student = Mock(id=uuid.uuid4(), full_name="Unpaid Student")
        enrollment = self._make_enrollment(student_id=student.id, student=student, section=section)

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[enrollment]),
            result_mock(rows_all=[(enrollment.id, Decimal("0"))]),
        ])
        mock_db.scalar = AsyncMock(side_effect=[1, 1])
        mock_db.add = Mock()

        result = await self._run(mock_db, section.id, mock_user, force=True, force_reason="Override for unpaid")

        assert result is not None
        assert result.status == "completed"
        assert mock_db.add.called

    async def test_force_requires_reason(self, mock_db, mock_user):
        section = self._make_section()

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[]),
        ])
        mock_db.scalar = AsyncMock(return_value=1)

        result = await self._run(mock_db, section.id, mock_user, force=True, force_reason=None)

        assert result is not None
        assert result.status == "completed"

    async def test_override_audit_log_created(self, mock_db, mock_user):
        section = self._make_section()

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[]),
        ])
        mock_db.scalar = AsyncMock(side_effect=[2, 1])
        mock_db.add = Mock()

        with patch("app.modules.academic.service._get_ungraded_students", AsyncMock(return_value=[{"full_name": "Ungraded Student"}])):
            await self._run(mock_db, section.id, mock_user, force=True, force_reason="Emergency override")

        added = [call.args[0] for call in mock_db.add.call_args_list]
        override_found = any(
            type(item).__name__ == "SectionCompletionOverride"
            for item in added
        )
        assert override_found, "SectionCompletionOverride was not created"

    async def test_daily_closure_blocks_completion(self, mock_db, mock_user):
        section = self._make_section()

        mock_db.execute = AsyncMock(return_value=result_mock(scalar_one_or_none=section))

        with patch("app.modules.academic.service._is_date_closed", AsyncMock(return_value=True)):
            with patch("app.modules.academic.service._get_config_bool", AsyncMock(return_value=True)):
                with patch("app.modules.academic.service.create_certificates_batch", AsyncMock()):
                    with pytest.raises(HTTPException) as exc_info:
                        await complete_section(mock_db, section.id, mock_user)

        assert exc_info.value.status_code == 400
        assert "closed" in str(exc_info.value.detail).lower()

    async def test_complete_section_without_contract(self, mock_db, mock_user):
        section = self._make_section(contract=None, teacher_id=None)

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=section),
            result_mock(scalars_all=[]),
        ])
        mock_db.scalar = AsyncMock(return_value=1)

        result = await self._run(mock_db, section.id, mock_user)

        assert result is not None
        assert result.status == "completed"


class TestSetFinalGradesBulk:
    async def test_set_final_grades_bulk(self, mock_db):
        from app.modules.academic.service import set_final_grades_bulk
        section_id = uuid.uuid4()
        student1_id = uuid.uuid4()
        student2_id = uuid.uuid4()
        graded_by = uuid.uuid4()

        grades = [
            {"student_id": student1_id, "final_score": 95.0, "notes": "Great"},
            {"student_id": student2_id, "final_score": 85.0},
        ]

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalars_all=[]), # batch existing query
            result_mock(scalar_one_or_none=None), # get_course_section
        ])
        mock_db.scalar = AsyncMock(side_effect=[2, 2]) # enrolled_count, graded_count
        mock_db.flush = AsyncMock()
        mock_db.add = Mock()

        with patch("app.modules.academic.service.ledger_finalize_grades", AsyncMock()):
            results = await set_final_grades_bulk(mock_db, section_id, grades, graded_by)

        assert len(results) == 2
        assert mock_db.add.call_count == 2
        assert mock_db.flush.called


class TestCreateCertificatesBatch:
    async def test_create_certificates_batch(self, mock_db):
        from app.modules.academic.certificate_service import create_certificates_batch
        section_id = uuid.uuid4()
        student_id = uuid.uuid4()
        enrollment_id = uuid.uuid4()

        section = Mock(id=section_id, course=Mock(name="Python 101", code="CS101"))
        student = Mock(id=student_id, full_name="John Doe", student_code="STU001")
        enrollment = Mock(id=enrollment_id, section_id=section_id, student_id=student_id, section=section, student=student)

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalars_all=[]), # existing certs check
            result_mock(scalars_all=[]), # final grades fetch
            result_mock(scalar=5), # certificate count for year
        ])
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        certs = await create_certificates_batch(mock_db, [enrollment])

        assert len(certs) == 1
        assert certs[0].certificate_number.startswith("CERT-")
        assert mock_db.add.called
        assert mock_db.flush.called

