import asyncio
from decimal import Decimal
import uuid
from datetime import date, datetime, timedelta, timezone
import logging
from app.core.timezone import get_today
from typing import Optional

logger = logging.getLogger(__name__)
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, text
from sqlalchemy.orm import joinedload, selectinload

from app.modules.lms.models import (
    Payment, TeacherWallet, Expense,
    LedgerEntryType, CompensationModel,
)
from app.modules.lms.closure_service import is_date_closed
from app.modules.lms.ledger_service import record as ledger_record, get_or_create_wallet
from app.modules.academic.models import (
    Course, CourseSection, Enrollment, Student, Refund, PendingRefund,
)
from app.modules.identity.models import Employee, EmployeeType, User
from app.core.error_messages import get_error_detail


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
    enrollment_id: uuid.UUID,
    amount: float,
    created_by: uuid.UUID,
    payment_date: Optional[date] = None,
    payment_method: str = "cash",
    transaction_number: Optional[str] = None,
    locale: str = "ar",
) -> Optional[Payment]:
    if payment_date is None:
        payment_date = get_today()

    if await is_date_closed(db, payment_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_is_closed", locale),
        )

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be positive"
        )

    amount = Decimal(str(amount))

    if payment_method == "online" and not transaction_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction number is required for online payments"
        )

    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext('daily_closure:' || :date))"),
        {"date": str(payment_date)},
    )

    enrollment_result = await db.execute(
        select(Enrollment)
        .options(
            selectinload(Enrollment.section)
            .selectinload(CourseSection.course),
            selectinload(Enrollment.section)
            .selectinload(CourseSection.contract),
        )
        .options(selectinload(Enrollment.student))
        .where(Enrollment.id == enrollment_id)
        .with_for_update()
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if not enrollment:
        logger.warning("Payment attempted for non-existent enrollment %s", enrollment_id)
        raise ValueError("Enrollment not found")

    if enrollment.section and enrollment.section.status == "cancelled":
        logger.warning("Payment attempted for cancelled section %s", enrollment.section.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_error_detail("section_cancelled", locale),
        )

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid_before = Decimal(str(total_paid_result.scalar() or 0))
    agreed_price = enrollment.agreed_price or (enrollment.section.price if enrollment.section else 0) or 0
    discount_pct = enrollment.admin_discount or 0
    discount_amount = agreed_price * discount_pct / 100
    net_price = agreed_price - discount_amount
    if net_price <= 0:
        net_price = max(agreed_price, 1)
    remaining = net_price - total_paid_before
    if amount > remaining + Decimal('0.001'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount {amount} exceeds remaining balance {max(0, remaining)}"
        )

    receipt_number = await get_next_receipt_number(db, payment_date)

    payment = Payment(
        enrollment_id=enrollment_id,
        amount=amount,
        date=payment_date,
        receipt_number=receipt_number,
        payment_method=payment_method,
        transaction_number=transaction_number if payment_method == "online" else None,
        created_by=created_by,
    )
    db.add(payment)

    section = enrollment.section

    teacher_share = Decimal("0")
    holdback = Decimal("0.20")
    contract = section.contract

    if contract and contract.compensation_model == CompensationModel.PERCENTAGE:
        pct = Decimal(str(contract.percentage or 0))
        holdback = Decimal(str(contract.holdback_rate))
        teacher_share = amount * pct / 100
        teacher_pct = float(pct)
    elif section.teacher_percentage:
        teacher_pct = section.teacher_percentage
        teacher_share = amount * Decimal(str(teacher_pct)) / 100

    if teacher_share > 0 and section.teacher_id:
        wallet = await get_or_create_wallet(db, section.teacher_id)
        available = teacher_share * (Decimal("1") - holdback)
        frozen = teacher_share * holdback
        await ledger_record(
            db=db,
            wallet_id=wallet.id,
            contract_id=contract.id if contract else None,
            entry_type=LedgerEntryType.PAYMENT_SHARE,
            total_amount=teacher_share,
            available_delta=available,
            frozen_delta=frozen,
            reference_type="payment",
            reference_id=payment.id,
            narrative=f"Payment share: {teacher_share} ({teacher_pct}%)",
            created_by=created_by,
        )

    await db.flush()

    return payment


async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Optional[dict]:
    result = await db.execute(
        select(Payment)
        .options(joinedload(Payment.created_by_user).joinedload(User.employee))
        .where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return None
    return {
        "id": payment.id,
        "enrollment_id": payment.enrollment_id,
        "amount": float(payment.amount),
        "date": payment.date,
        "receipt_number": payment.receipt_number,
        "payment_method": payment.payment_method if isinstance(payment.payment_method, str) else payment.payment_method.value,
        "transaction_number": payment.transaction_number,
        "created_by": payment.created_by,
        "created_by_name": (payment.created_by_user.full_name or "") if payment.created_by_user else "",
    }


async def list_payments(
    db: AsyncSession,
    enrollment_id: Optional[uuid.UUID] = None,
    student_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    receipt_number: Optional[str] = None,
) -> list[dict]:
    query = (
        select(Payment)
        .options(joinedload(Payment.created_by_user).joinedload(User.employee))
        .order_by(Payment.date.desc(), Payment.receipt_number.desc())
    )
    if enrollment_id:
        query = query.where(Payment.enrollment_id == enrollment_id)
    if student_id:
        query = query.join(Enrollment).where(Enrollment.student_id == student_id)
    if date_from:
        query = query.where(Payment.date >= date_from)
    if date_to:
        query = query.where(Payment.date <= date_to)
    if receipt_number:
        query = query.where(Payment.receipt_number.ilike(f"%{receipt_number}%"))
    result = await db.execute(query)
    payments = result.scalars().all()
    return [
        {
            "id": p.id,
            "enrollment_id": p.enrollment_id,
            "amount": float(p.amount),
            "date": p.date,
            "receipt_number": p.receipt_number,
            "payment_method": p.payment_method if isinstance(p.payment_method, str) else p.payment_method.value,
            "transaction_number": p.transaction_number,
            "created_by": p.created_by,
            "created_by_name": (p.created_by_user.full_name or "") if p.created_by_user else "",
        }
        for p in payments
    ]


async def get_teacher_wallet(db: AsyncSession, teacher_id: uuid.UUID) -> Optional[TeacherWallet]:
    result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    )
    return result.scalar_one_or_none()


async def get_teacher_withdrawals(db: AsyncSession, employee_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(Expense)
        .options(joinedload(Expense.created_by_user).joinedload(User.employee))
        .where(
            Expense.type == "teacher_withdrawal",
            Expense.recipient_id == employee_id,
        )
        .order_by(Expense.date.desc(), Expense.receipt_number.desc())
    )
    expenses = result.scalars().all()
    return [
        {
            "id": e.id,
            "amount": float(e.amount),
            "description": e.description,
            "recipient_name": e.recipient_name,
            "recipient_id": e.recipient_id,
            "date": e.date,
            "receipt_number": e.receipt_number,
            "type": e.type,
            "created_by": e.created_by,
            "created_by_name": (e.created_by_user.full_name or "") if e.created_by_user else "",
        }
        for e in expenses
    ]


# ─────────────────────────────────────────────
# Expenses
# ─────────────────────────────────────────────
async def get_eligible_recipients(db: AsyncSession, recipient_type: str) -> list[dict]:
    now = get_today()
    month_start = now.replace(day=1)

    if recipient_type == "teacher_withdrawal":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type == EmployeeType.TEACHER, Employee.is_active)
        )
        teachers = employees_result.scalars().all()

        result = []
        for emp in teachers:
            wallet_result = await db.execute(
                select(TeacherWallet).where(TeacherWallet.teacher_id == emp.id)
            )
            wallet = wallet_result.scalar_one_or_none()
            balance = wallet.balance if wallet else 0
            frozen = wallet.frozen_balance if wallet else 0
            available = balance - frozen
            result.append({
                "id": str(emp.id),
                "full_name": emp.full_name,
                "role": "teacher",
                "available_limit": available,
                "is_eligible": available > 0,
            })
        return result

    elif recipient_type == "secretary_advance":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type == EmployeeType.SECRETARY, Employee.is_active)
        )
        secretaries = employees_result.scalars().all()

        total_advances_result = await db.execute(
            select(
                Expense.recipient_id,
                func.coalesce(func.sum(Expense.amount), 0)
            ).where(
                Expense.type == "secretary_advance",
                Expense.date >= month_start,
                Expense.date <= now,
                Expense.recipient_id.isnot(None),
            ).group_by(Expense.recipient_id)
        )
        advances_map = dict(total_advances_result.fetchall())

        result = []
        for emp in secretaries:
            stipend = emp.default_salary or 0
            total_advances = advances_map.get(emp.id, 0)
            remaining = stipend - total_advances
            result.append({
                "id": str(emp.id),
                "full_name": emp.full_name,
                "role": "secretary",
                "available_limit": remaining if stipend > 0 else 0,
                "is_eligible": remaining > 0,
            })
        return result

    elif recipient_type == "salary_payment":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type != EmployeeType.TEACHER, Employee.is_active)
        )
        employees = employees_result.scalars().all()

        total_payments_result = await db.execute(
            select(
                Expense.recipient_id,
                func.coalesce(func.sum(Expense.amount), 0)
            ).where(
                Expense.type == "salary_payment",
                Expense.date >= month_start,
                Expense.date <= now,
                Expense.recipient_id.isnot(None),
            ).group_by(Expense.recipient_id)
        )
        payments_map = dict(total_payments_result.fetchall())

        result = []
        for emp in employees:
            monthly_salary = emp.default_salary or 0
            total_paid = payments_map.get(emp.id, 0)
            remaining = monthly_salary - total_paid
            result.append({
                "id": str(emp.id),
                "full_name": emp.full_name,
                "role": emp.employee_type.value if hasattr(emp.employee_type, 'value') else emp.employee_type,
                "available_limit": remaining if monthly_salary > 0 else 0,
                "is_eligible": remaining > 0,
            })
        return result

    return []


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
    created_by: uuid.UUID,
    recipient_name: Optional[str] = None,
    recipient_id: Optional[uuid.UUID] = None,
    expense_type: str = "general_expense",
    description: Optional[str] = None,
    expense_date: Optional[date] = None,
    locale: str = "ar",
) -> Expense:
    if expense_date is None:
        expense_date = get_today()
    amount = Decimal(str(amount))

    # Validate and resolve recipient for teacher_withdrawal and secretary_advance
    if expense_type in ("teacher_withdrawal", "secretary_advance", "salary_payment"):
        if not recipient_id:
            raise ValueError(f"recipient_id is required for {expense_type}")

        employee_result = await db.execute(
            select(Employee).options(joinedload(Employee.user)).where(Employee.id == recipient_id)
        )
        employee = employee_result.scalar_one_or_none()
        if not employee:
            raise ValueError("Recipient not found")
        if not employee.is_active:
            raise ValueError("Recipient is not active")
        if expense_type == "teacher_withdrawal":
            expected_type = EmployeeType.TEACHER
        elif expense_type == "secretary_advance":
            expected_type = EmployeeType.SECRETARY
        else:
            expected_type = None
        if expected_type and employee.employee_type != expected_type:
            raise ValueError(f"Recipient must be a {expected_type.value}")
        if expense_type == "salary_payment" and employee.employee_type == EmployeeType.TEACHER:
            raise ValueError("Salary payment is not applicable to teachers")
        recipient_name = employee.full_name

        if expense_type == "teacher_withdrawal":
            wallet = await get_or_create_wallet(db, employee.id, lock=True)
            available_balance = wallet.balance - wallet.frozen_balance
            if not wallet or available_balance < amount:
                raise ValueError(
                    f"Cannot withdraw: insufficient wallet balance. "
                    f"Requested: {amount}, Available: {available_balance}. "
                    f"Outstanding receivable must be cleared before further withdrawals."
                )

        elif expense_type in ("secretary_advance", "salary_payment"):
            monthly_limit = employee.default_salary or 0
            month_start = expense_date.replace(day=1)
            total_result = await db.execute(
                select(func.coalesce(func.sum(Expense.amount), 0))
                .where(
                    Expense.type == expense_type,
                    Expense.recipient_id == recipient_id,
                    Expense.date >= month_start,
                    Expense.date <= expense_date,
                )
            )
            total_paid = total_result.scalar() or 0
            remaining = monthly_limit - total_paid
            if remaining < amount:
                raise ValueError(
                    f"Insufficient remaining monthly salary. Available: {remaining}, Requested: {amount}"
                )

    receipt_number = await get_next_voucher_number(db, expense_date)
    expense = Expense(
        amount=amount,
        description=description,
        recipient_name=recipient_name or "Unknown",
        recipient_id=recipient_id,
        date=expense_date,
        receipt_number=receipt_number,
        type=expense_type,
        created_by=created_by,
    )
    db.add(expense)

    # Record withdrawal via ledger for teacher withdrawal
    if expense_type == "teacher_withdrawal" and recipient_id:
        await ledger_record(
            db=db,
            wallet_id=wallet.id,
            contract_id=None,
            entry_type=LedgerEntryType.WITHDRAWAL,
            total_amount=amount,
            available_delta=-amount,
            frozen_delta=Decimal("0"),
            reference_type="expense",
            reference_id=expense.id,
            narrative=f"Teacher withdrawal: {receipt_number}",
            created_by=created_by,
        )

    await db.flush()

    return expense


