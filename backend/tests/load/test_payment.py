import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, Mock, patch
import asyncio
import time

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


@pytest.mark.load
@pytest.mark.asyncio
class TestPaymentLoad:
    async def test_20_concurrent_payments_no_overpay(self):
        enrollment_id = uuid.uuid4()
        BALANCE = Decimal("1000.00")
        PAYMENT_AMOUNT = Decimal("100.00")
        CONCURRENT = 20

        total_paid_so_far = Decimal("0")
        total_paid_lock = asyncio.Lock()
        response_times = []

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.contract = contract
        section.price = BALANCE
        section.teacher_percentage = None
        section.teacher_id = None

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section
        enrollment.agreed_price = BALANCE
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        async def execute_side_effect(query, **kwargs):
            nonlocal total_paid_so_far
            qs = str(query)
            if "enrollment" in qs.lower() and "enrollment.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = enrollment
                return r
            if "sum" in qs.lower() and "payment" in qs.lower():
                async with total_paid_lock:
                    current = total_paid_so_far
                    total_paid_so_far += PAYMENT_AMOUNT
                return _result_mock(scalar=float(current))
            if "coalesce" in qs.lower() and "max" in qs.lower():
                return _result_mock(scalar="")
            if "pg_advisory" in qs.lower():
                return _result_mock()
            return _result_mock()

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.add = Mock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                start_time = time.monotonic()

                tasks = [
                    create_payment(
                        db,
                        enrollment_id=enrollment_id,
                        amount=float(PAYMENT_AMOUNT),
                        created_by=uuid.uuid4(),
                    )
                    for _ in range(CONCURRENT)
                ]
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=30.0,
                )

                total_elapsed = time.monotonic() - start_time

        success_count = sum(
            1 for r in results if r is not None and not isinstance(r, Exception)
        )
        error_count = sum(1 for r in results if isinstance(r, Exception))
        total_paid = success_count * float(PAYMENT_AMOUNT)

        assert total_paid <= float(BALANCE), (
            f"Total paid {total_paid} exceeds balance {float(BALANCE)}"
        )
        max_payments = int(float(BALANCE) / float(PAYMENT_AMOUNT))
        assert success_count <= max_payments, (
            f"Expected at most {max_payments} successful payments, got {success_count}"
        )
        assert success_count + error_count == CONCURRENT, (
            f"Expected {CONCURRENT} total results, got {success_count + error_count}"
        )

    async def test_payment_balance_invariant_under_load(self):
        enrollment_id = uuid.uuid4()
        BALANCE = Decimal("500.00")
        CONCURRENT = 15
        MAX_PAYMENTS = int(float(BALANCE) / 100.0)

        total_paid_so_far = Decimal("0")
        total_paid_lock = asyncio.Lock()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.contract = contract
        section.price = BALANCE
        section.teacher_percentage = None
        section.teacher_id = None

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section
        enrollment.agreed_price = BALANCE
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        payment_amounts = [100.0, 200.0, 50.0, 150.0, 300.0, 75.0, 125.0, 60.0, 90.0, 110.0,
                           80.0, 40.0, 180.0, 70.0, 30.0]

        async def execute_side_effect(query, **kwargs):
            nonlocal total_paid_so_far
            qs = str(query)
            if "enrollment" in qs.lower() and "enrollment.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = enrollment
                return r
            if "sum" in qs.lower() and "payment" in qs.lower():
                async with total_paid_lock:
                    current = total_paid_so_far
                return _result_mock(scalar=float(current))
            if "coalesce" in qs.lower() and "max" in qs.lower():
                return _result_mock(scalar="")
            if "pg_advisory" in qs.lower():
                return _result_mock()
            return _result_mock()

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.add = Mock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        def track_payment(result):
            nonlocal total_paid_so_far
            if result is not None and not isinstance(result, Exception):
                return result
            return result

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
                        db,
                        enrollment_id=enrollment_id,
                        amount=amt,
                        created_by=uuid.uuid4(),
                    )
                    for amt in payment_amounts[:CONCURRENT]
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

        success_count = sum(
            1 for r in results if r is not None and not isinstance(r, Exception)
        )

        total_paid = await _sum_successful_payments(results)
        assert total_paid <= float(BALANCE), (
            f"Total paid {total_paid} exceeds balance {float(BALANCE)}"
        )


async def _sum_successful_payments(results: list) -> float:
    total = 0.0
    for r in results:
        if r is not None and not isinstance(r, Exception):
            from app.modules.lms.models import Payment
            if hasattr(r, "amount"):
                total += float(r.amount)
    return total
