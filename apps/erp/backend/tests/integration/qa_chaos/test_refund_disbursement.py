import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, Mock, patch
import asyncio
import pytest

from app.modules.lms.cashier_service import disburse_pending_refund


def _make_result(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    return m


class TestRefundDisbursement:

    async def test_concurrent_disbursement_only_one_succeeds(self, mock_user):
        pending_refund_id = uuid.uuid4()

        claim_count = 0
        count_lock = asyncio.Lock()

        async def try_disburse():
            nonlocal claim_count

            pending = Mock()
            pending.id = pending_refund_id
            pending.enrollment_id = uuid.uuid4()
            pending.status = "UNCLAIMED"
            pending.amount = Decimal("500")

            async def execute_side_effect(query, **kwargs):
                nonlocal claim_count
                qs = str(query).lower()
                if "refund" in qs and "receipt_number" in qs:
                    return _make_result(scalars_all=[])
                if "update" in qs and "pending_refund" in qs:
                    async with count_lock:
                        if claim_count == 0:
                            claim_count += 1
                            return _make_result(scalar_one_or_none=pending)
                    return _make_result(scalar_one_or_none=None)
                if "pending_refund" in qs:
                    return _make_result(scalar_one_or_none=pending)
                return _make_result()

            db = AsyncMock()
            db.execute = AsyncMock(side_effect=execute_side_effect)
            db.add = Mock()
            db.flush = AsyncMock()

            with patch(
                "app.modules.lms.cashier_service.is_date_closed",
                AsyncMock(return_value=False),
            ):
                with patch(
                    "app.modules.lms.cashier_service.get_today",
                    return_value=date(2026, 7, 14),
                ):
                    try:
                        result = await disburse_pending_refund(
                            db,
                            pending_refund_id=pending_refund_id,
                            disbursed_by=mock_user.id,
                        )
                        return result is not None
                    except ValueError:
                        return False

        tasks = [try_disburse() for _ in range(5)]
        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r)
        assert success_count == 1, (
            f"Expected exactly 1 successful disbursement, got {success_count}"
        )

    async def test_conditional_update_prevents_double_claim(self, mock_db, mock_user):
        pending_refund_id = uuid.uuid4()
        pending = Mock()
        pending.id = pending_refund_id
        pending.enrollment_id = uuid.uuid4()
        pending.status = "CLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query, **kwargs):
            qs = str(query).lower()
            if "update" in qs and "pending_refund" in qs:
                return _make_result(scalar_one_or_none=None)
            if "pending_refund" in qs:
                return _make_result(scalar_one_or_none=pending)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()

        with patch(
            "app.modules.lms.cashier_service.is_date_closed",
            AsyncMock(return_value=False),
        ):
            with patch(
                "app.modules.lms.cashier_service.get_today",
                return_value=date(2026, 7, 14),
            ):
                with pytest.raises(ValueError) as exc_info:
                    await disburse_pending_refund(
                        mock_db,
                        pending_refund_id=pending_refund_id,
                        disbursed_by=mock_user.id,
                    )

        msg = str(exc_info.value).lower()
        assert "already" in msg or "not found" in msg

    async def test_disburse_on_closed_day_blocked(self, mock_db, mock_user):
        pending_refund_id = uuid.uuid4()
        pending = Mock()
        pending.id = pending_refund_id
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        with patch(
            "app.modules.lms.cashier_service.is_date_closed",
            AsyncMock(return_value=True),
        ):
            with pytest.raises(ValueError) as exc_info:
                await disburse_pending_refund(
                    mock_db,
                    pending_refund_id=pending_refund_id,
                    disbursed_by=mock_user.id,
                )

        assert "close" in str(exc_info.value).lower()
