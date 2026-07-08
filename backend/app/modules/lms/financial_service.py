from decimal import Decimal
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, text
from sqlalchemy.orm import joinedload

from app.modules.lms.models import (
    Payment, TeacherWallet, Expense, DailyClosure,
    LedgerEntryType, CompensationModel,
)
from app.modules.lms.ledger_service import record as ledger_record, get_or_create_wallet
from app.modules.academic.models import Course, CourseSection, Enrollment, Student
from app.modules.identity.models import Employee, EmployeeType, User
from app.core.templates import template_engine
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
        payment_date = date.today()

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

    enrollment_result = await db.execute(
        select(Enrollment)
        .options(
            joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Enrollment.section)
            .joinedload(CourseSection.contract),
        )
        .options(joinedload(Enrollment.student))
        .where(Enrollment.id == enrollment_id)
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if not enrollment:
        return None

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid_before = Decimal(str(total_paid_result.scalar() or 0))
    agreed_price = enrollment.agreed_price or 0
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
    now = datetime.now(timezone.utc).date()
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

        # Calculate total advances this month for each secretary
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
        expense_date = date.today()
    amount = Decimal(str(amount))

    # Validate and resolve recipient for teacher_withdrawal and secretary_advance
    if expense_type in ("teacher_withdrawal", "secretary_advance"):
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
        expected_type = EmployeeType.TEACHER if expense_type == "teacher_withdrawal" else EmployeeType.SECRETARY
        if employee.employee_type != expected_type:
            raise ValueError(f"Recipient must be a {expected_type.value}")
        recipient_name = employee.full_name

        if expense_type == "teacher_withdrawal":
            wallet_result = await db.execute(
                select(TeacherWallet).where(TeacherWallet.teacher_id == employee.id)
            )
            wallet = wallet_result.scalar_one_or_none()
            available_balance = (wallet.balance - wallet.frozen_balance) if wallet else 0
            if not wallet or available_balance < amount:
                raise ValueError("Insufficient wallet balance")

        elif expense_type == "secretary_advance":
            stipend = employee.default_salary or 0
            month_start = expense_date.replace(day=1)
            total_result = await db.execute(
                select(func.coalesce(func.sum(Expense.amount), 0))
                .where(
                    Expense.type == "secretary_advance",
                    Expense.recipient_id == recipient_id,
                    Expense.date >= month_start,
                    Expense.date <= expense_date,
                )
            )
            total_advances = total_result.scalar() or 0
            remaining = stipend - total_advances
            if remaining < amount:
                raise ValueError(
                    f"Insufficient remaining stipend. Available: {remaining}, Requested: {amount}"
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
        wallet = await get_or_create_wallet(db, recipient_id)
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
) -> list[dict]:
    payments_dates = select(Payment.date.distinct().label("date")).subquery()
    expenses_dates = select(Expense.date.distinct().label("date")).subquery()
    union_query = select(payments_dates.c.date).union(
        select(expenses_dates.c.date),
        select(DailyClosure.date),
    ).subquery()

    query = select(
        union_query.c.date,
        func.coalesce(
            select(func.sum(Payment.amount))
            .where(Payment.date == union_query.c.date)
            .correlate(union_query)
            .scalar_subquery(), 0
        ).label("total_payments_in"),
        func.coalesce(
            select(func.sum(Expense.amount))
            .where(Expense.date == union_query.c.date)
            .correlate(union_query)
            .scalar_subquery(), 0
        ).label("total_expenses_out"),
        select(DailyClosure.status)
        .where(DailyClosure.date == union_query.c.date)
        .correlate(union_query)
        .scalar_subquery().label("status"),
        select(DailyClosure.closed_by_manager_id)
        .where(DailyClosure.date == union_query.c.date)
        .correlate(union_query)
        .scalar_subquery().label("closed_by_manager_id"),
    ).order_by(union_query.c.date.desc())

    if date_from:
        query = query.where(union_query.c.date >= date_from)
    if date_to:
        query = query.where(union_query.c.date <= date_to)

    result = await db.execute(query)
    rows = result.fetchall()

    return [
        {
            "date": row.date,
            "status": row.status or "pending",
            "closed_by_manager_id": row.closed_by_manager_id,
            "total_payments_in": float(row.total_payments_in or 0),
            "total_expenses_out": float(row.total_expenses_out or 0),
            "net_cash_flow": float((row.total_payments_in or 0) - (row.total_expenses_out or 0)),
        }
        for row in rows
    ]


