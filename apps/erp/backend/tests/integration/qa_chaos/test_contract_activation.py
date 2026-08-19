import uuid
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch
import asyncio
import pytest

from app.modules.lms.ledger_service import activate_contract, ContractStatus


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


class TestContractActivation:

    async def test_concurrent_activation_only_one_succeeds(self, mock_user):
        contract_id = uuid.uuid4()
        section_id = uuid.uuid4()
        teacher_id = uuid.uuid4()

        activation_success_count = 0
        activation_lock = asyncio.Lock()

        async def try_activate():
            nonlocal activation_success_count

            from app.modules.lms.models import CompensationModel

            contract = Mock()
            contract.id = contract_id
            contract.section_id = section_id
            contract.teacher_id = teacher_id
            contract.compensation_model = CompensationModel.PERCENTAGE
            contract.percentage = Decimal("50")
            contract.holdback_rate = Decimal("0.20")
            contract.fixed_amount = None
            contract.status = ContractStatus.ASSIGNED

            section = Mock()
            section.id = section_id
            section.price = Decimal("5000.00")
            section.start_date = datetime.now(timezone.utc)
            section.class_time = "10:00"
            section.status = "pending"

            wallet = Mock()
            wallet.id = uuid.uuid4()
            wallet.teacher_id = teacher_id
            wallet.balance = Decimal("0")
            wallet.frozen_balance = Decimal("0")

            async with activation_lock:
                already_activated = activation_success_count > 0
                if not already_activated:
                    activation_success_count += 1
                    contract_status = ContractStatus.ASSIGNED
                else:
                    contract_status = ContractStatus.ACTIVE

            async def execute_side_effect(query, **kwargs):
                qs = str(query).lower()
                if "insert" in qs and "teacher_wallet" in qs:
                    return _result_mock()
                if "teacher_wallet" in qs:
                    r = Mock()
                    r.scalar_one_or_none.return_value = wallet
                    return r
                if "section_contracts" in qs and "section_contracts.id" in qs:
                    contract.status = contract_status
                    r = Mock()
                    r.scalar_one_or_none.return_value = contract
                    return r
                if "course_section" in qs:
                    r = Mock()
                    r.scalar_one_or_none.return_value = section
                    return r
                if "ledger_entry" in qs:
                    return _result_mock()
                if qs.strip().upper().startswith("UPDATE") and "section_contract" in qs:
                    updated = Mock()
                    updated.status = ContractStatus.ACTIVE
                    updated.teacher_id = teacher_id
                    updated.section_id = section_id
                    updated.compensation_model = CompensationModel.PERCENTAGE
                    updated.id = contract_id
                    r = Mock()
                    if not already_activated:
                        r.scalar_one_or_none.return_value = updated
                    else:
                        r.scalar_one_or_none.return_value = None
                    return r
                return _result_mock()

            db = AsyncMock()
            db.execute = AsyncMock(side_effect=execute_side_effect)
            db.add = Mock()
            db.flush = AsyncMock()
            db.scalar = AsyncMock(return_value=0)

            try:
                result = await activate_contract(
                    db,
                    contract_id=contract_id,
                    activated_by=mock_user.id,
                )
                return result is not None
            except ValueError:
                return False

        tasks = [try_activate() for _ in range(5)]
        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r)
        assert success_count == 1, (
            f"Expected exactly 1 successful activation, got {success_count}"
        )

    async def test_conditional_update_pattern(self, mock_db, mock_user):
        from app.modules.lms.models import CompensationModel

        contract_id = uuid.uuid4()
        section_id = uuid.uuid4()
        teacher_id = uuid.uuid4()

        contract = Mock()
        contract.id = contract_id
        contract.section_id = section_id
        contract.teacher_id = teacher_id
        contract.compensation_model = CompensationModel.PERCENTAGE
        contract.percentage = Decimal("50")
        contract.holdback_rate = Decimal("0.20")
        contract.fixed_amount = None
        contract.status = ContractStatus.ASSIGNED

        section = Mock()
        section.id = section_id
        section.price = Decimal("5000.00")
        section.start_date = datetime.now(timezone.utc)
        section.class_time = "10:00"
        section.status = "pending"

        wallet = Mock()
        wallet.id = uuid.uuid4()
        wallet.teacher_id = teacher_id
        wallet.balance = Decimal("0")
        wallet.frozen_balance = Decimal("0")

        update_where_clause = None

        async def execute_side_effect(query, **kwargs):
            nonlocal update_where_clause
            qs = str(query)
            if qs.strip().upper().startswith("UPDATE") and "section_contract" in qs.lower():
                update_where_clause = qs
                updated = Mock()
                updated.id = contract_id
                updated.status = ContractStatus.ACTIVE
                updated.teacher_id = teacher_id
                updated.section_id = section_id
                updated.compensation_model = CompensationModel.PERCENTAGE
                r = Mock()
                r.scalar_one_or_none.return_value = updated
                return r
            if "section_contracts" in qs.lower() and "section_contracts.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = contract
                return r
            if "insert" in qs.lower() and "teacher_wallet" in qs.lower():
                return _result_mock()
            if "teacher_wallet" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = wallet
                return r
            if "course_section" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = section
                return r
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        result = await activate_contract(
            mock_db,
            contract_id=contract_id,
            activated_by=mock_user.id,
        )

        assert result is not None
        assert result.status == ContractStatus.ACTIVE
        assert update_where_clause is not None
        assert "status" in update_where_clause and "WHERE" in update_where_clause, (
            "UPDATE must include WHERE status = ASSIGNED to prevent race conditions"
        )

    async def test_activate_already_active_fails(self, mock_db, mock_user):
        contract_id = uuid.uuid4()

        contract = Mock()
        contract.id = contract_id
        contract.status = ContractStatus.ACTIVE
        contract.teacher_id = uuid.uuid4()
        contract.compensation_model = Mock()

        async def execute_side_effect(query):
            qs = str(query)
            if "section_contracts" in qs.lower() and "section_contracts.id" in qs.lower():
                r = Mock()
                r.scalar_one_or_none.return_value = contract
                return r
            if "teacher_wallet" in qs.lower():
                return _result_mock(scalar_one_or_none=Mock(id=uuid.uuid4(), teacher_id=uuid.uuid4(), balance=0, frozen_balance=0))
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.flush = AsyncMock()
        mock_db.add = Mock()

        with pytest.raises(ValueError) as exc_info:
            await activate_contract(
                mock_db,
                contract_id=contract_id,
                activated_by=mock_user.id,
            )

        assert "ASSIGNED" in str(exc_info.value)
