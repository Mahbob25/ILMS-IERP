import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update, text, or_
from sqlalchemy.orm import joinedload

from app.modules.lms.models import Payment, TeacherWallet, Expense, DailyClosure
from app.modules.academic.models import Course, CourseSection, Enrollment, Student
from app.modules.identity.models import Employee, EmployeeType, CompensationType
from app.core.storage import ensure_upload_dir


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
    payment_method: str = "cash",
    transaction_number: Optional[str] = None,
    locale: str = "ar",
) -> Optional[Payment]:
    if payment_date is None:
        payment_date = date.today()

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be positive"
        )

    if payment_method == "online" and not transaction_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction number is required for online payments"
        )

    enrollment_result = await db.execute(
        select(Enrollment)
        .options(joinedload(Enrollment.section).joinedload(CourseSection.course))
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
        payment_method=payment_method,
        transaction_number=transaction_number if payment_method == "online" else None,
    )
    db.add(payment)

    section = enrollment.section
    teacher_pct = section.teacher_percentage or 0

    teacher_share = amount * teacher_pct / 100.0

    if teacher_share > 0:
        teacher_emp_result = await db.execute(
            select(Employee).where(Employee.id == section.teacher_id)
        )
        teacher_emp = teacher_emp_result.scalar_one_or_none()
        if teacher_emp and teacher_emp.compensation_type == CompensationType.SALARY:
            teacher_share = 0

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

    student = enrollment.student
    section = enrollment.section
    course = section.course

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment_id)
    )
    total_paid = float(total_paid_result.scalar() or 0.0)
    agreed_price = enrollment.agreed_price or 0
    discount_pct = enrollment.admin_discount or 0
    discount_amount = agreed_price * discount_pct / 100.0
    net_price = agreed_price - discount_amount
    if net_price <= 0:
        net_price = max(agreed_price, 1)
    balance_remaining = net_price - total_paid

    try:
        receipt_html = _generate_receipt_html(
            receipt_number=payment.receipt_number,
            date_str=payment_date.isoformat(),
            amount=amount,
            student_name=student.full_name if student else "",
            course_name=course.name if course else "",
            payment_method=payment_method,
            transaction_number=transaction_number,
            agreed_price=agreed_price if agreed_price > 0 else None,
            admin_discount=discount_amount if discount_amount > 0 else None,
            total_paid=total_paid,
            balance_remaining=balance_remaining,
            locale=locale,
        )
        receipt_dir = ensure_upload_dir("receipts")
        receipt_path = receipt_dir / f"{payment.id}.html"
        receipt_path.write_text(receipt_html, encoding="utf-8")
    except Exception:
        pass

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
    locale: str = "ar",
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

    try:
        voucher_html = _generate_voucher_html(
            receipt_number=expense.receipt_number,
            date_str=expense_date.isoformat(),
            amount=amount,
            expense_type=expense_type,
            recipient_name=recipient_name or "Unknown",
            description=description,
            locale=locale,
        )
        voucher_dir = ensure_upload_dir("vouchers")
        voucher_path = voucher_dir / f"{expense.id}.html"
        voucher_path.write_text(voucher_html, encoding="utf-8")
    except Exception:
        pass

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
    total_payments_in = payments_in_result.scalar() or 0.0

    expenses_out_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date == ledger_date)
    )
    total_expenses_out = expenses_out_result.scalar() or 0.0

    payments_detail_result = await db.execute(
        select(
            Payment.id,
            Payment.amount,
            Payment.receipt_number,
            Payment.payment_method,
            Payment.transaction_number,
            Payment.enrollment_id,
            Enrollment.student_id,
            Student.full_name,
            Course.name,
        )
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
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
            "student_id": row[6],
            "student_name": row[7],
            "course_name": row[8],
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
        )
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


# ─────────────────────────────────────────────
# Receipt & Voucher HTML Templates
# ─────────────────────────────────────────────