async def get_daily_ledger(db: AsyncSession, ledger_date: date) -> dict:
    payments_in_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date == ledger_date)
    )
    total_payments_in = float(payments_in_result.scalar() or 0)

    expenses_out_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date == ledger_date)
    )
    total_expenses_out = float(expenses_out_result.scalar() or 0)

    payments_detail_result = await db.execute(
        select(
            Payment.id,
            Payment.amount,
            Payment.receipt_number,
            Payment.payment_method,
            Payment.transaction_number,
            Payment.enrollment_id,
            Payment.created_by,
            Enrollment.student_id,
            Student.full_name,
            Course.name,
            Employee.full_name,
        )
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
        .outerjoin(User, Payment.created_by == User.id)
        .outerjoin(Employee, User.employee_id == Employee.id)
        .where(Payment.date == ledger_date)
        .order_by(Payment.receipt_number)
    )
    payments_detail = [
        {
            "id": row[0],
            "amount": float(row[1]),
            "receipt_number": row[2],
            "payment_method": row[3] if isinstance(row[3], str) else row[3].value if hasattr(row[3], 'value') else str(row[3]),
            "transaction_number": row[4],
            "enrollment_id": row[5],
            "created_by": row[6],
            "student_id": row[7],
            "student_name": row[8],
            "course_name": row[9],
            "created_by_name": row[10] or "",
        }
        for row in payments_detail_result.fetchall()
    ]

    expenses_detail_result = await db.execute(
        select(
            Expense.id,
            Expense.amount,
            Expense.receipt_number,
            Expense.type,
            Expense.recipient_name,
            Expense.description,
            Expense.recipient_id,
            Expense.created_by,
            Employee.full_name,
        )
        .outerjoin(User, Expense.created_by == User.id)
        .outerjoin(Employee, User.employee_id == Employee.id)
        .where(Expense.date == ledger_date)
        .order_by(Expense.receipt_number)
    )
    expenses_detail = [
        {
            "id": row[0],
            "amount": float(row[1]),
            "receipt_number": row[2],
            "type": row[3],
            "recipient_name": row[4],
            "description": row[5],
            "recipient_id": row[6],
            "created_by": row[7],
            "created_by_name": row[8] or "",
        }
        for row in expenses_detail_result.fetchall()
    ]

    prev_date = ledger_date - timedelta(days=1)
    next_date = ledger_date + timedelta(days=1)

    closure_result = await db.execute(select(DailyClosure).where(DailyClosure.date == ledger_date))
    closure = closure_result.scalar_one_or_none()

    return {
        "date": ledger_date,
        "total_payments_in": total_payments_in,
        "total_expenses_out": total_expenses_out,
        "net_cash_flow": total_payments_in - total_expenses_out,
        "status": closure.status if closure else "pending",
        "closed_by_manager_id": closure.closed_by_manager_id if closure else None,
        "payments": payments_detail,
        "expenses": expenses_detail,
        "prev_date": prev_date,
        "next_date": next_date,
    }


