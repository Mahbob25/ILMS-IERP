import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.modules.identity.models import Employee, User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.lms import staff_payroll_service
from app.modules.lms.closure_service import is_date_closed
from app.modules.lms.models import Expense
from app.core.error_messages import get_error_detail
from app.core.rate_limit import limiter

router = APIRouter(prefix="/staff-payroll", tags=["Staff Payroll"])


class StaffPayrollMember(BaseModel):
    id: str
    full_name: str
    role: str
    monthly_salary: float
    total_drawn_this_month: float
    remaining_balance: float


class WithdrawRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Withdrawal amount")
    description: Optional[str] = None
    date: Optional[str] = None


class WithdrawResponse(BaseModel):
    id: str
    receipt_number: str
    amount: float
    recipient_name: str
    date: date
    remaining_balance: float


@router.get("", response_model=list[StaffPayrollMember])
async def list_staff_payroll(
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await staff_payroll_service.list_staff_for_payroll(db)


@router.post("/{employee_id}/withdraw", response_model=WithdrawResponse)
@limiter.limit("10/minute")
async def process_withdrawal(
    request: Request,
    employee_id: uuid.UUID,
    data: WithdrawRequest,
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager"])
    ),
    db: AsyncSession = Depends(get_db),
):
    withdrawal_date = date.fromisoformat(data.date) if data.date else date.today()

    if await is_date_closed(db, withdrawal_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_is_closed", locale),
        )

    try:
        expense = await staff_payroll_service.process_salary_withdrawal(
            db,
            employee_id=employee_id,
            amount=data.amount,
            created_by=current_user.id,
            description=data.description,
            withdrawal_date=withdrawal_date,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    month_start = withdrawal_date.replace(day=1)
    total_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.type == "salary_draw",
            Expense.recipient_id == employee_id,
            Expense.date >= month_start,
            Expense.date <= withdrawal_date,
            Expense.voided_at.is_(None),
        )
    )
    total_drawn = float(total_result.scalar() or 0)
    employee_result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = employee_result.scalar_one_or_none()
    remaining = float(employee.default_salary or 0) - total_drawn

    return {
        "id": str(expense.id),
        "receipt_number": expense.receipt_number,
        "amount": float(expense.amount),
        "recipient_name": expense.recipient_name,
        "date": expense.date,
        "remaining_balance": remaining,
    }