RECEIPT_HTML_TEMPLATE = """<!DOCTYPE html>
<html dir="{dir}">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}

  body {{
    font-family: {font_family};
    background: #f8fafc;
    display: flex;
    justify-content: center;
    padding: 40px 20px;
    color: #1e293b;
  }}

  .receipt {{
    width: 480px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }}

  .receipt-header {{
    background: linear-gradient(135deg, #1E3A8A 0%, #312e81 100%);
    padding: 28px 32px 20px;
    text-align: center;
  }}

  .receipt-header h2 {{
    color: #ffffff;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }}

  .receipt-header p {{
    color: rgba(255,255,255,0.8);
    font-size: 12px;
    margin-top: 4px;
  }}

  .receipt-badge {{
    display: inline-block;
    margin-top: 10px;
    padding: 4px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    background: rgba(255,255,255,0.15);
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.2);
  }}

  .accent-bar {{
    height: 4px;
    background: linear-gradient(90deg, #0D9488, #14b8a6);
  }}

  .receipt-body {{
    padding: 20px 32px 24px;
  }}

  .receipt-row {{
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
  }}

  .receipt-row .label {{
    color: #64748b;
  }}

  .receipt-row .value {{
    font-weight: 500;
    color: #1e293b;
  }}

  .receipt-row .value-mono {{
    font-family: 'Courier New', monospace;
    font-weight: 600;
  }}

  .divider {{
    border: none;
    border-top: 1px dashed #e2e8f0;
    margin: 10px 0;
  }}

  .divider-solid {{
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 12px 0;
  }}

  .amount-section {{
    margin: 12px 0;
  }}

  .amount-row {{
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 13px;
  }}

  .amount-total {{
    display: flex;
    justify-content: space-between;
    padding: 10px 0 4px;
    font-size: 18px;
    font-weight: 700;
  }}

  .amount-green {{
    color: #059669;
  }}

  .amount-red {{
    color: #dc2626;
  }}

  .signature-section {{
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #94a3b8;
  }}

  .expense-badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid;
  }}

  .badge-general {{
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
  }}

  .badge-teacher {{
    background: #fffbeb;
    color: #d97706;
    border-color: #fde68a;
  }}

  .badge-secretary {{
    background: #faf5ff;
    color: #9333ea;
    border-color: #e9d5ff;
  }}
</style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-header">
      <h2>{institute_name}</h2>
      <p>{receipt_title}</p>
      <span class="receipt-badge">{receipt_number}</span>
    </div>
    <div class="accent-bar"></div>
    <div class="receipt-body">
      <div class="receipt-row">
        <span class="label">{date_label}</span>
        <span class="value">{date}</span>
      </div>

      <!-- payment section -->
      {{payment_section}}

      <!-- expense section -->
      {{expense_section}}

      <div class="amount-total">
        <span>{paid_label}</span>
        <span class="{amount_class}">{amount}</span>
      </div>

      <!-- balance section -->
      {{balance_section}}

      <div class="signature-section">
        <span>{cashier_label}: {cashier_name}</span>
        <span>{signature_label}</span>
      </div>
    </div>
  </div>
</body>
</html>"""

RECEIPT_PAYMENT_SECTION = """
      <div class="receipt-row">
        <span class="label">{student_label}</span>
        <span class="value">{student_name}</span>
      </div>
      <div class="receipt-row">
        <span class="label">{course_label}</span>
        <span class="value">{course_name}</span>
      </div>
      <div class="receipt-row">
        <span class="label">{method_label}</span>
        <span class="value">{payment_method}</span>
      </div>
      {transaction_section}
      {pricing_section}
"""

RECEIPT_PRICING_SECTION = """
      <hr class="divider">
      <div class="receipt-row">
        <span class="label">{agreed_price_label}</span>
        <span class="value">{agreed_price}</span>
      </div>
      {discount_section}
      <hr class="divider-solid">
"""

RECEIPT_BALANCE_SECTION = """
      <div class="receipt-row">
        <span class="label">{balance_label}</span>
        <span class="value {balance_class}">{balance}</span>
      </div>
"""

