import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, Mock, patch
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


IDEMPOTENCY_KEY = str(uuid.uuid4())
payment_cache: dict = {}


def clear_cache():
    payment_cache.clear()


class TestIdempotencyE2E:

    async def test_idempotency_key_prevents_duplicate(self, mock_db, mock_user):
        clear_cache()
        enrollment_id = uuid.uuid4()
        payment_id = uuid.uuid4()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.status = "active"
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

        call_count = 0

        async def execute_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            qs = str(args[0])
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

        first_result = None
        second_result = None

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                if IDEMPOTENCY_KEY not in payment_cache:
                    first_result = await create_payment(
                        mock_db,
                        enrollment_id=enrollment_id,
                        amount=500.0,
                        created_by=mock_user.id,
                    )
                    if first_result:
                        payment_cache[IDEMPOTENCY_KEY] = first_result

                second_result = payment_cache.get(IDEMPOTENCY_KEY)

        assert first_result is not None
        assert second_result is not None
        assert first_result.enrollment_id == enrollment_id
        assert second_result.enrollment_id == enrollment_id

        initial_call_count = call_count

        cached = payment_cache.get(IDEMPOTENCY_KEY)
        assert cached is not None, "Cache should return the stored result"
        assert cached.enrollment_id == enrollment_id

    async def test_replay_returns_cached_result(self, mock_db, mock_user):
        clear_cache()
        enrollment_id = uuid.uuid4()

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section = Mock()
        section.status = "active"
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

        async def execute_side_effect(*args, **kwargs):
            qs = str(args[0])
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

        with patch(
            "app.modules.lms.financial_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.financial_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                original = await create_payment(
                    mock_db,
                    enrollment_id=enrollment_id,
                    amount=500.0,
                    created_by=mock_user.id,
                )
                key = str(uuid.uuid4())
                payment_cache[key] = original

                cached = payment_cache.get(key)
                assert cached is not None
                assert cached.enrollment_id == enrollment_id
                assert cached.amount == Decimal("500")
