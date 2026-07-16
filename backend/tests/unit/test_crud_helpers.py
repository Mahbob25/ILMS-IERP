import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, Mock
import pytest

from app.modules.lms.financial_service import get_next_receipt_number, get_next_voucher_number
from app.modules.academic.service import (
    _calculate_net_price, _sum_payments_for_enrollment,
    _count_enrolled_students, _section_has_payments, _is_date_closed,
    get_course, get_course_section, get_student, get_enrollment,
    find_student_by_code, get_student_final_grade, delete_course,
    delete_course_section, delete_student, delete_enrollment,
    create_course, update_course, update_student, create_student,
)
from app.modules.academic.unenrollment_service import calculate_reversal_amount
from app.modules.lms.financial_service import get_teacher_wallet, get_payment, get_expense
from app.modules.lms.ledger_service import get_or_create_wallet, get_wallet_summary


@pytest.mark.asyncio
class TestPureFunctions:
    async def test_calculate_net_price_with_discount(self):
        enrollment = MagicMock()
        enrollment.agreed_price = Decimal("5000")
        enrollment.admin_discount = Decimal("10")
        result = _calculate_net_price(enrollment)
        assert result == Decimal("4500")

    async def test_calculate_net_price_no_discount(self):
        enrollment = MagicMock()
        enrollment.agreed_price = Decimal("5000")
        enrollment.admin_discount = None
        result = _calculate_net_price(enrollment)
        assert result == Decimal("5000")

    async def test_calculate_net_price_zero_price(self):
        enrollment = MagicMock()
        enrollment.agreed_price = None
        enrollment.admin_discount = None
        result = _calculate_net_price(enrollment)
        assert result == Decimal("0")


@pytest.mark.asyncio
class TestSequenceHelpers:
    async def test_get_next_receipt_number_first(self):
        mock_db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = ""
        mock_db.execute = AsyncMock(return_value=result_mock)
        result = await get_next_receipt_number(mock_db, date(2026, 7, 14))
        assert result == "RCP-20260714-0001"

    async def test_get_next_receipt_number_sequential(self):
        mock_db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = "RCP-20260714-0005"
        mock_db.execute = AsyncMock(return_value=result_mock)
        result = await get_next_receipt_number(mock_db, date(2026, 7, 14))
        assert result == "RCP-20260714-0006"

    async def test_get_next_voucher_number_first(self):
        mock_db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = ""
        mock_db.execute = AsyncMock(return_value=result_mock)
        result = await get_next_voucher_number(mock_db, date(2026, 7, 14))
        assert result == "VCH-20260714-0001"

    async def test_get_next_voucher_number_sequential(self):
        mock_db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar.return_value = "VCH-20260714-0003"
        mock_db.execute = AsyncMock(return_value=result_mock)
        result = await get_next_voucher_number(mock_db, date(2026, 7, 14))
        assert result == "VCH-20260714-0004"


@pytest.mark.asyncio
class TestAggregateHelpers:
    async def test_sum_payments_for_enrollment(self, mock_db):
        mock_db.scalar = AsyncMock(return_value=Decimal("3000"))
        result = await _sum_payments_for_enrollment(mock_db, uuid.uuid4())
        assert result == Decimal("3000")

    async def test_sum_payments_no_payments(self, mock_db):
        mock_db.scalar = AsyncMock(return_value=0)
        result = await _sum_payments_for_enrollment(mock_db, uuid.uuid4())
        assert result == 0

    async def test_count_enrolled_students(self, mock_db):
        mock_db.scalar = AsyncMock(return_value=15)
        result = await _count_enrolled_students(mock_db, uuid.uuid4())
        assert result == 15

    async def test_section_has_payments(self, mock_db):
        r = MagicMock()
        r.scalar.return_value = True
        mock_db.execute = AsyncMock(return_value=r)
        result = await _section_has_payments(mock_db, uuid.uuid4())
        assert result is True

    async def test_section_has_no_payments(self, mock_db):
        r = MagicMock()
        r.scalar.return_value = False
        mock_db.execute = AsyncMock(return_value=r)
        result = await _section_has_payments(mock_db, uuid.uuid4())
        assert result is False


