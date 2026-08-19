import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


# ─── void_expense ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_void_teacher_withdrawal_happy_path(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.amount = Decimal("500")
    expense.type = "teacher_withdrawal"
    expense.recipient_id = uuid.uuid4()
    expense.receipt_number = "VCH-20260806-0001"
    expense.date = date(2026, 8, 6)
    expense.created_at = datetime.now(timezone.utc)
    expense.voided_at = None
    expense.voided_by = None
    expense.void_reason = None

    wallet = MagicMock()
    wallet.id = uuid.uuid4()

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=False)):
        with patch("app.modules.lms.financial_service.get_or_create_wallet", AsyncMock(return_value=wallet)):
            with patch("app.modules.lms.financial_service.ledger_record", AsyncMock()):
                result = await void_expense(mock_db, expense.id, "test reason", uuid.uuid4())
                assert result.voided_at is not None
                assert result.void_reason == "test reason"


@pytest.mark.asyncio
async def test_void_rejects_already_voided(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.voided_at = datetime.now(timezone.utc)

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))

    with pytest.raises(ValueError, match="already voided"):
        await void_expense(mock_db, expense.id, "reason", uuid.uuid4())


@pytest.mark.asyncio
async def test_void_rejects_non_money_expenses(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.type = "general_expense"
    expense.voided_at = None

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))

    with pytest.raises(ValueError, match="Only teacher withdrawals and salary draws"):
        await void_expense(mock_db, expense.id, "reason", uuid.uuid4())


@pytest.mark.asyncio
async def test_void_requires_reason(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.type = "salary_draw"
    expense.voided_at = None
    expense.date = date(2026, 8, 6)
    expense.created_at = datetime.now(timezone.utc)

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))

    with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=False)):
        with pytest.raises(ValueError, match="void_reason is required"):
            await void_expense(mock_db, expense.id, "   ", uuid.uuid4())


@pytest.mark.asyncio
async def test_void_rejects_closed_date(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.type = "salary_draw"
    expense.voided_at = None
    expense.date = date(2026, 8, 6)
    expense.created_at = datetime.now(timezone.utc)

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))

    with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=True)):
        with pytest.raises(ValueError, match="closed"):
            await void_expense(mock_db, expense.id, "reason", uuid.uuid4())


@pytest.mark.asyncio
async def test_void_rejects_expired_window(mock_db):
    from app.modules.lms.financial_service import void_expense

    expense = MagicMock()
    expense.id = uuid.uuid4()
    expense.type = "salary_draw"
    expense.voided_at = None
    expense.date = date(2026, 8, 6)
    expense.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=expense)
    ))

    with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=False)):
        with pytest.raises(ValueError, match="expired"):
            await void_expense(mock_db, expense.id, "reason", uuid.uuid4())


# ─── undo_refund ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_undo_refund_happy_path(mock_db):
    from app.modules.lms.cashier_service import undo_refund

    pending_refund = MagicMock()
    pending_refund.id = uuid.uuid4()
    pending_refund.status = "CLAIMED"

    refund = MagicMock()
    refund.id = uuid.uuid4()
    refund.disbursed_at = datetime.now(timezone.utc)
    refund.pending_refund = pending_refund

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=refund)
    ))
    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("app.modules.lms.cashier_service.is_date_closed", AsyncMock(return_value=False)):
        result = await undo_refund(mock_db, refund.id, uuid.uuid4())
        assert result.status == "UNCLAIMED"


@pytest.mark.asyncio
async def test_undo_refund_rejects_not_found(mock_db):
    from app.modules.lms.cashier_service import undo_refund

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=None)
    ))

    with pytest.raises(ValueError, match="not found"):
        await undo_refund(mock_db, uuid.uuid4(), uuid.uuid4())


@pytest.mark.asyncio
async def test_undo_refund_rejects_expired_window(mock_db):
    from app.modules.lms.cashier_service import undo_refund

    refund = MagicMock()
    refund.id = uuid.uuid4()
    refund.disbursed_at = datetime(2020, 1, 1, tzinfo=timezone.utc)

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=refund)
    ))

    with pytest.raises(ValueError, match="expired"):
        await undo_refund(mock_db, refund.id, uuid.uuid4())


@pytest.mark.asyncio
async def test_undo_refund_rejects_not_claimed(mock_db):
    from app.modules.lms.cashier_service import undo_refund

    pending_refund = MagicMock()
    pending_refund.id = uuid.uuid4()
    pending_refund.status = "UNCLAIMED"

    refund = MagicMock()
    refund.id = uuid.uuid4()
    refund.disbursed_at = datetime.now(timezone.utc)
    refund.pending_refund = pending_refund

    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=refund)
    ))

    with patch("app.modules.lms.cashier_service.is_date_closed", AsyncMock(return_value=False)):
        with pytest.raises(ValueError, match="not in CLAIMED"):
            await undo_refund(mock_db, refund.id, uuid.uuid4())