async def list_expenses(
    db: AsyncSession,
    expense_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    recipient_name: Optional[str] = None,
    receipt_number: Optional[str] = None,
) -> list[dict]:
    query = (
        select(Expense)
        .options(joinedload(Expense.created_by_user).joinedload(User.employee))
        .order_by(Expense.date.desc(), Expense.receipt_number.desc())
    )
    if expense_type:
        query = query.where(Expense.type == expense_type)
    if date_from:
        query = query.where(Expense.date >= date_from)
    if date_to:
        query = query.where(Expense.date <= date_to)
    if recipient_name:
        query = query.where(Expense.recipient_name.ilike(f"%{recipient_name}%"))
    if receipt_number:
        query = query.where(Expense.receipt_number.ilike(f"%{receipt_number}%"))
    result = await db.execute(query)
    expenses = result.scalars().all()
    return [
        {
            "id": e.id,
            "amount": float(e.amount),
            "description": e.description,
            "recipient_name": e.recipient_name,
            "recipient_id": e.recipient_id,
            "date": e.date,
            "receipt_number": e.receipt_number,
            "type": e.type,
            "created_by": e.created_by,
            "created_by_name": (e.created_by_user.full_name or "") if e.created_by_user else "",
        }
        for e in expenses
    ]


async def get_expense(db: AsyncSession, expense_id: uuid.UUID) -> Optional[dict]:
    result = await db.execute(
        select(Expense)
        .options(joinedload(Expense.created_by_user).joinedload(User.employee))
        .where(Expense.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return None
    return {
        "id": expense.id,
        "amount": float(expense.amount),
        "description": expense.description,
        "recipient_name": expense.recipient_name,
        "recipient_id": expense.recipient_id,
        "date": expense.date,
        "receipt_number": expense.receipt_number,
        "type": expense.type,
        "created_by": expense.created_by,
        "created_by_name": (expense.created_by_user.full_name or "") if expense.created_by_user else "",
    }



# ─────────────────────────────────────────────
# Revenue Overview
# ─────────────────────────────────────────────
async def _get_period_totals(db: AsyncSession, start: date, end: date) -> dict:
    rev_result = await db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(Payment.id),
        ).where(Payment.date >= start, Payment.date <= end)
    )
    total_revenue, transaction_count = rev_result.one()
    total_revenue = float(total_revenue)
    transaction_count = int(transaction_count or 0)

    exp_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date >= start, Expense.date <= end)
    )
    total_expenses = float(exp_result.scalar() or 0)

    ref_result = await db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0))
        .where(func.date(Refund.disbursed_at) >= start,
               func.date(Refund.disbursed_at) <= end)
    )
    total_refunds = float(ref_result.scalar() or 0)

    return {
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "total_refunds": total_refunds,
        "transaction_count": transaction_count,
    }


