import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update, text, or_
from sqlalchemy.orm import joinedload

from app.modules.lms.models import Payment, TeacherWallet, Expense, DailyClosure
from app.modules.academic.models import Course, CourseSection, Enrollment
from app.modules.identity.models import Employee, EmployeeType


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
    payment_date: Optional[date] = None,
) -> Optional[Payment]:
    if payment_date is None:
        payment_date = date.today()

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be positive"
        )

    enrollment_result = await db.execute(
        select(Enrollment).options(joinedload(Enrollment.section)).where(Enrollment.id == enrollment_id)
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if not enrollment:
        return None

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid_before = float(total_paid_result.scalar() or 0.0)
    agreed_price = enrollment.agreed_price or 0
    discount_pct = enrollment.admin_discount or 0
    discount_amount = agreed_price * discount_pct / 100.0
    net_price = agreed_price - discount_amount
    if net_price <= 0:
        net_price = max(agreed_price, 1)
    remaining = net_price - total_paid_before
    if amount > remaining + 0.001:
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
    )
    db.add(payment)

    section = enrollment.section
    teacher_pct = section.teacher_percentage or 0

    teacher_share = amount * teacher_pct / 100.0

    if teacher_share > 0:
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
    enrollment_id: Optional[uuid.UUID] = None,
    student_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Payment]:
    query = select(Payment).order_by(Payment.date.desc(), Payment.receipt_number.desc())
    if enrollment_id:
        query = query.where(Payment.enrollment_id == enrollment_id)
    if student_id:
        query = query.join(Enrollment).where(Enrollment.student_id == student_id)
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


async def get_teacher_withdrawals(db: AsyncSession, employee_id: uuid.UUID) -> list[Expense]:
    result = await db.execute(
        select(Expense)
        .where(
            Expense.type == "teacher_withdrawal",
            Expense.recipient_id == employee_id,
        )
        .order_by(Expense.date.desc(), Expense.receipt_number.desc())
    )
    return result.scalars().all()


# ─────────────────────────────────────────────
# Expenses
# ─────────────────────────────────────────────
async def get_eligible_recipients(db: AsyncSession, recipient_type: str) -> list[dict]:
    now = datetime.now(timezone.utc).date()
    month_start = now.replace(day=1)

    if recipient_type == "teacher_withdrawal":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type == EmployeeType.TEACHER, Employee.is_active == True)
        )
        teachers = employees_result.scalars().all()

        result = []
        for emp in teachers:
            wallet_result = await db.execute(
                select(TeacherWallet).where(TeacherWallet.teacher_id == emp.id)
            )
            wallet = wallet_result.scalar_one_or_none()
            balance = wallet.balance if wallet else 0
            result.append({
                "id": str(emp.id),
                "full_name": emp.full_name,
                "role": "teacher",
                "available_limit": balance,
                "is_eligible": balance > 0,
            })
        return result

    elif recipient_type == "secretary_advance":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type == EmployeeType.SECRETARY, Employee.is_active == True)
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
            stipend = emp.salary or 0
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
    recipient_name: Optional[str] = None,
    recipient_id: Optional[uuid.UUID] = None,
    expense_type: str = "general_expense",
    description: Optional[str] = None,
    expense_date: Optional[date] = None,
) -> Expense:
    if expense_date is None:
        expense_date = date.today()

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
            if not wallet or wallet.balance < amount:
                raise ValueError("Insufficient wallet balance")

        elif expense_type == "secretary_advance":
            stipend = employee.salary or 0
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
    )
    db.add(expense)

    # Auto-deduct wallet for teacher withdrawal
    if expense_type == "teacher_withdrawal" and recipient_id:
        wallet_result = await db.execute(
            select(TeacherWallet).where(TeacherWallet.teacher_id == recipient_id)
        )
        wallet = wallet_result.scalar_one_or_none()
        if wallet:
            wallet.balance -= amount
            wallet.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)

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
            SELECT
                to_char(p.date, 'YYYY-MM') AS month,
                COALESCE(SUM(p.amount), 0) AS revenue,
                COALESCE(SUM(e.amount), 0) AS expenses
            FROM payments p
            LEFT JOIN expenses e ON to_char(e.date, 'YYYY-MM') = to_char(p.date, 'YYYY-MM')
            WHERE p.date >= :start AND p.date <= :end
            GROUP BY month
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
            SELECT
                p.date::text,
                COALESCE(SUM(p.amount), 0) AS revenue,
                COALESCE(SUM(e.amount), 0) AS expenses
            FROM payments p
            LEFT JOIN expenses e ON e.date = p.date
            WHERE p.date >= :start AND p.date <= :end
            GROUP BY p.date
            ORDER BY p.date
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
    return closure is not None and closure.status == "closed"


async def get_student_payment_summary(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> dict:
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid = total_paid_result.scalar() or 0.0

    enrollment_result = await db.execute(
        select(Enrollment).where(Enrollment.id == enrollment_id)
    )
    enrollment = enrollment_result.scalar_one_or_none()

    agreed_price = enrollment.agreed_price if enrollment else None
    admin_discount = enrollment.admin_discount if enrollment else None
    discount_amount = (agreed_price * admin_discount / 100.0) if (agreed_price is not None and admin_discount is not None) else None
    net_price = (agreed_price - discount_amount) if (agreed_price is not None and discount_amount is not None) else agreed_price
    balance_remaining = (net_price - total_paid) if net_price is not None else None

    return {
        "total_paid": total_paid,
        "agreed_price": agreed_price,
        "admin_discount": admin_discount,
        "net_price": net_price,
        "balance_remaining": balance_remaining,
    }