# ─────────────────────────────────────────────
# Revenue Overview
# ─────────────────────────────────────────────
async def get_revenue_overview(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date.replace(day=1)

    period_start = start_date
    period_end = end_date

    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end.replace(day=1)

    # total revenue & count for current period
    rev_result = await db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(Payment.id),
        ).where(Payment.date >= period_start, Payment.date <= period_end)
    )
    total_revenue, transaction_count = rev_result.one()
    total_revenue = float(total_revenue)
    transaction_count = int(transaction_count or 0)

    # total expenses
    exp_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date >= period_start, Expense.date <= period_end)
    )
    total_expenses = float(exp_result.scalar() or 0)

    net_revenue = total_revenue - total_expenses

    # unique students with payments
    student_count_result = await db.execute(
        select(func.count(func.distinct(Enrollment.student_id)))
        .join(Payment, Payment.enrollment_id == Enrollment.id)
        .where(Payment.date >= period_start, Payment.date <= period_end)
    )
    unique_students = int(student_count_result.scalar() or 0)
    avg_per_student = round(total_revenue / unique_students, 2) if unique_students > 0 else 0

    # comparison with previous period
    prev_rev_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date >= prev_start, Payment.date <= prev_end)
    )
    prev_revenue = float(prev_rev_result.scalar() or 0)
    change_pct = round(
        ((total_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0, 2
    )

    # monthly trend (current year + previous year for context)
    trend_start = period_start.replace(month=1, day=1)
    trend_result = await db.execute(
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
            )
            SELECT COALESCE(r.month, e.month) AS month,
                   COALESCE(r.revenue, 0) AS revenue,
                   COALESCE(e.expenses, 0) AS expenses
            FROM monthly_revenue r
            FULL OUTER JOIN monthly_expenses e ON e.month = r.month
            ORDER BY month
        """),
        {"start": trend_start, "end": period_end}
    )
    monthly_trend = [
        {"month": row[0], "revenue": float(row[1]), "expenses": float(row[2])}
        for row in trend_result.fetchall()
    ]

    # revenue by course
    by_course_result = await db.execute(
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
        {"start": period_start, "end": period_end}
    )
    by_course_rows = by_course_result.fetchall()
    by_course = [
        {
            "course_name": row[0],
            "revenue": float(row[1]),
            "pct": round(float(row[1]) / total_revenue * 100, 2) if total_revenue > 0 else 0,
        }
        for row in by_course_rows
    ]

    # revenue by teacher
    by_teacher_result = await db.execute(
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
        {"start": period_start, "end": period_end}
    )
    by_teacher_rows = by_teacher_result.fetchall()
    by_teacher = [
        {
            "teacher_name": row[0],
            "revenue": float(row[1]),
            "pct": round(float(row[1]) / total_revenue * 100, 2) if total_revenue > 0 else 0,
        }
        for row in by_teacher_rows
    ]

    # daily breakdown
    daily_result = await db.execute(
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
            )
            SELECT COALESCE(r.date::text, e.date::text) AS date,
                   COALESCE(r.revenue, 0) AS revenue,
                   COALESCE(e.expenses, 0) AS expenses
            FROM daily_revenue r
            FULL OUTER JOIN daily_expenses e ON e.date = r.date
            ORDER BY date
        """),
        {"start": period_start, "end": period_end}
    )
    daily_breakdown = [
        {"date": row[0], "revenue": float(row[1]), "expenses": float(row[2])}
        for row in daily_result.fetchall()
    ]

    return {
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_revenue": net_revenue,
        "transaction_count": transaction_count,
        "avg_per_student": avg_per_student,
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


async def is_date_closed(db: AsyncSession, check_date: date) -> bool:
    result = await db.execute(select(DailyClosure).where(DailyClosure.date == check_date))
    closure = result.scalar_one_or_none()
    if not closure:
        return False
    return closure.status in ("closed", "unlock_requested")


async def get_student_payment_summary(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> dict:
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid = Decimal(str(total_paid_result.scalar() or 0))

    enrollment_result = await db.execute(
        select(Enrollment).where(Enrollment.id == enrollment_id)
    )
    enrollment = enrollment_result.scalar_one_or_none()

    agreed_price = enrollment.agreed_price if enrollment else None
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


# ─────────────────────────────────────────────
RECEIPT_HTML_EN = {
    "cash": "Cash",
    "online": "Bank Transfer",
}

RECEIPT_HTML_AR = {
    "cash": "نقداً",
    "online": "تحويل بنكي",
}

EXPENSE_TYPE_LABELS_EN = {
    "general_expense": "General Expense",
    "teacher_withdrawal": "Teacher Withdrawal",
    "secretary_advance": "Secretary Advance",
}

EXPENSE_TYPE_LABELS_AR = {
    "general_expense": "مصروف عام",
    "teacher_withdrawal": "سحب معلم",
    "secretary_advance": "سلفة سكرتير",
}

EXPENSE_TYPE_BADGE = {
    "general_expense": "badge-general",
    "teacher_withdrawal": "badge-teacher",
    "secretary_advance": "badge-secretary",
}


def _generate_receipt_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    student_name: str = "",
    course_name: str = "",
    payment_method: str = "cash",
    transaction_number: Optional[str] = None,
    agreed_price: Optional[float] = None,
    admin_discount: Optional[float] = None,
    total_paid: Optional[float] = None,
    balance_remaining: Optional[float] = None,
    locale: str = "ar",
    institute_name: str = "Al-Drasat ERP",
    cashier_name: str = "",
    currency: str = "YER",
) -> str:
    labels = RECEIPT_HTML_AR if locale == "ar" else RECEIPT_HTML_EN
    method_label = labels["online"] if payment_method == "online" else labels["cash"]
    amount_str = f"{amount:.2f} {currency}"

    agreed_str = f"{agreed_price:.2f} {currency}" if agreed_price is not None else ""
    discount_str = f"{admin_discount:.2f} {currency}" if admin_discount and admin_discount > 0 else ""
    balance_str = f"{balance_remaining:.2f} {currency}" if balance_remaining is not None else ""

    if discount_str:
        discount_en = f'Discount: <span class="fill-in" style="min-width:80px;">-{discount_str}</span><br>'
        discount_ar = f'الخصم: <span class="fill-in" style="min-width:80px;">-{discount_str}</span><br>'
    else:
        discount_en = ""
        discount_ar = ""

    variables = {
        "receipt_title_ar": "إيصال دفع",
        "receipt_title_en": "Payment Receipt",
        "receipt_number": receipt_number,
        "date": date_str,
        "student_name": student_name,
        "course_name": course_name,
        "payment_method": method_label,
        "agreed_price": agreed_str,
        "discount_en": discount_en,
        "discount_ar": discount_ar,
        "paid_amount": amount_str,
        "balance": balance_str,
        "cashier_name": cashier_name,
    }
    return template_engine.render_receipt(variables)


def _generate_voucher_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    expense_type: str = "general_expense",
    recipient_name: str = "",
    description: Optional[str] = None,
    locale: str = "ar",
    institute_name: str = "Al-Drasat ERP",
    cashier_name: str = "",
    currency: str = "YER",
) -> str:
    type_labels = EXPENSE_TYPE_LABELS_AR if locale == "ar" else EXPENSE_TYPE_LABELS_EN
    type_label = type_labels.get(expense_type, expense_type)
    amount_str = f"{amount:.2f} {currency}"

    variables = {
        "voucher_title_ar": "سند صرف",
        "voucher_title_en": "Payment Voucher",
        "voucher_number": receipt_number,
        "date": date_str,
        "expense_type": type_label,
        "recipient_name": recipient_name,
        "description": description or "",
        "amount": amount_str,
        "cashier_name": cashier_name,
    }
    return template_engine.render_voucher(variables)