async def _get_student_metrics(db: AsyncSession, start: date, end: date, total_revenue: float) -> dict:
    result = await db.execute(
        select(func.count(func.distinct(Enrollment.student_id)))
        .join(Payment, Payment.enrollment_id == Enrollment.id)
        .where(Payment.date >= start, Payment.date <= end)
    )
    unique_students = int(result.scalar() or 0)
    return {
        "unique_students": unique_students,
        "avg_per_student": round(total_revenue / unique_students, 2) if unique_students > 0 else 0,
    }


async def _get_period_comparison(db: AsyncSession, period_start: date) -> dict:
    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end.replace(day=1)
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date >= prev_start, Payment.date <= prev_end)
    )
    prev_revenue = float(result.scalar() or 0)
    return {"prev_revenue": prev_revenue, "prev_start": prev_start, "prev_end": prev_end}


async def _get_monthly_trend(db: AsyncSession, period_start: date, period_end: date) -> list:
    trend_start = period_start.replace(month=1, day=1)
    result = await db.execute(
        text("""
            WITH monthly_revenue AS (
                SELECT to_char(date, 'YYYY-MM') AS month,
                       COALESCE(SUM(amount), 0) AS revenue
                FROM payments
                WHERE date >= :start AND date <= :end
                GROUP BY month
            ),
            monthly_expenses AS (
                SELECT to_char(date, 'YYYY-MM') AS month,
                       COALESCE(SUM(amount), 0) AS expenses
                FROM expenses
                WHERE date >= :start AND date <= :end
                GROUP BY month
            ),
            monthly_refunds AS (
                SELECT to_char(disbursed_at::date, 'YYYY-MM') AS month,
                       COALESCE(SUM(amount), 0) AS refunds
                FROM refunds
                WHERE disbursed_at::date >= :start AND disbursed_at::date <= :end
                GROUP BY month
            )
            SELECT COALESCE(r.month, e.month, rf.month) AS month,
                   COALESCE(r.revenue, 0) AS revenue,
                   COALESCE(e.expenses, 0) AS expenses,
                   COALESCE(rf.refunds, 0) AS refunds
            FROM monthly_revenue r
            FULL OUTER JOIN monthly_expenses e ON e.month = r.month
            FULL OUTER JOIN monthly_refunds rf ON rf.month = COALESCE(r.month, e.month)
            ORDER BY month
        """),
        {"start": trend_start, "end": period_end}
    )
    return [
        {"month": row[0], "revenue": float(row[1]), "expenses": float(row[2]), "refunds": float(row[3])}
        for row in result.fetchall()
    ]


