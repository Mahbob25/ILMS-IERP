import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_certificate_creation_failure_logged():
    from app.modules.academic.service import complete_section

    section = MagicMock()
    section.id = uuid.uuid4()
    section.status = "active"
    section.contract = MagicMock()
    section.contract.status = "assigned"
    section.price = Decimal("500")
    section.teacher_id = uuid.uuid4()
    section.start_date = date(2026, 8, 1)
    section.class_time = "10:00"
    section.teacher_percentage = None

    enrollment = MagicMock()
    enrollment.id = uuid.uuid4()
    enrollment.student_id = uuid.uuid4()
    enrollment.student = MagicMock(full_name="Test Student")
    enrollment.section = section
    enrollment.deleted_at = None
    enrollment.agreed_price = Decimal("500")
    enrollment.admin_discount = Decimal("0")

    db = AsyncMock()
    db.get = AsyncMock(return_value=section)
    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[enrollment])))
    )
    db.scalar = AsyncMock(side_effect=[None, 1, 1, Decimal("500"), None])
    db.add = AsyncMock()
    db.flush = AsyncMock()

    user = MagicMock()
    user.id = uuid.uuid4()

    with patch("app.modules.academic.service.get_course_section", AsyncMock(return_value=section)):
        with patch("app.modules.academic.service.ledger_activate_contract", AsyncMock()):
            with patch("app.modules.academic.service.ledger_finalize_grades", AsyncMock()):
                with patch("app.modules.academic.service.ledger_settle_contract", AsyncMock()):
                    with patch("app.modules.academic.service.create_certificate") as mock_create:
                        mock_create.side_effect = Exception("Template rendering failed")

                        with patch("app.modules.academic.service.logger") as mock_logger:
                            with pytest.raises(Exception, match="Template rendering failed"):
                                await complete_section(db, section.id, user)

                            mock_logger.error.assert_called_once()
                            log_msg = mock_logger.error.call_args[0][0]
                            assert "Certificate creation failed" in log_msg


@pytest.mark.asyncio
async def test_ledger_finalize_failure_logged():
    from app.modules.academic.service import set_final_grades_bulk

    db = AsyncMock()
    section_id = uuid.uuid4()
    student_id = uuid.uuid4()
    graded_by = uuid.uuid4()

    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    db.add = AsyncMock()
    db.flush = AsyncMock()
    db.scalar = AsyncMock(side_effect=[1, 1])

    grades = [{"student_id": student_id, "final_score": 95.0}]

    with patch("app.modules.academic.service.ledger_finalize_grades") as mock_finalize:
        mock_finalize.side_effect = ValueError("Missing grades for some students")

        with patch("app.modules.academic.service.logger") as mock_logger:
            with pytest.raises(ValueError, match="Missing grades"):
                await set_final_grades_bulk(db, section_id, grades, graded_by)

            mock_logger.error.assert_called_once()
            log_msg = mock_logger.error.call_args[0][0]
            assert "Failed to finalize grades" in log_msg


@pytest.mark.asyncio
async def test_payment_on_non_existent_enrollment_logged(mock_db, mock_user):
    from app.modules.lms.financial_service import create_payment

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("app.modules.lms.financial_service.Payment", MagicMock()):
        with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=False)):
            with patch("app.modules.lms.financial_service.logger") as mock_logger:
                with pytest.raises(ValueError, match="Enrollment not found"):
                    await create_payment(mock_db, uuid.uuid4(), 100, mock_user.id)

                mock_logger.warning.assert_called_once()
                log_msg = mock_logger.warning.call_args[0][0]
                assert "Payment attempted for non-existent enrollment" in log_msg
