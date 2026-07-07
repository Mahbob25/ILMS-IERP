import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.service import get_course_section
from app.modules.lms.schemas import (
    AttendanceSessionCreate, AttendanceSessionResponse,
    AttendanceRecordResponse, AttendanceSubmit,
    PaymentCreate, PaymentResponse,
    TeacherWalletResponse,
    ExpenseCreate, ExpenseResponse, EligibleRecipientResponse,
    DailyClosureResponse, DailyLedgerResponse,
    RevenueOverviewResponse,
)
from app.modules.lms import service as lms_service
from app.modules.lms import financial_service
from app.core.error_messages import get_error_detail

lms_router = APIRouter(prefix="/lms", tags=["lms"])


# --- Attendance ---
@lms_router.post("/attendance/sessions", response_model=AttendanceSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_attendance_session(
    data: AttendanceSessionCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    section = await get_course_section(db, data.section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if current_user.role.name == "teacher" and section.teacher_id != current_user.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your section")
    return await lms_service.create_attendance_session(db, data.section_id, data.date, current_user.id)

@lms_router.get("/attendance/sessions", response_model=list[AttendanceSessionResponse])
async def list_attendance_sessions(
    section_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name == "teacher":
        if section_id:
            section = await get_course_section(db, section_id)
            if not section or section.teacher_id != current_user.employee_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your section")
    return await lms_service.list_attendance_sessions(db, section_id=section_id)

@lms_router.get("/attendance/sessions/{session_id}", response_model=AttendanceSessionResponse)
async def get_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session

@lms_router.post("/attendance/sessions/{session_id}/records", response_model=list[AttendanceRecordResponse])
async def submit_attendance(
    session_id: uuid.UUID,
    data: AttendanceSubmit,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if current_user.role.name == "teacher" and session.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your session")
    records_data = [r.model_dump() for r in data.records]
    return await lms_service.set_attendance_records(db, session_id, records_data)


# --- Payments ---
@lms_router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    data: PaymentCreate,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    payment_date = date.fromisoformat(data.date) if data.date else date.today()
    if await financial_service.is_date_closed(db, payment_date):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=get_error_detail("date_is_closed", locale))
    payment = await financial_service.create_payment(
        db, data.enrollment_id, data.amount, current_user.id, payment_date,
        payment_method=data.payment_method,
        transaction_number=data.transaction_number,
        locale=locale,
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
    return payment

@lms_router.get("/payments", response_model=list[PaymentResponse])
async def list_payments(
    enrollment_id: Optional[uuid.UUID] = None,
    student_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.list_payments(db, enrollment_id, student_id, date_from, date_to)

@lms_router.get("/payments/summary/{enrollment_id}")
async def get_payment_summary(
    enrollment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.get_student_payment_summary(db, enrollment_id)

@lms_router.get("/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    payment = await financial_service.get_payment(db, payment_id)
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@lms_router.get("/payments/{payment_id}/preview")
async def preview_receipt(
    payment_id: uuid.UUID,
    locale: str = "ar",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    html = await financial_service.get_receipt_html_content(db, payment_id, locale)
    if not html:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


# --- Revenue Overview ---
@lms_router.get("/revenue", response_model=RevenueOverviewResponse)
async def get_revenue_overview(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.get_revenue_overview(db, start_date, end_date)


# --- Teacher Wallets ---
@lms_router.get("/teacher-wallets/{employee_id}", response_model=TeacherWalletResponse)
async def get_teacher_wallet(
    employee_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    wallet = await financial_service.get_teacher_wallet(db, employee_id)
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher wallet not found")
    return wallet


@lms_router.get("/teacher-wallets/{employee_id}/withdrawals", response_model=list[ExpenseResponse])
async def get_teacher_withdrawals(
    employee_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role and current_user.role.name == "teacher" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view other teachers' withdrawals")
    return await financial_service.get_teacher_withdrawals(db, employee_id)


# --- Expenses ---
@lms_router.get("/expenses/eligible-recipients", response_model=list[EligibleRecipientResponse])
async def list_eligible_recipients(
    type: str,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    if type not in ("teacher_withdrawal", "secretary_advance"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipient type")
    return await financial_service.get_eligible_recipients(db, type)


@lms_router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    expense_date = date.fromisoformat(data.date) if data.date else date.today()
    if await financial_service.is_date_closed(db, expense_date):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=get_error_detail("date_is_closed", locale))
    try:
        expense = await financial_service.create_expense(
            db, amount=data.amount, created_by=current_user.id,
            recipient_name=data.recipient_name,
            recipient_id=data.recipient_id,
            expense_type=data.type, description=data.description, expense_date=expense_date,
            locale=locale,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return expense


@lms_router.get("/expenses", response_model=list[ExpenseResponse])
async def list_expenses(
    type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    recipient_name: Optional[str] = None,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.list_expenses(db, expense_type=type, date_from=date_from, date_to=date_to, recipient_name=recipient_name)


@lms_router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    expense = await financial_service.get_expense(db, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@lms_router.get("/expenses/{expense_id}/preview")
async def preview_voucher(
    expense_id: uuid.UUID,
    locale: str = "ar",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    html = await financial_service.get_voucher_html_content(db, expense_id, locale)
    if not html:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


# --- Daily Closures ---
@lms_router.post("/daily-closures/{closure_date}/close", response_model=DailyClosureResponse)
async def close_day(
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    closure = await financial_service.close_day(db, closure_date, current_user.id)
    if not closure:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=get_error_detail("date_already_closed", locale))
    return closure


@lms_router.post("/daily-closures/{closure_date}/unlock-request", response_model=DailyClosureResponse)
async def request_unlock(
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    closure = await financial_service.request_unlock(db, closure_date)
    if not closure:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=get_error_detail("date_not_closed_or_already_unlocked", locale))
    return closure


@lms_router.post("/daily-closures/{closure_date}/approve-unlock", response_model=DailyClosureResponse)
async def approve_unlock(
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    closure = await financial_service.approve_unlock(db, closure_date)
    if not closure:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=get_error_detail("no_unlock_request_pending", locale))
    return closure


@lms_router.get("/daily-closures", response_model=list[DailyClosureResponse])
async def list_closures(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.list_closures(db, date_from=date_from, date_to=date_to)


@lms_router.get("/daily-closures/{closure_date}/ledger", response_model=DailyLedgerResponse)
async def get_daily_ledger(
    closure_date: date,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await financial_service.get_daily_ledger(db, closure_date)
