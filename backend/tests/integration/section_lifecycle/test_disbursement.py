from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import re
import pytest

from app.modules.lms.cashier_service import (
    disburse_pending_refund,
    get_pending_refunds_queue,
    get_cashier_refund_history,
)


DATE_TODAY = date(2026, 7, 10)


def _make_result(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    return m


@pytest.fixture(autouse=True)
def mock_get_today(monkeypatch):
    monkeypatch.setattr(
        "app.modules.lms.cashier_service.get_today",
        lambda: DATE_TODAY,
    )


@pytest.fixture(autouse=True)
def mock_is_date_closed(monkeypatch):
    monkeypatch.setattr(
        "app.modules.lms.cashier_service.is_date_closed",
        AsyncMock(return_value=False),
    )


class TestDisbursement:
    async def test_disburse_happy_path(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        call_count = 0
        query_log = []

        async def execute_side_effect(query):
            nonlocal call_count, query_log
            call_count += 1
            qs = str(query)
            query_log.append(qs[:50])
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=0)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        refund = await disburse_pending_refund(
            mock_db, pending_refund_id=pending.id,
            disbursed_by=mock_user.id, notes="E2E test disbursement",
        )

        assert refund is not None
        assert refund.amount == Decimal("500")
        assert refund.disbursed_by == mock_user.id
        assert pending.status == "CLAIMED"

    async def test_receipt_number_format(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=0)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        refund = await disburse_pending_refund(
            mock_db, pending_refund_id=pending.id,
            disbursed_by=mock_user.id,
        )

        assert re.match(r"^RFD-\d{8}-\d{4}$", refund.receipt_number), (
            f"Receipt number {refund.receipt_number} does not match pattern RFD-YYYYMMDD-NNNN"
        )

    async def test_duplicate_disbursement_blocked(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "CLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        with pytest.raises(ValueError) as exc_info:
            await disburse_pending_refund(
                mock_db, pending_refund_id=pending.id,
                disbursed_by=mock_user.id,
            )

        assert "already" in str(exc_info.value).lower()

    async def test_disburse_on_closed_day_blocked(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        with patch("app.modules.lms.cashier_service.is_date_closed", AsyncMock(return_value=True)):
            with pytest.raises(ValueError) as exc_info:
                await disburse_pending_refund(
                    mock_db, pending_refund_id=pending.id,
                    disbursed_by=mock_user.id,
                )
            assert "closed" in str(exc_info.value).lower()

    async def test_disburse_updates_pending_refund_status(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=0)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        await disburse_pending_refund(
            mock_db, pending_refund_id=pending.id,
            disbursed_by=mock_user.id,
        )

        assert pending.status == "CLAIMED"

    async def test_disburse_records_daily_ledger(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "UNCLAIMED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result(scalars_all=[])

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.scalar = AsyncMock(return_value=0)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        refund = await disburse_pending_refund(
            mock_db, pending_refund_id=pending.id,
            disbursed_by=mock_user.id,
        )

        assert refund.receipt_number.startswith("RFD-")
        assert mock_db.add.called

    async def test_claim_forfeited_refund_fails(self, mock_db, mock_user):
        pending = Mock()
        pending.id = uuid.uuid4()
        pending.enrollment_id = uuid.uuid4()
        pending.status = "FORFEITED"
        pending.amount = Decimal("500")

        async def execute_side_effect(query):
            qs = str(query)
            if "pending_refund" in qs.lower():
                return _make_result(scalar_one_or_none=pending)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        with pytest.raises(ValueError) as exc_info:
            await disburse_pending_refund(
                mock_db, pending_refund_id=pending.id,
                disbursed_by=mock_user.id,
            )

        msg = str(exc_info.value).lower()
        assert "already" in msg or "forfeit" in msg

    async def test_cashier_refund_history(self, mock_db, mock_user):
        refund_mock = Mock()
        refund_mock.id = uuid.uuid4()
        refund_mock.receipt_number = "RFD-20260710-0001"
        refund_mock.amount = Decimal("500")
        refund_mock.disbursed_by = mock_user.id
        refund_mock.notes = None

        async def execute_side_effect(query):
            qs = str(query)
            if "refund" in qs.lower():
                return _make_result(scalars_all=[refund_mock], scalar=1)
            return _make_result()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        result = await get_cashier_refund_history(mock_db, cashier_id=mock_user.id)

        assert "data" in result
        assert "meta" in result
        assert result["meta"]["total"] == 1
