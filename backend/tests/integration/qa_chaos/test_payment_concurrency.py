import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, Mock, patch
import asyncio
import pytest

from app.modules.lms.financial_service import create_payment


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


class TestPaymentConcurrency:

    async def test_concurrent_payments_no_overpay(self, mock_db, mock_user):
        enrollment_id = uuid.uuid4()
        AGREED_PRICE = Decimal("1000.00")
        total_paid_so_far = Decimal("0")
        total_paid_lock = asyncio.Lock()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.contract = contract
        section.price = AGREED_PRICE
        section.teacher_percentage = None
        section.teacher_id = None

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section
        enrollment.agreed_price = AGREED_PRICE
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        attempted_amount = Decimal("200.00")

        async def execute_side_effect(*args, **kwargs):
            nonlocal total_paid_so_far
            qs = str(args[0])
            if "enrollments" in qs.lower() and "enrollments.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = enrollment
                return r
            if "sum" in qs.lower() and "payment" in qs.lower():
                async with total_paid_lock:
                    current = total_paid_so_far
                    total_paid_so_far += attempted_amount
                return _result_mock(scalar=float(current))
            if "coalesce" in qs.lower() and "max" in qs.lower():
                return _result_mock(scalar="")
            if "pg_advisory" in qs.lower():
                return _result_mock()
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                tasks = [
                    create_payment(
                        mock_db,
                        enrollment_id=enrollment_id,
                        amount=200.0,
                        created_by=mock_user.id,
                    )
                    for _ in range(10)
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

        success_count = sum(1 for r in results if r is not None and not isinstance(r, Exception))
        total_paid = success_count * 200

        assert total_paid <= 1000, (
            f"Total paid {total_paid} exceeds max 1000 SAR"
        )
        assert success_count <= 5, (
            f"Expected at most 5 successful payments (1000/200), got {success_count}"
        )

    async def test_payment_select_for_update_on_enrollment(self, mock_db, mock_user):
        enrollment_id = uuid.uuid4()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.contract = contract
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section
        enrollment.agreed_price = Decimal("1000.00")
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        seen_for_update = False
        seen_payment_for_update = False

        async def execute_side_effect(*args, **kwargs):
            nonlocal seen_for_update, seen_payment_for_update
            qs = str(args[0])
            if "enrollment" in qs.lower() and "FOR UPDATE" in qs:
                seen_for_update = True
            if "payment" in qs.lower() and "FOR UPDATE" in qs:
                seen_payment_for_update = True
            if "enrollments" in qs.lower() and "enrollments.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = enrollment
                return r
            if "sum" in qs.lower() and "payment" in qs.lower():
                return _result_mock(scalar=0)
            if "coalesce" in qs.lower() and "max" in qs.lower():
                return _result_mock(scalar="")
            if "pg_advisory" in qs.lower():
                return _result_mock()
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                await create_payment(
                    mock_db,
                    enrollment_id=enrollment_id,
                    amount=100.0,
                    created_by=mock_user.id,
                )

        assert seen_for_update, "Enrollment query should use SELECT ... FOR UPDATE"
        assert seen_payment_for_update, (
            "Payment sum query should use SELECT ... FOR UPDATE"
        )

    async def test_remaining_balance_check_blocks_overpayment(self, mock_db, mock_user):
        enrollment_id = uuid.uuid4()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.contract = contract
        section.price = Decimal("500.00")
        section.teacher_percentage = None
        section.teacher_id = None

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section
        enrollment.agreed_price = Decimal("500.00")
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        async def execute_side_effect(*args, **kwargs):
            qs = str(args[0])
            if "enrollments" in qs.lower() and "enrollments.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = enrollment
                return r
            if "sum" in qs.lower() and "payment" in qs.lower():
                return _result_mock(scalar=500.0)
            if "coalesce" in qs.lower() and "max" in qs.lower():
                return _result_mock(scalar="")
            if "pg_advisory" in qs.lower():
                return _result_mock()
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        from fastapi import HTTPException

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await create_payment(
                        mock_db,
                        enrollment_id=enrollment_id,
                        amount=100.0,
                        created_by=mock_user.id,
                    )

        assert exc_info.value.status_code == 400
        assert "exceeds remaining balance" in str(exc_info.value.detail).lower()