async def _get_revenue_by_course(db: AsyncSession, start: date, end: date, total_revenue: float) -> list:
    result = await db.execute(
        text("""
            SELECT c.name AS course_name, SUM(p.amount) AS revenue
            FROM payments p
            JOIN enrollments e ON p.enrollment_id = e.id
            JOIN course_sections cs ON e.section_id = cs.id
            JOIN courses c ON cs.course_id = c.id
            WHERE p.date >= :start AND p.date <= :end
            GROUP BY c.name
            ORDER BY revenue DESC
        """),
        {"start": start, "end": end}
    )
    return [
        {
            "course_name": row[0],
            "revenue": float(row[1]),
            "pct": round(float(row[1]) / total_revenue * 100, 2) if total_revenue > 0 else 0,
        }
        for row in result.fetchall()
    ]


async def _get_revenue_by_teacher(db: AsyncSession, start: date, end: date, total_revenue: float) -> list:
    result = await db.execute(
        text("""
            SELECT emp.full_name AS teacher_name, SUM(p.amount) AS revenue
            FROM payments p
            JOIN enrollments e ON p.enrollment_id = e.id
            JOIN course_sections cs ON e.section_id = cs.id
            JOIN employees emp ON cs.teacher_id = emp.id
            WHERE p.date >= :start AND p.date <= :end
            GROUP BY emp.full_name
            ORDER BY revenue DESC
        """),
        {"start": start, "end": end}
    )
    return [
        {
            "teacher_name": row[0],
            "revenue": float(row[1]),
            "pct": round(float(row[1]) / total_revenue * 100, 2) if total_revenue > 0 else 0,
        }
        for row in result.fetchall()
    ]


