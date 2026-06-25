import uuid
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update
from sqlalchemy.orm import joinedload

from app.modules.lms.models import Payment, TeacherWallet, Expense, DailyClosure
from app.modules.academic.models import Course, CourseSection, Enrollment


async def get_next_receipt_number(db: AsyncSession, payment_date: date) -> str:
    prefix = f"RCP-{payment_date.strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.coalesce(func.max(Payment.receipt_number), ""))
        .where(Payment.receipt_number.like(f"{prefix}%"))
    )
    max_num = result.scalar() or ""
    if max_num:
        seq = int(max_num.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def create_payment(
    db: AsyncSession,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
    amount: float,
    payment_date: Optional[date] = None,
) -> Optional[Payment]:
    if payment_date is None:
        payment_date = date.today()

    course_result = await db.execute(
        select(Course).options(joinedload(Course.sections)).where(Course.id == course_id)
    )
    course = course_result.unique().scalar_one_or_none()
    if not course:
        return None

    receipt_number = await get_next_receipt_number(db, payment_date)

    payment = Payment(
        student_id=student_id,
        course_id=course_id,
        amount=amount,
        date=payment_date,
        receipt_number=receipt_number,
    )
    db.add(payment)

    teacher_pct = course.teacher_percentage or 0
    teacher_share = amount * teacher_pct / 100.0

    if teacher_share > 0 and course.sections:
        section = course.sections[0]
        enrollment_result = await db.execute(
            select(Enrollment)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.section_id == section.id,
            )
        )
        enrollment = enrollment_result.scalar_one_or_none()

        admin_discount = enrollment.admin_discount if enrollment and enrollment.admin_discount else 0

        teacher_id = section.teacher_id
        wallet_result = await db.execute(
            select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
        )
        wallet = wallet_result.scalar_one_or_none()
        if wallet:
            wallet.balance += teacher_share
            wallet.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            wallet = TeacherWallet(
                teacher_id=teacher_id,
                balance=teacher_share,
                last_updated=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(wallet)

    await db.flush()
    return payment


async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Optional[Payment]:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    return result.scalar_one_or_none()


async def list_payments(
    db: AsyncSession,
    student_id: Optional[uuid.UUID] = None,
    course_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Payment]:
    query = select(Payment).order_by(Payment.date.desc(), Payment.receipt_number.desc())
    if student_id:
        query = query.where(Payment.student_id == student_id)
    if course_id:
        query = query.where(Payment.course_id == course_id)
    if date_from:
        query = query.where(Payment.date >= date_from)
    if date_to:
        query = query.where(Payment.date <= date_to)
    result = await db.execute(query)
    return result.scalars().all()


async def get_teacher_wallet(db: AsyncSession, teacher_id: uuid.UUID) -> Optional[TeacherWallet]:
    result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    )
    return result.scalar_one_or_none()


