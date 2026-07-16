import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_activate_contract_only_from_assigned(mock_db):
    from app.modules.lms.ledger_service import activate_contract

    contract = MagicMock()
    contract.id = uuid.uuid4()
    contract.status = "assigned"
    contract.teacher_id = uuid.uuid4()
    contract.compensation_model = "fixed"
    contract.fixed_amount = Decimal("1000")
    contract.holdback_rate = Decimal("0.20")
    contract.section_id = uuid.uuid4()
    contract.updated_at = None

    section = MagicMock()
    section.id = contract.section_id
    section.price = Decimal("1000")
    section.start_date = date(2026, 8, 1)
    section.class_time = "10:00"
    section.status = "active"

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(
        scalar_one_or_none=MagicMock(side_effect=[contract, section, contract])
    )
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()
    mock_db.scalar = AsyncMock(return_value=0)

    with patch("app.modules.lms.ledger_service.get_or_create_wallet", AsyncMock(return_value=MagicMock(id=uuid.uuid4(), balance=Decimal("0"), frozen_balance=Decimal("0")))):
        with patch("app.modules.lms.ledger_service.record", AsyncMock()):
            result = await activate_contract(mock_db, contract.id, activated_by=uuid.uuid4())
            assert result is not None


@pytest.mark.asyncio
async def test_activate_contract_rejects_active(mock_db):
    from app.modules.lms.ledger_service import activate_contract

    from app.modules.lms.models import ContractStatus

    contract = MagicMock()
    contract.id = uuid.uuid4()
    contract.status = ContractStatus.ACTIVE
    contract.teacher_id = uuid.uuid4()
    contract.compensation_model = "fixed"
    contract.section_id = uuid.uuid4()

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(
        scalar_one_or_none=MagicMock(return_value=contract)
    )
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    with pytest.raises(ValueError, match="Only ASSIGNED contracts can be activated"):
        await activate_contract(mock_db, contract.id, activated_by=uuid.uuid4())


@pytest.mark.asyncio
async def test_settle_contract_only_from_grades_submitted(mock_db):
    from app.modules.lms.ledger_service import settle_contract

    contract = MagicMock()
    contract.id = uuid.uuid4()
    contract.status = "grades_submitted"
    contract.teacher_id = uuid.uuid4()
    contract.section_id = uuid.uuid4()
    contract.updated_at = None

    wallet = MagicMock()
    wallet.id = uuid.uuid4()

    scalar_mock = MagicMock()
    scalar_mock.scalar.return_value = Decimal("20")
    scalar_mock.scalar_one_or_none = MagicMock(return_value=contract)

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = scalar_mock
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("app.modules.lms.ledger_service.get_or_create_wallet", AsyncMock(return_value=wallet)):
        with patch("app.modules.lms.ledger_service.record", AsyncMock()):
            result = await settle_contract(mock_db, contract.id, settled_by=uuid.uuid4())
            assert result is not None


@pytest.mark.asyncio
async def test_cancel_contract_only_from_active(mock_db):
    from app.modules.lms.ledger_service import cancel_contract

    contract = MagicMock()
    contract.id = uuid.uuid4()
    contract.status = "active"
    contract.teacher_id = uuid.uuid4()
    contract.section_id = uuid.uuid4()
    contract.updated_at = None

    wallet = MagicMock()
    wallet.id = uuid.uuid4()
    wallet.balance = Decimal("200")
    wallet.frozen_balance = Decimal("50")

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(
        scalar_one_or_none=MagicMock(return_value=contract)
    )
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    agg_mock = MagicMock()
    agg_mock.one.return_value = (Decimal("100"), Decimal("20"))
    agg_mock.scalar_one_or_none = MagicMock(return_value=contract)

    with patch("app.modules.lms.ledger_service.get_or_create_wallet", AsyncMock(return_value=wallet)):
        with patch("app.modules.lms.ledger_service.record", AsyncMock()):
            mock_db.execute = AsyncMock(return_value=agg_mock)
            result = await cancel_contract(mock_db, contract.id, cancelled_by=uuid.uuid4())
            assert result is not None


@pytest.mark.asyncio
async def test_disburse_refund_only_from_unclaimed():
    from app.modules.lms.cashier_service import disburse_pending_refund

    db = AsyncMock()

    pending = MagicMock()
    pending.id = uuid.uuid4()
    pending.status = "UNCLAIMED"
    pending.amount = Decimal("500")

    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=pending))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    with patch("app.modules.lms.cashier_service.is_date_closed", AsyncMock(return_value=False)):
        result = await disburse_pending_refund(db, pending.id, disbursed_by=uuid.uuid4())
        assert result is not None
        assert result.pending_refund_id == pending.id