VOUCHER_HTML_TEMPLATE = """<!DOCTYPE html>
<html dir="{dir}">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}

  body {{
    font-family: {font_family};
    background: #f8fafc;
    display: flex;
    justify-content: center;
    padding: 40px 20px;
    color: #1e293b;
  }}

  .receipt {{
    width: 480px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }}

  .receipt-header {{
    background: linear-gradient(135deg, #1E3A8A 0%, #312e81 100%);
    padding: 28px 32px 20px;
    text-align: center;
  }}

  .receipt-header h2 {{
    color: #ffffff;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }}

  .receipt-header p {{
    color: rgba(255,255,255,0.8);
    font-size: 12px;
    margin-top: 4px;
  }}

  .receipt-badge {{
    display: inline-block;
    margin-top: 10px;
    padding: 4px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    background: rgba(255,255,255,0.15);
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.2);
  }}

  .accent-bar {{
    height: 4px;
    background: linear-gradient(90deg, #0D9488, #14b8a6);
  }}

  .receipt-body {{
    padding: 20px 32px 24px;
  }}

  .receipt-row {{
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
  }}

  .receipt-row .label {{
    color: #64748b;
  }}

  .receipt-row .value {{
    font-weight: 500;
    color: #1e293b;
  }}

  .amount-total {{
    display: flex;
    justify-content: space-between;
    padding: 10px 0 4px;
    font-size: 18px;
    font-weight: 700;
  }}

  .amount-red {{
    color: #dc2626;
  }}

  .expense-badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    border: 1px solid;
  }}

  .badge-general {{
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
  }}

  .badge-teacher {{
    background: #fffbeb;
    color: #d97706;
    border-color: #fde68a;
  }}

  .badge-secretary {{
    background: #faf5ff;
    color: #9333ea;
    border-color: #e9d5ff;
  }}

  .divider {{
    border: none;
    border-top: 1px dashed #e2e8f0;
    margin: 10px 0;
  }}

  .signature-section {{
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #94a3b8;
  }}
</style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-header">
      <h2>{institute_name}</h2>
      <p>{voucher_title}</p>
      <span class="receipt-badge">{receipt_number}</span>
    </div>
    <div class="accent-bar"></div>
    <div class="receipt-body">
      <div class="receipt-row">
        <span class="label">{date_label}</span>
        <span class="value">{date}</span>
      </div>
      <div class="receipt-row">
        <span class="label">{type_label}</span>
        <span class="value"><span class="expense-badge {badge_class}">{expense_type}</span></span>
      </div>
      <div class="receipt-row">
        <span class="label">{recipient_label}</span>
        <span class="value">{recipient_name}</span>
      </div>
      {description_section}
      <hr class="divider">
      <div class="amount-total">
        <span>{paid_label}</span>
        <span class="amount-red">{amount}</span>
      </div>
      <div class="signature-section">
        <span>{cashier_label}: {cashier_name}</span>
        <span>{signature_label}</span>
      </div>
    </div>
  </div>
</body>
</html>"""

RECEIPT_HTML_EN = {
    "receipt_title": "Payment Receipt",
    "voucher_title": "Payment Voucher",
    "date_label": "Date",
    "student_label": "Student",
    "course_label": "Course",
    "method_label": "Payment Method",
    "cash": "Cash",
    "online": "Bank Transfer",
    "transaction_label": "Transaction No.",
    "agreed_price_label": "Agreed Price",
    "discount_label": "Discount",
    "paid_label": "Paid",
    "balance_label": "Balance",
    "cashier_label": "Cashier",
    "signature_label": "Student Signature: _______________",
    "type_label": "Type",
    "recipient_label": "Recipient",
    "voucher_signature_label": "Recipient Signature: _______________",
    "font_family": "'Inter', sans-serif",
    "dir": "ltr",
}

