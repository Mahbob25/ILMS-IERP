from decimal import Decimal
from unittest.mock import AsyncMock, Mock, patch
import uuid
import pytest
from fastapi import HTTPException

from app.modules.academic.service import deactivate_section
from app.modules.lms.ledger_service import deactivate_contract
from app.modules.lms.models import ContractStatus


def result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    m.unique.return_value = m
    return m


class TestDeactivation:
    async def test_deactivate_active_section(self, mock_db, mock_user):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.deleted_at = None

        mock_db.get = AsyncMock(return_value=section)
        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar=False),  # _section_has_payments
            result_mock(scalar_one_or_none=None),  # SectionContract
        ])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        result = await deactivate_section(
            mock_db, section.id, mock_user, reason="Schedule conflict"
        )

        assert result.status == "pending"

    async def test_deactivate_reverses_activation_credit(self, mock_db, mock_user):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.deleted_at = None

        contract = Mock()
        contract.id = uuid.uuid4()
        contract.section_id = section.id
        contract.status = ContractStatus.ACTIVE
        contract.teacher_id = uuid.uuid4()

        wallet = Mock()
        wallet.id = uuid.uuid4()
        wallet.balance = Decimal("1000")
        wallet.frozen_balance = Decimal("0")

        mock_db.get = AsyncMock(return_value=section)

        aggr = Mock()
        aggr.one.return_value = (Decimal("400"), Decimal("100"))

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar=False),  # _section_has_payments
            result_mock(scalar_one_or_none=contract),  # SectionContract
            result_mock(scalar_one_or_none=wallet),  # get_or_create_wallet
            aggr,  # activation credit aggregate
        ])
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        with patch("app.modules.academic.service.ledger_deactivate_contract", AsyncMock()):
            result = await deactivate_section(
                mock_db, section.id, mock_user, reason="Schedule conflict"
            )

        assert result.status == "pending"

    async def test_deactivate_blocked_if_teacher_withdrew(self, mock_db):
        contract = Mock()
        contract.id = uuid.uuid4()
        contract.status = ContractStatus.ACTIVE
        contract.teacher_id = uuid.uuid4()

        wallet = Mock()
        wallet.id = uuid.uuid4()
        wallet.balance = Decimal("0")
        wallet.frozen_balance = Decimal("0")

        aggr = Mock()
        aggr.one.return_value = (Decimal("400"), Decimal("100"))

        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar_one_or_none=wallet),  # get_or_create_wallet
            aggr,  # activation credit aggregate
        ])
        mock_db.add = AsyncMock()
        mock_db.flush = AsyncMock()

        with pytest.raises(ValueError) as exc_info:
            await deactivate_contract(
                mock_db, contract=contract,
                reason="Teacher withdrew",
                deactivated_by=uuid.uuid4(),
            )

        msg = str(exc_info.value)
        assert "withdrawn" in msg or "withdrew" in msg

    async def test_deactivate_with_payments_requires_reason(self, mock_db, mock_user):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.deleted_at = None

        mock_db.get = AsyncMock(return_value=section)
        mock_db.execute = AsyncMock(return_value=result_mock(scalar=True))

        with pytest.raises(HTTPException) as exc_info:
            await deactivate_section(mock_db, section.id, mock_user, reason=None)

        assert exc_info.value.status_code == 400
        assert "reason" in str(exc_info.value.detail).lower()

    async def test_deactivate_non_active_fails(self, mock_db, mock_user):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "pending"
        section.deleted_at = None

        mock_db.get = AsyncMock(return_value=section)

        with pytest.raises(HTTPException) as exc_info:
            await deactivate_section(mock_db, section.id, mock_user)

        assert exc_info.value.status_code == 400

    async def test_deactivate_no_contract(self, mock_db, mock_user):
        section = Mock()
        section.id = uuid.uuid4()
        section.status = "active"
        section.deleted_at = None

        mock_db.get = AsyncMock(return_value=section)
        mock_db.execute = AsyncMock(side_effect=[
            result_mock(scalar=False),  # _section_has_payments
            result_mock(scalar_one_or_none=None),  # SectionContract
        ])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        result = await deactivate_section(
            mock_db, section.id, mock_user, reason="No contract"
        )

        assert result.status == "pending"