async def get_receipt_html_content(db: AsyncSession, payment_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    result = await db.execute(
        select(Payment)
        .options(
            joinedload(Payment.enrollment)
            .joinedload(Enrollment.student),
            joinedload(Payment.enrollment)
            .joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Payment.created_by_user).joinedload(User.employee),
        )
        .where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return None

    enrollment = payment.enrollment
    student = enrollment.student
    section = enrollment.section
    course = section.course

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment.id)
    )
    total_paid = Decimal(str(total_paid_result.scalar() or 0))
    agreed_price = enrollment.agreed_price or 0
    discount_pct = enrollment.admin_discount or 0
    discount_amount = agreed_price * discount_pct / 100
    net_price = agreed_price - discount_amount
    if net_price <= 0:
        net_price = max(agreed_price, 1)
    balance_remaining = net_price - total_paid

    cashier_name = (payment.created_by_user.full_name or "") if payment.created_by_user else ""

    return _generate_receipt_html(
        receipt_number=payment.receipt_number,
        date_str=payment.date.isoformat(),
        amount=payment.amount,
        student_name=student.full_name if student else "",
        course_name=course.name if course else "",
        payment_method=payment.payment_method,
        transaction_number=payment.transaction_number,
        agreed_price=agreed_price if agreed_price > 0 else None,
        admin_discount=discount_amount if discount_amount > 0 else None,
        total_paid=total_paid,
        balance_remaining=balance_remaining,
        locale=locale,
        cashier_name=cashier_name,
    )


async def get_voucher_html_content(db: AsyncSession, expense_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    result = await db.execute(
        select(Expense)
        .options(joinedload(Expense.created_by_user).joinedload(User.employee))
        .where(Expense.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return None

    cashier_name = (expense.created_by_user.full_name or "") if expense.created_by_user else ""

    return _generate_voucher_html(
        receipt_number=expense.receipt_number,
        date_str=expense.date.isoformat(),
        amount=expense.amount,
        expense_type=expense.type,
        recipient_name=expense.recipient_name,
        description=expense.description,
        locale=locale,
        cashier_name=cashier_name,
    )