# ─────────────────────────────────────────────
# Expenses
# ─────────────────────────────────────────────
async def get_next_voucher_number(db: AsyncSession, expense_date: date) -> str:
    prefix = f"VCH-{expense_date.strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.coalesce(func.max(Expense.receipt_number), ""))
        .where(Expense.receipt_number.like(f"{prefix}%"))
    )
    max_num = result.scalar() or ""
    if max_num:
        seq = int(max_num.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def create_expense(
    db: AsyncSession,
    amount: float,
    recipient_name: str,
    expense_type: str = "general_expense",
    description: Optional[str] = None,
    expense_date: Optional[date] = None,
) -> Expense:
    if expense_date is None:
        expense_date = date.today()
    receipt_number = await get_next_voucher_number(db, expense_date)
    expense = Expense(
        amount=amount,
        description=description,
        recipient_name=recipient_name,
        date=expense_date,
        receipt_number=receipt_number,
        type=expense_type,
    )
    db.add(expense)
    await db.flush()
    return expense


async def list_expenses(
    db: AsyncSession,
    expense_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    recipient_name: Optional[str] = None,
) -> list[Expense]:
    query = select(Expense).order_by(Expense.date.desc(), Expense.receipt_number.desc())
    if expense_type:
        query = query.where(Expense.type == expense_type)
    if date_from:
        query = query.where(Expense.date >= date_from)
    if date_to:
        query = query.where(Expense.date <= date_to)
    if recipient_name:
        query = query.where(Expense.recipient_name.ilike(f"%{recipient_name}%"))
    result = await db.execute(query)
    return result.scalars().all()


async def get_expense(db: AsyncSession, expense_id: uuid.UUID) -> Optional[Expense]:
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    return result.scalar_one_or_none()


# ─────────────────────────────────────────────
# Teacher Wallet Withdrawal
# ─────────────────────────────────────────────
async def teacher_withdraw(
    db: AsyncSession,
    teacher_id: uuid.UUID,
    amount: float,
    description: Optional[str] = None,
) -> Optional[tuple[Expense, float]]:
    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet or wallet.balance < amount:
        return None

    expense = await create_expense(
        db, amount=amount, recipient_name="Teacher Withdrawal",
        expense_type="teacher_withdrawal", description=description,
    )
    wallet.balance -= amount
    wallet.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    return expense, wallet.balance


# ─────────────────────────────────────────────
# Daily Closures
# ─────────────────────────────────────────────
async def close_day(db: AsyncSession, closure_date: date, manager_id: uuid.UUID) -> Optional[DailyClosure]:
    result = await db.execute(select(DailyClosure).where(DailyClosure.date == closure_date))
    closure = result.scalar_one_or_none()
    if closure:
        if closure.status == "closed":
            return None
        closure.status = "closed"
        closure.closed_by_manager_id = manager_id
    else:
        closure = DailyClosure(
            date=closure_date,
            status="closed",
            closed_by_manager_id=manager_id,
        )
        db.add(closure)
    await db.flush()
    return closure


async def request_unlock(db: AsyncSession, closure_date: date) -> Optional[DailyClosure]:
    result = await db.execute(select(DailyClosure).where(DailyClosure.date == closure_date))
    closure = result.scalar_one_or_none()
    if not closure or closure.status != "closed":
        return None
    closure.status = "unlock_requested"
    await db.flush()
    return closure


async def approve_unlock(db: AsyncSession, closure_date: date) -> Optional[DailyClosure]:
    result = await db.execute(select(DailyClosure).where(DailyClosure.date == closure_date))
    closure = result.scalar_one_or_none()
    if not closure or closure.status != "unlock_requested":
        return None
    closure.status = "pending"
    await db.flush()
    return closure


async def list_closures(
    db: AsyncSession,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[DailyClosure]:
    query = select(DailyClosure).order_by(DailyClosure.date.desc())
    if date_from:
        query = query.where(DailyClosure.date >= date_from)
    if date_to:
        query = query.where(DailyClosure.date <= date_to)
    result = await db.execute(query)
    return result.scalars().all()


async def get_daily_ledger(db: AsyncSession, ledger_date: date) -> dict:
    payments_in_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date == ledger_date)
    )
    total_payments_in = payments_in_result.scalar() or 0.0

    expenses_out_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date == ledger_date)
    )
    total_expenses_out = expenses_out_result.scalar() or 0.0

    closure_result = await db.execute(select(DailyClosure).where(DailyClosure.date == ledger_date))
    closure = closure_result.scalar_one_or_none()

    return {
        "date": ledger_date,
        "total_payments_in": total_payments_in,
        "total_expenses_out": total_expenses_out,
        "net_cash_flow": total_payments_in - total_expenses_out,
        "status": closure.status if closure else "pending",
    }


async def is_date_closed(db: AsyncSession, check_date: date) -> bool:
    result = await db.execute(select(DailyClosure).where(DailyClosure.date == check_date))
    closure = result.scalar_one_or_none()
    return closure is not None and closure.status == "closed"


async def get_student_payment_summary(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> dict:
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            Payment.student_id == student_id,
            Payment.course_id == course_id,
        )
    )
    total_paid = total_paid_result.scalar() or 0.0

    enrollment_result = await db.execute(
        select(Enrollment)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .where(
            Enrollment.student_id == student_id,
            CourseSection.course_id == course_id,
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()

    agreed_price = enrollment.agreed_price if enrollment else None

    return {
        "total_paid": total_paid,
        "agreed_price": agreed_price,
        "balance_remaining": (agreed_price - total_paid) if agreed_price else None,
    }
