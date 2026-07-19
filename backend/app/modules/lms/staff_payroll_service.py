import uuid
from decimal import Decimal
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.modules.identity.models import Employee, EmployeeType, User
from app.modules.lms.models import Expense
from app.modules.lms.financial_service import get_next_voucher_number


async def list_staff_for_payroll(
    db: AsyncSession,
) -> list[dict]:
    now = date.today()
    month_start = now.replace(day=1)

    employees_result = await db.execute(
        select(Employee)
        .where(
            Employee.employee_type != EmployeeType.TEACHER,
            Employee.is_active,
        )
        .options(joinedload(Employee.user))
        .order_by(Employee.full_name)
    )
    employees = employees_result.unique().scalars().all()

    if not employees:
        return []

    emp_ids = [e.id for e in employees]
    draws_result = await db.execute(
        select(
            Expense.recipient_id,
            func.coalesce(func.sum(Expense.amount), 0),
        )
        .where(
            Expense.recipient_id.in_(emp_ids),
            Expense.type == "salary_draw",
            Expense.date >= month_start,
            Expense.date <= now,
        )
        .group_by(Expense.recipient_id)
    )
    draws_map = dict(draws_result.fetchall())

    result = []
    for emp in employees:
        monthly_salary = float(emp.default_salary or 0)
        total_drawn = float(draws_map.get(emp.id, 0))
        remaining = monthly_salary - total_drawn

        result.append({
            "id": str(emp.id),
            "full_name": emp.full_name,
            "role": emp.employee_type.value,
            "monthly_salary": monthly_salary,
            "total_drawn_this_month": total_drawn,
            "remaining_balance": remaining,
        })

    return result


async def process_salary_withdrawal(
    db: AsyncSession,
    employee_id: uuid.UUID,
    amount: float,
    created_by: uuid.UUID,
    description: Optional[str] = None,
    withdrawal_date: Optional[date] = None,
) -> Expense:
    if withdrawal_date is None:
        withdrawal_date = date.today()

    if amount <= 0:
        raise ValueError("Withdrawal amount must be positive")

    emp_result = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .with_for_update()
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise ValueError("Employee not found")
    if not employee.is_active:
        raise ValueError("Employee is not active")
    if employee.employee_type == EmployeeType.TEACHER:
        raise ValueError("Teachers use teacher withdrawal, not salary draw")
    if not employee.default_salary or employee.default_salary <= 0:
        raise ValueError("Employee has no monthly salary configured")

    monthly_salary = float(employee.default_salary)
    amount_dec = Decimal(str(amount))
    month_start = withdrawal_date.replace(day=1)

    total_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.type == "salary_draw",
            Expense.recipient_id == employee_id,
            Expense.date >= month_start,
            Expense.date <= withdrawal_date,
        )
    )
    total_drawn = float(total_result.scalar() or 0)
    remaining = monthly_salary - total_drawn

    if amount > remaining:
        raise ValueError(
            f"Insufficient remaining monthly salary. "
            f"Available: {remaining:.2f}, Requested: {amount:.2f}. "
            f"Monthly ceiling: {monthly_salary:.2f}, "
            f"Already drawn: {total_drawn:.2f}."
        )

    receipt_number = await get_next_voucher_number(db, withdrawal_date)

    expense = Expense(
        amount=amount_dec,
        description=description,
        recipient_name=employee.full_name,
        recipient_id=employee_id,
        date=withdrawal_date,
        receipt_number=receipt_number,
        type="salary_draw",
        created_by=created_by,
    )
    db.add(expense)
    await db.flush()

    return expense