async def _get_daily_breakdown(db: AsyncSession, start: date, end: date) -> list:
    result = await db.execute(
        text("""
            WITH daily_revenue AS (
                SELECT date, COALESCE(SUM(amount), 0) AS revenue
                FROM payments
                WHERE date >= :start AND date <= :end
                GROUP BY date
            ),
            daily_expenses AS (
                SELECT date, COALESCE(SUM(amount), 0) AS expenses
                FROM expenses
                WHERE date >= :start AND date <= :end
                GROUP BY date
            ),
            daily_refunds AS (
                SELECT disbursed_at::date AS date, COALESCE(SUM(amount), 0) AS refunds
                FROM refunds
                WHERE disbursed_at::date >= :start AND disbursed_at::date <= :end
                GROUP BY disbursed_at::date
            )
            SELECT COALESCE(r.date::text, e.date::text, rf.date::text) AS date,
                   COALESCE(r.revenue, 0) AS revenue,
                   COALESCE(e.expenses, 0) AS expenses,
                   COALESCE(rf.refunds, 0) AS refunds
            FROM daily_revenue r
            FULL OUTER JOIN daily_expenses e ON e.date = r.date
            FULL OUTER JOIN daily_refunds rf ON rf.date = COALESCE(r.date, e.date)
            ORDER BY date
        """),
        {"start": start, "end": end}
    )
    return [
        {"date": row[0], "revenue": float(row[1]), "expenses": float(row[2]), "refunds": float(row[3])}
        for row in result.fetchall()
    ]