@pytest.mark.asyncio
class TestDateCheckHelpers:
    async def test_is_date_closed_true(self, mock_db):
        mock_db.scalar = AsyncMock(return_value=MagicMock())
        result = await _is_date_closed(mock_db, date(2026, 7, 14))
        assert result is True

    async def test_is_date_closed_false(self, mock_db):
        mock_db.scalar = AsyncMock(return_value=None)
        result = await _is_date_closed(mock_db, date(2026, 7, 14))
        assert result is False


@pytest.mark.asyncio
class TestSimpleCRUD:
    def _make_execute(self, scalar_one_or_none_value=None):
        r = MagicMock()
        r.scalar_one_or_none.return_value = scalar_one_or_none_value
        r.unique.return_value = r
        return r

    async def test_get_course(self, mock_db):
        r = self._make_execute(MagicMock(name="Test"))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_course(mock_db, uuid.uuid4())
        assert result is not None

    async def test_get_course_not_found(self, mock_db):
        r = self._make_execute(None)
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_course(mock_db, uuid.uuid4())
        assert result is None

    async def test_get_course_section(self, mock_db):
        section_id = uuid.uuid4()
        r = self._make_execute(MagicMock(id=section_id))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_course_section(mock_db, section_id)
        assert result is not None
        assert result.id == section_id

    async def test_get_student(self, mock_db):
        r = self._make_execute(MagicMock(id=uuid.uuid4()))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_student(mock_db, uuid.uuid4())
        assert result is not None

    async def test_get_enrollment(self, mock_db):
        enrollment_id = uuid.uuid4()
        r = self._make_execute(MagicMock(id=enrollment_id))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_enrollment(mock_db, enrollment_id)
        assert result is not None
        assert result.id == enrollment_id

    async def test_find_student_by_code(self, mock_db):
        r = self._make_execute(MagicMock(student_code="STU001"))
        mock_db.execute = AsyncMock(return_value=r)
        result = await find_student_by_code(mock_db, "STU001")
        assert result is not None
        assert result.student_code == "STU001"

    async def test_find_student_by_code_not_found(self, mock_db):
        r = self._make_execute(None)
        mock_db.execute = AsyncMock(return_value=r)
        result = await find_student_by_code(mock_db, "NONEXIST")
        assert result is None

    async def test_get_student_final_grade(self, mock_db):
        r = self._make_execute(MagicMock(score=Decimal("85")))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_student_final_grade(mock_db, uuid.uuid4(), uuid.uuid4())
        assert result is not None
        assert result.score == Decimal("85")

    async def test_get_student_final_grade_not_found(self, mock_db):
        r = self._make_execute(None)
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_student_final_grade(mock_db, uuid.uuid4(), uuid.uuid4())
        assert result is None


@pytest.mark.asyncio
class TestSoftDelete:
    async def test_delete_course(self, mock_db):
        course = MagicMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = course
        mock_db.execute = AsyncMock(return_value=r)
        result = await delete_course(mock_db, uuid.uuid4())
        assert result is True
        assert course.deleted_at is not None

    async def test_delete_course_section(self, mock_db):
        section = MagicMock()
        u = MagicMock()
        u.scalar_one_or_none.return_value = section
        r = MagicMock()
        r.unique.return_value = u
        mock_db.execute = AsyncMock(return_value=r)
        result = await delete_course_section(mock_db, uuid.uuid4())
        assert result is True
        assert section.deleted_at is not None

    async def test_delete_student(self, mock_db):
        student = MagicMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = student
        mock_db.execute = AsyncMock(return_value=r)
        result = await delete_student(mock_db, uuid.uuid4())
        assert result is True
        assert student.deleted_at is not None

    async def test_delete_enrollment(self, mock_db):
        enrollment = MagicMock()
        enrollment.section_id = uuid.uuid4()
        section = MagicMock(enrolled_count=5)
        r = MagicMock()
        r.scalar_one_or_none.return_value = enrollment
        u = MagicMock()
        u.scalar_one_or_none.return_value = section
        r.unique.return_value = u
        mock_db.execute = AsyncMock(return_value=r)
        result = await delete_enrollment(mock_db, uuid.uuid4())
        assert result is True
        assert enrollment.deleted_at is not None
        assert section.enrolled_count == 4

    async def test_delete_enrollment_no_section(self, mock_db):
        enrollment = MagicMock()
        enrollment.section_id = uuid.uuid4()
        r = MagicMock()
        r.scalar_one_or_none.return_value = enrollment
        u = MagicMock()
        u.scalar_one_or_none.return_value = None
        r.unique.return_value = u
        mock_db.execute = AsyncMock(return_value=r)
        result = await delete_enrollment(mock_db, uuid.uuid4())
        assert result is True
        assert enrollment.deleted_at is not None


