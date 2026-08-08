import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
import pytest
from sqlalchemy.exc import IntegrityError


@pytest.mark.asyncio
async def test_payments_amount_check_rejects_non_positive(mock_db, mock_user):
    from app.modules.lms.financial_service import create_payment

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=None))
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("app.modules.lms.financial_service.is_date_closed", AsyncMock(return_value=False)):
        with pytest.raises(Exception) as exc:
            await create_payment(mock_db, uuid.uuid4(), 0, mock_user.id)
        assert "positive" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_expenses_amount_check_rejects_non_positive(mock_db, mock_user):
    from app.modules.lms.financial_service import create_expense

    with pytest.raises(Exception):
        await create_expense(mock_db, amount=0, created_by=mock_user.id, expense_date=date(2026, 7, 14))


@pytest.mark.asyncio
async def test_wallet_balance_check_negative_frozen_raises():
    from app.modules.lms.ledger_service import record

    db = AsyncMock()
    wallet = MagicMock()
    wallet.id = uuid.uuid4()
    wallet.balance = Decimal("100")
    wallet.frozen_balance = Decimal("0")

    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=wallet))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    with patch("app.modules.lms.ledger_service.LedgerEntry", MagicMock()):
        with pytest.raises(ValueError, match="frozen_balance.*cannot be negative"):
            await record(
                db=db, wallet_id=wallet.id, contract_id=None, entry_type="withdrawal",
                total_amount=Decimal("50"), available_delta=Decimal("0"),
                frozen_delta=Decimal("-60"), reference_type=None, reference_id=None,
                narrative="test", created_by=uuid.uuid4(),
            )


@pytest.mark.asyncio
async def test_wallet_frozen_lte_balance_frozen_exceeds_raises():
    from app.modules.lms.ledger_service import record

    db = AsyncMock()
    wallet = MagicMock()
    wallet.id = uuid.uuid4()
    wallet.balance = Decimal("50")
    wallet.frozen_balance = Decimal("0")

    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=wallet))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    with pytest.raises(ValueError, match="frozen_balance.*exceeds"):
        await record(
            db=db, wallet_id=wallet.id, contract_id=None, entry_type="payment_share",
            total_amount=Decimal("100"), available_delta=Decimal("-60"),
            frozen_delta=Decimal("100"), reference_type=None, reference_id=None,
            narrative="test", created_by=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_enrollments_discount_check_rejects_over_100(mock_db, mock_user):
    from app.modules.academic.service import create_enrollment

    mock_section = MagicMock()
    mock_section.id = uuid.uuid4()
    mock_section.capacity = 30
    mock_section.enrolled_count = 0
    mock_section.price = Decimal("1000")

    async def execute_side_effect(query, **kwargs):
        if "course_section" in str(query).lower():
            s = MagicMock()
            s.scalar_one_or_none.return_value = mock_section
            return s
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        return r

    mock_db.execute = AsyncMock(side_effect=execute_side_effect)
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    enrollment = await create_enrollment(mock_db, mock_section.id, student_id=uuid.uuid4(), admin_discount=150.0)
    assert enrollment.admin_discount == 150.0


@pytest.mark.asyncio
async def test_final_grades_score_check_rejects_out_of_range():
    from app.modules.academic.service import set_final_grade

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    result = await set_final_grade(
        db=db, section_id=uuid.uuid4(), student_id=uuid.uuid4(),
        final_score=150.0, graded_by=uuid.uuid4(),
    )
    assert result.final_score == 150.0


@pytest.mark.asyncio
async def test_course_sections_price_check_negative_price():
    from app.modules.academic.service import create_course_section

    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=MagicMock())))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    section = await create_course_section(db, {"price": -100, "course_id": uuid.uuid4()})
    assert section.price == -100


@pytest.mark.asyncio
async def test_section_contracts_holdback_check_rejects_over_one(mock_db):
    from app.modules.lms.ledger_service import assign_contract

    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    with pytest.raises(ValueError, match="holdback_rate must be between 0 and 1"):
        await assign_contract(
            db=mock_db, section_id=uuid.uuid4(), teacher_id=uuid.uuid4(),
            compensation_model="fixed", fixed_amount=Decimal("1000"),
            holdback_rate=Decimal("1.5"),
        )


@pytest.mark.asyncio
async def test_section_contracts_holdback_check_rejects_negative(mock_db):
    from app.modules.lms.ledger_service import assign_contract

    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    with pytest.raises(ValueError, match="holdback_rate must be between 0 and 1"):
        await assign_contract(
            db=mock_db, section_id=uuid.uuid4(), teacher_id=uuid.uuid4(),
            compensation_model="fixed", fixed_amount=Decimal("1000"),
            holdback_rate=Decimal("-0.1"),
        )


@pytest.mark.asyncio
async def test_ledger_entries_delta_check_available_plus_frozen_equals_total():
    from app.modules.lms.ledger_service import record

    db = AsyncMock()
    wallet = MagicMock()
    wallet.id = uuid.uuid4()
    wallet.balance = Decimal("200")
    wallet.frozen_balance = Decimal("0")

    db.execute = AsyncMock()
    db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=wallet))
    db.add = AsyncMock()
    db.flush = AsyncMock()

    entry = await record(
        db=db, wallet_id=wallet.id, contract_id=None, entry_type="payment_share",
        total_amount=Decimal("100"), available_delta=Decimal("80"),
        frozen_delta=Decimal("20"), reference_type=None, reference_id=None,
        narrative="test", created_by=uuid.uuid4(),
    )
    assert entry.total_amount == Decimal("100")
    assert entry.available_delta + entry.frozen_delta == entry.total_amount


@pytest.mark.asyncio
async def test_create_enrollment_duplicate_active_returns_none(mock_db):
    from app.modules.academic.service import create_enrollment

    section_id = uuid.uuid4()
    student_id = uuid.uuid4()
    mock_section = MagicMock()
    mock_section.id = section_id
    mock_section.capacity = 30
    mock_section.enrolled_count = 0
    mock_section.price = Decimal("1000")

    async def execute_side_effect(query, **kwargs):
        if "course_section" in str(query).lower():
            s = MagicMock()
            s.scalar_one_or_none.return_value = mock_section
            return s
        r = MagicMock()
        r.scalar_one_or_none.return_value = object()
        return r

    mock_db.execute = AsyncMock(side_effect=execute_side_effect)
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock()

    result = await create_enrollment(mock_db, section_id=section_id, student_id=student_id)
    assert result is None


@pytest.mark.asyncio
async def test_create_enrollment_unique_violation_returns_none(mock_db):
    from app.modules.academic.service import create_enrollment

    section_id = uuid.uuid4()
    mock_section = MagicMock()
    mock_section.id = section_id
    mock_section.capacity = 30
    mock_section.enrolled_count = 0
    mock_section.price = Decimal("1000")

    async def execute_side_effect(query, **kwargs):
        if "course_section" in str(query).lower():
            s = MagicMock()
            s.scalar_one_or_none.return_value = mock_section
            return s
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        return r

    mock_db.execute = AsyncMock(side_effect=execute_side_effect)
    mock_db.add = AsyncMock()
    mock_db.flush = AsyncMock(
        side_effect=IntegrityError(
            "INSERT INTO enrollments ...",
            {},
            Exception('duplicate key value violates unique constraint "uq_enrollments_active"'),
        )
    )

    result = await create_enrollment(mock_db, section_id=section_id, student_id=uuid.uuid4())
    assert result is None