async def get_revenue_overview(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    if end_date is None:
        end_date = get_today()
    if start_date is None:
        start_date = end_date.replace(day=1)

    period_start = start_date
    period_end = end_date

    totals = await _get_period_totals(db, period_start, period_end)
    total_revenue = totals["total_revenue"]

    student_metrics = await _get_student_metrics(db, period_start, period_end, total_revenue)
    comparison = await _get_period_comparison(db, period_start)
    prev_revenue = comparison["prev_revenue"]
    change_pct = round(
        ((total_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0, 2
    )

    monthly_trend, by_course, by_teacher, daily_breakdown = await asyncio.gather(
        _get_monthly_trend(db, period_start, period_end),
        _get_revenue_by_course(db, period_start, period_end, total_revenue),
        _get_revenue_by_teacher(db, period_start, period_end, total_revenue),
        _get_daily_breakdown(db, period_start, period_end),
    )

    net_revenue = total_revenue - totals["total_expenses"] - totals["total_refunds"]

    return {
        "total_revenue": total_revenue,
        "total_expenses": totals["total_expenses"],
        "total_refunds": totals["total_refunds"],
        "net_revenue": net_revenue,
        "transaction_count": totals["transaction_count"],
        "avg_per_student": student_metrics["avg_per_student"],
        "comparison": {
            "current_period": total_revenue,
            "previous_period": prev_revenue,
            "change_pct": change_pct,
        },
        "monthly_trend": monthly_trend,
        "by_course": by_course,
        "by_teacher": by_teacher,
        "daily_breakdown": daily_breakdown,
    }


async def get_student_payment_summary(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> dict:
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid = Decimal(str(total_paid_result.scalar() or 0))

    enrollment_result = await db.execute(
        select(Enrollment)
        .options(joinedload(Enrollment.section))
        .where(Enrollment.id == enrollment_id)
    )
    enrollment = enrollment_result.scalar_one_or_none()

    agreed_price = enrollment.agreed_price if enrollment else None
    if agreed_price is None and enrollment and enrollment.section:
        agreed_price = enrollment.section.price
    admin_discount = enrollment.admin_discount if enrollment else None
    discount_amount = (agreed_price * admin_discount / 100) if (agreed_price is not None and admin_discount is not None) else None
    net_price = (agreed_price - discount_amount) if (agreed_price is not None and discount_amount is not None) else agreed_price
    balance_remaining = (net_price - total_paid) if net_price is not None else None

    return {
        "total_paid": total_paid,
        "agreed_price": agreed_price,
        "admin_discount": admin_discount,
        "net_price": net_price,
        "balance_remaining": balance_remaining,
    }