RECEIPT_HTML_AR = {
    "receipt_title": "إيصال دفع",
    "voucher_title": "سند صرف",
    "date_label": "التاريخ",
    "student_label": "الطالب",
    "course_label": "المقرر",
    "method_label": "طريقة الدفع",
    "cash": "نقداً",
    "online": "تحويل بنكي",
    "transaction_label": "رقم العملية",
    "agreed_price_label": "السعر المتفق عليه",
    "discount_label": "الخصم",
    "paid_label": "مدفوع",
    "balance_label": "المتبقي",
    "cashier_label": "أمين الصندوق",
    "signature_label": "توقيع الطالب: _______________",
    "type_label": "النوع",
    "recipient_label": "المستلم",
    "voucher_signature_label": "توقيع المستلم: _______________",
    "font_family": "'IBM Plex Sans Arabic', 'Inter', sans-serif",
    "dir": "rtl",
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
    institute_name: str = "Advanced Learning Institute",
    cashier_name: str = "",
    currency: str = "SAR",
) -> str:
    labels = RECEIPT_HTML_AR if locale == "ar" else RECEIPT_HTML_EN
    method_label = labels["online"] if payment_method == "online" else labels["cash"]
    amount_str = f"{amount:.2f} {currency}"

    transaction_section = ""
    if transaction_number:
        transaction_section = (
            f'<div class="receipt-row">'
            f'<span class="label">{labels["transaction_label"]}</span>'
            f'<span class="value value-mono">{transaction_number}</span>'
            f"</div>"
        )

    pricing_section = ""
    if agreed_price is not None or (admin_discount is not None and admin_discount > 0):
        agreed_str = f"{agreed_price:.2f} {currency}" if agreed_price is not None else "—"
        discount_section = ""
        if admin_discount is not None and admin_discount > 0:
            discount_section = (
                f'<div class="receipt-row">'
                f'<span class="label">{labels["discount_label"]}</span>'
                f'<span class="value" style="color:#dc2626">-{admin_discount:.2f} {currency}</span>'
                f"</div>"
            )
        pricing_section = RECEIPT_PRICING_SECTION.format(
            agreed_price_label=labels["agreed_price_label"],
            agreed_price=agreed_str,
            discount_section=discount_section,
        )

    payment_section = RECEIPT_PAYMENT_SECTION.format(
        student_label=labels["student_label"],
        student_name=student_name,
        course_label=labels["course_label"],
        course_name=course_name,
        method_label=labels["method_label"],
        payment_method=method_label,
        transaction_section=transaction_section,
        pricing_section=pricing_section,
    )

    balance_section = ""
    balance_class = "amount-green"
    if balance_remaining is not None:
        if balance_remaining > 0:
            balance_class = "amount-green"
        else:
            balance_class = "amount-red"
        balance_str = f"{balance_remaining:.2f} {currency}"
        balance_section = RECEIPT_BALANCE_SECTION.format(
            balance_label=labels["balance_label"],
            balance=balance_str,
            balance_class=balance_class,
        )

    html = RECEIPT_HTML_TEMPLATE.format(
        dir=labels["dir"],
        font_family=labels["font_family"],
        institute_name=institute_name,
        receipt_title=labels["receipt_title"],
        receipt_number=receipt_number,
        date_label=labels["date_label"],
        date=date_str,
        paid_label=labels["paid_label"],
        amount_class="amount-green",
        amount=amount_str,
        cashier_label=labels["cashier_label"],
        cashier_name=cashier_name,
        signature_label=labels["signature_label"],
    )

    # Replace placeholders with sub-sections
    html = html.replace(
        "{payment_section}", payment_section
    ).replace(
        "{expense_section}", ""
    ).replace(
        "{balance_section}", balance_section
    )

    return html


def _generate_voucher_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    expense_type: str = "general_expense",
    recipient_name: str = "",
    description: Optional[str] = None,
    locale: str = "ar",
    institute_name: str = "Advanced Learning Institute",
    cashier_name: str = "",
    currency: str = "SAR",
) -> str:
    labels = RECEIPT_HTML_AR if locale == "ar" else RECEIPT_HTML_EN
    type_labels = EXPENSE_TYPE_LABELS_AR if locale == "ar" else EXPENSE_TYPE_LABELS_EN
    badge_class = EXPENSE_TYPE_BADGE.get(expense_type, "badge-general")
    type_label = type_labels.get(expense_type, expense_type)
    amount_str = f"{amount:.2f} {currency}"
    signature_label = labels.get("voucher_signature_label", labels["signature_label"])

    description_section = ""
    if description:
        description_section = (
            f'<div class="receipt-row">'
            f'<span class="label">{description}</span>'
            f"</div>"
        )

    html = VOUCHER_HTML_TEMPLATE.format(
        dir=labels["dir"],
        font_family=labels["font_family"],
        institute_name=institute_name,
        voucher_title=labels["voucher_title"],
        receipt_number=receipt_number,
        date_label=labels["date_label"],
        date=date_str,
        type_label=labels["type_label"],
        badge_class=badge_class,
        expense_type=type_label,
        recipient_label=labels["recipient_label"],
        recipient_name=recipient_name,
        description_section=description_section,
        paid_label=labels["paid_label"],
        amount=amount_str,
        cashier_label=labels["cashier_label"],
        cashier_name=cashier_name,
        signature_label=signature_label,
    )

    return html


async def get_receipt_html_content(db: AsyncSession, payment_id: uuid.UUID) -> Optional[str]:
    from app.core.storage import UPLOAD_DIR
    html_file = UPLOAD_DIR / "receipts" / f"{payment_id}.html"
    if html_file.exists():
        return html_file.read_text(encoding="utf-8")
    return None


async def get_voucher_html_content(db: AsyncSession, expense_id: uuid.UUID) -> Optional[str]:
    from app.core.storage import UPLOAD_DIR
    html_file = UPLOAD_DIR / "vouchers" / f"{expense_id}.html"
    if html_file.exists():
        return html_file.read_text(encoding="utf-8")
    return None