@pytest.mark.asyncio
class TestUpdateCRUD:
    async def test_update_course(self, mock_db):
        course = MagicMock()
        course.code = "OLD"
        r = MagicMock()
        r.scalar_one_or_none.return_value = course
        mock_db.execute = AsyncMock(return_value=r)
        result = await update_course(mock_db, uuid.uuid4(), {"name": "New Name", "code": "NEW"})
        assert result.code == "NEW"
        assert result.name == "New Name"

    async def test_update_student(self, mock_db):
        student = MagicMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = student
        mock_db.execute = AsyncMock(return_value=r)
        result = await update_student(mock_db, uuid.uuid4(), {"full_name": "New Name"})
        assert result.full_name == "New Name"


@pytest.mark.asyncio
class TestFinancialLookups:
    async def test_get_teacher_wallet(self, mock_db):
        r = MagicMock()
        r.scalar_one_or_none.return_value = MagicMock(balance=Decimal("1000"))
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_teacher_wallet(mock_db, uuid.uuid4())
        assert result is not None
        assert result.balance == Decimal("1000")

    async def test_get_teacher_wallet_not_found(self, mock_db):
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_teacher_wallet(mock_db, uuid.uuid4())
        assert result is None

    async def test_get_payment(self, mock_db):
        payment_id = uuid.uuid4()
        payment = MagicMock(
            id=payment_id, amount=Decimal("500"), payment_method="cash",
            enrollment_id=uuid.uuid4(), date=date(2026, 7, 10),
            receipt_number="R-001", transaction_number="TXN-001",
            created_by=uuid.uuid4(), created_by_user=None,
        )
        r = MagicMock()
        r.scalar_one_or_none.return_value = payment
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_payment(mock_db, payment_id)
        assert result is not None
        assert result["id"] == payment_id

    async def test_get_expense(self, mock_db):
        expense_id = uuid.uuid4()
        expense = MagicMock(
            id=expense_id, amount=Decimal("200"), description="Office supplies",
            recipient_name="Vendor", recipient_id=None, date=date(2026, 7, 10),
            receipt_number="E-001", type="materials", created_by=uuid.uuid4(),
            created_by_user=None,
        )
        r = MagicMock()
        r.scalar_one_or_none.return_value = expense
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_expense(mock_db, expense_id)
        assert result is not None
        assert result["id"] == expense_id

    async def test_get_expense_not_found(self, mock_db):
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=r)
        result = await get_expense(mock_db, uuid.uuid4())
        assert result is None


@pytest.mark.asyncio
class TestReversalHelper:
    async def test_calculate_reversal_amount(self, mock_db):
        r = MagicMock()
        r.scalar.return_value = Decimal("1200")
        mock_db.execute = AsyncMock(return_value=r)
        result = await calculate_reversal_amount(mock_db, uuid.uuid4())
        assert result == Decimal("1200")

    async def test_calculate_reversal_amount_zero(self, mock_db):
        r = MagicMock()
        r.scalar.return_value = Decimal("0")
        mock_db.execute = AsyncMock(return_value=r)
        result = await calculate_reversal_amount(mock_db, uuid.uuid4())
        assert result == Decimal("0")


@pytest.mark.asyncio
class TestLedgerHelpers:
    async def test_get_or_create_wallet_creates_new(self, mock_db):
        wallet = MagicMock(balance=Decimal("0"), frozen_balance=Decimal("0"))
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(),
            MagicMock(scalar_one_or_none=MagicMock(return_value=wallet)),
        ])
        result = await get_or_create_wallet(mock_db, uuid.uuid4())
        assert result is not None
        assert result.balance == Decimal("0")

    async def test_get_or_create_wallet_exists(self, mock_db):
        wallet = MagicMock(balance=Decimal("500"), frozen_balance=Decimal("100"))
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(),
            MagicMock(scalar_one_or_none=MagicMock(return_value=wallet)),
        ])
        result = await get_or_create_wallet(mock_db, uuid.uuid4())
        assert result is not None
        assert result.balance == Decimal("500")
