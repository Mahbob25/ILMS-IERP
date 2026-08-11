from decimal import Decimal
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.service import (
    get_course_section,
    get_student as get_academic_student,
)
from app.modules.academic.models import CourseSection as CourseSectionModel
from app.modules.lms.models import (
    SectionContract,
    CompensationAmendmentRequest,
    AmendmentStatus,
    CompensationModel,
    TeacherWallet,
    ContractStatus,
)
from app.modules.lms.schemas import (
    AttendanceSessionCreate,
    AttendanceSessionResponse,
    AttendanceRecordResponse,
    AttendanceSubmit,
    StudentAttendanceSummary,
    PaymentCreate,
    PaymentResponse,
    TeacherWalletResponse,
    ExpenseCreate,
    ExpenseResponse,
    VoidExpenseRequest,
    EligibleRecipientResponse,
    DailyClosureResponse,
    DailyLedgerResponse,
    RevenueOverviewResponse,
    SectionContractResponse,
    ContractAssignRequest,
    AmendmentCreateRequest,
    AmendmentResponse,
    AmendmentApproveRequest,
    AmendmentRejectRequest,
    AmendmentPendingItem,
    WalletDetailResponse,
    FinancialRecordListResponse,
)
from app.modules.lms import service as lms_service
from app.modules.lms import financial_service
from app.modules.lms import voucher_service
from app.modules.lms import closure_service
from app.modules.lms import ledger_service as lms_ledger
from app.modules.lms import compensation_service
from app.modules.lms import cashier_service
from app.modules.lms import financial_records_service
from app.core.error_messages import get_error_detail
from app.core.rate_limit import limiter
from app.modules.notifications.emitters import emit_amendment_pending
from app.modules.notifications.emitters import _user_ids_by_role
from app.modules.notifications.service import resolve_for_user
import logging

logger = logging.getLogger(__name__)

lms_router = APIRouter(prefix="/lms", tags=["lms"])


async def _resolve_amendment_notifications(
    db: AsyncSession, amendment_id: uuid.UUID, new_type: str
) -> None:
    """After approve/reject, change amendment_pending notifications to new_type for all recipients."""
    dedupe_key = f"amendment_pending:{amendment_id}"
    user_ids = await _user_ids_by_role(db, "manager", "superadmin")
    for uid in user_ids:
        try:
            await resolve_for_user(
                db, user_id=uid, dedupe_key=dedupe_key,
                old_type="amendment_pending", new_type=new_type,
            )
        except Exception:
            logger.exception("Failed to resolve amendment notification type")


async def _resolve_unlock_notifications(
    db: AsyncSession, closure_date: date, new_type: str
) -> None:
    dedupe_key = f"unlock_requested:{closure_date.isoformat()}"
    user_ids = await _user_ids_by_role(db, "manager")
    for uid in user_ids:
        try:
            await resolve_for_user(
                db, user_id=uid, dedupe_key=dedupe_key,
                old_type="unlock_requested", new_type=new_type,
            )
        except Exception:
            logger.exception("Failed to resolve unlock notification type")


# --- Attendance ---
@lms_router.post(
    "/attendance/sessions",
    response_model=AttendanceSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_attendance_session(
    data: AttendanceSessionCreate,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    section = await get_course_section(db, data.section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    if section.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create attendance for a section that is not active",
        )
    if section.teacher_id != current_user.employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your section"
        )
    return await lms_service.create_attendance_session(
        db, data.section_id, data.date, current_user.id
    )


@lms_router.get("/attendance/sessions", response_model=list[AttendanceSessionResponse])
async def list_attendance_sessions(
    section_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.name == "teacher":
        if section_id:
            section = await get_course_section(db, section_id)
            if not section or section.teacher_id != current_user.employee_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Not your section"
                )
    return await lms_service.list_attendance_sessions(db, section_id=section_id)


@lms_router.get(
    "/attendance/sessions/{session_id}", response_model=AttendanceSessionResponse
)
async def get_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session


@lms_router.post(
    "/attendance/sessions/{session_id}/records",
    response_model=list[AttendanceRecordResponse],
)
async def submit_attendance(
    session_id: uuid.UUID,
    data: AttendanceSubmit,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    if session.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your session"
        )
    records_data = [r.model_dump() for r in data.records]
    return await lms_service.set_attendance_records(db, session_id, records_data)


@lms_router.get(
    "/attendance/students/{student_id}/summary",
    response_model=list[StudentAttendanceSummary],
)
async def get_student_attendance_summary(
    student_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await lms_service.get_student_attendance_summary(db, student_id)


# --- Payments ---
@lms_router.post(
    "/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def create_payment(
    request: Request,
    data: PaymentCreate,
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    payment_date = date.fromisoformat(data.date) if data.date else date.today()
    if await closure_service.is_date_closed(db, payment_date):

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_is_closed", locale),
        )
    payment = await financial_service.create_payment(
        db,
        data.enrollment_id,
        data.amount,
        current_user.id,
        payment_date,
        payment_method=data.payment_method,
        transaction_number=data.transaction_number,
        locale=locale,
    )
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found"
        )
    return payment


@lms_router.get("/payments", response_model=list[PaymentResponse])
async def list_payments(
    enrollment_id: Optional[uuid.UUID] = None,
    student_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    receipt_number: Optional[str] = None,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await financial_service.list_payments(
        db, enrollment_id, student_id, date_from, date_to, receipt_number
    )


# --- Financial Records Center ---
@lms_router.get(
    "/financial-records", response_model=FinancialRecordListResponse
)
@limiter.limit("60/minute")
async def list_financial_records(
    request: Request,
    doc_type: Optional[str] = Query(None, regex="^(receipt|voucher|refund)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await financial_records_service.search_financial_records(
        db,
        doc_type=doc_type,
        date_from=date_from,
        date_to=date_to,
        search=search,
        name=name,
        limit=limit,
        offset=offset,
    )


@lms_router.get("/payments/summary/{enrollment_id}")
async def get_payment_summary(
    enrollment_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await financial_service.get_student_payment_summary(db, enrollment_id)


@lms_router.get("/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    payment = await financial_service.get_payment(db, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found"
        )
    return payment


@lms_router.get("/payments/{payment_id}/preview")
async def preview_receipt(
    payment_id: uuid.UUID,
    locale: str = "ar",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    html = await voucher_service.get_receipt_html_content(db, payment_id, locale)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )
    from fastapi.responses import HTMLResponse

    return HTMLResponse(content=html)


# --- Revenue Overview ---
@lms_router.get("/revenue", response_model=RevenueOverviewResponse)
async def get_revenue_overview(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await financial_service.get_revenue_overview(db, start_date, end_date)


# --- Teacher Wallets ---
@lms_router.get("/teacher-wallets/{employee_id}", response_model=TeacherWalletResponse)
async def get_teacher_wallet(
    employee_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    wallet = await financial_service.get_teacher_wallet(db, employee_id)
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher wallet not found"
        )
    return wallet


@lms_router.get(
    "/teacher-wallets/{employee_id}/withdrawals", response_model=list[ExpenseResponse]
)
async def get_teacher_withdrawals(
    employee_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    if (
        current_user.role
        and current_user.role.name == "teacher"
        and current_user.employee_id != employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view other teachers' withdrawals",
        )
    return await financial_service.get_teacher_withdrawals(db, employee_id)


# --- Expenses ---
@lms_router.get(
    "/expenses/eligible-recipients", response_model=list[EligibleRecipientResponse]
)
async def list_eligible_recipients(
    type: str,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    if type not in ("teacher_withdrawal", "salary_draw"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid recipient type"
        )
    return await financial_service.get_eligible_recipients(db, type)


@lms_router.post(
    "/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def create_expense(
    request: Request,
    data: ExpenseCreate,
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    expense_date = date.fromisoformat(data.date) if data.date else date.today()
    if await closure_service.is_date_closed(db, expense_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_is_closed", locale),
        )
    try:
        expense = await financial_service.create_expense(
            db,
            amount=data.amount,
            created_by=current_user.id,
            recipient_name=data.recipient_name,
            recipient_id=data.recipient_id,
            expense_type=data.type,
            description=data.description,
            expense_date=expense_date,
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
    receipt_number: Optional[str] = None,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await financial_service.list_expenses(
        db,
        expense_type=type,
        date_from=date_from,
        date_to=date_to,
        recipient_name=recipient_name,
        receipt_number=receipt_number,
    )


@lms_router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    expense = await financial_service.get_expense(db, expense_id)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )
    return expense


@lms_router.post("/expenses/{expense_id}/void", response_model=ExpenseResponse)
@limiter.limit("10/minute")
async def void_expense(
    request: Request,
    expense_id: uuid.UUID,
    data: VoidExpenseRequest,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    try:
        expense = await financial_service.void_expense(
            db,
            expense_id=expense_id,
            void_reason=data.void_reason,
            voided_by=current_user.id,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
        if "expired" in detail.lower() or "window" in detail.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

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
        "created_by_name": "",
        "voided_at": expense.voided_at,
        "voided_by": expense.voided_by,
        "void_reason": expense.void_reason,
    }


@lms_router.get("/expenses/{expense_id}/preview")
async def preview_voucher(
    expense_id: uuid.UUID,
    locale: str = "ar",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    html = await voucher_service.get_voucher_html_content(db, expense_id, locale)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found"
        )
    from fastapi.responses import HTMLResponse

    return HTMLResponse(content=html)


# --- Daily Closures ---
@lms_router.post(
    "/daily-closures/{closure_date}/close", response_model=DailyClosureResponse
)
@limiter.limit("10/minute")
async def close_day(
    request: Request,
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    closure = await closure_service.close_day(db, closure_date, current_user.id)
    if not closure:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_already_closed", locale),
        )
    return closure


@lms_router.post(
    "/daily-closures/{closure_date}/unlock-request", response_model=DailyClosureResponse
)
@limiter.limit("10/minute")
async def request_unlock(
    request: Request,
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    closure = await closure_service.request_unlock(db, closure_date)
    if not closure:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_not_closed_or_already_unlocked", locale),
        )
    return closure


@lms_router.post(
    "/daily-closures/{closure_date}/approve-unlock", response_model=DailyClosureResponse
)
@limiter.limit("10/minute")
async def approve_unlock(
    request: Request,
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    closure = await closure_service.approve_unlock(db, closure_date, current_user.id)
    if not closure:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("no_unlock_request_pending", locale),
        )
    await _resolve_unlock_notifications(db, closure_date, "unlock_approved")
    return closure


@lms_router.post(
    "/daily-closures/{closure_date}/reject-unlock", response_model=DailyClosureResponse
)
@limiter.limit("10/minute")
async def reject_unlock(
    request: Request,
    closure_date: date,
    locale: str = "ar",
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    closure = await closure_service.reject_unlock(db, closure_date)
    if not closure:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("no_unlock_request_pending", locale),
        )
    await _resolve_unlock_notifications(db, closure_date, "unlock_dismissed")
    return closure


@lms_router.get("/daily-closures", response_model=list[DailyClosureResponse])
async def list_closures(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await closure_service.list_closures(db, date_from=date_from, date_to=date_to)


@lms_router.get(
    "/daily-closures/{closure_date}/ledger", response_model=DailyLedgerResponse
)
async def get_daily_ledger(
    closure_date: date,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await closure_service.get_daily_ledger(db, closure_date)


# --- Section Contracts ---
@lms_router.get(
    "/sections/{section_id}/contract", response_model=SectionContractResponse
)
async def get_section_contract(
    section_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SectionContract)
        .options(
            joinedload(SectionContract.section).joinedload(CourseSectionModel.course)
        )
        .where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found"
        )
    section_data = None
    if contract.section:
        section_data = {
            "id": contract.section.id,
            "name": str(contract.section.id),
            "course_name": "",
        }
    return SectionContractResponse(
        id=contract.id,
        section_id=contract.section_id,
        teacher_id=contract.teacher_id,
        compensation_model=(
            contract.compensation_model.value if contract.compensation_model else None
        ),
        fixed_amount=float(contract.fixed_amount) if contract.fixed_amount else None,
        percentage=float(contract.percentage) if contract.percentage else None,
        holdback_rate=float(contract.holdback_rate),
        status=contract.status.value,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        section=section_data,
    )


@lms_router.put(
    "/sections/{section_id}/contract/assign", response_model=SectionContractResponse
)
@limiter.limit("10/minute")
async def assign_section_contract(
    request: Request,
    section_id: uuid.UUID,
    data: ContractAssignRequest,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    section = await get_course_section(db, section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    comp_model = data.compensation_model.lower()
    if comp_model not in ("fixed", "percentage"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="compensation_model must be 'fixed' or 'percentage'",
        )

    model_enum = (
        CompensationModel.FIXED
        if comp_model == "fixed"
        else CompensationModel.PERCENTAGE
    )
    try:
        contract = await lms_ledger.assign_contract(
            db=db,
            section_id=section_id,
            teacher_id=data.teacher_id,
            compensation_model=model_enum,
            fixed_amount=(
                Decimal(str(data.fixed_amount))
                if data.fixed_amount is not None
                else None
            ),
            percentage=(
                Decimal(str(data.percentage)) if data.percentage is not None else None
            ),
            holdback_rate=(
                Decimal(str(data.holdback_rate))
                if data.holdback_rate is not None
                else None
            ),
        )
        await db.refresh(contract, ["section"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    section_data = None
    if contract.section:
        section_data = {
            "id": contract.section.id,
            "name": str(contract.section.id),
            "course_name": "",
        }
    return SectionContractResponse(
        id=contract.id,
        section_id=contract.section_id,
        teacher_id=contract.teacher_id,
        compensation_model=(
            contract.compensation_model.value if contract.compensation_model else None
        ),
        fixed_amount=float(contract.fixed_amount) if contract.fixed_amount else None,
        percentage=float(contract.percentage) if contract.percentage else None,
        holdback_rate=float(contract.holdback_rate),
        status=contract.status.value,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        section=section_data,
    )


@lms_router.post(
    "/sections/{section_id}/contract/activate", response_model=SectionContractResponse
)
@limiter.limit("10/minute")
async def activate_section_contract(
    request: Request,
    section_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No contract assigned to this section. Assign a contract before activating.",
        )
    try:
        contract = await lms_ledger.activate_contract(db, contract.id, current_user.id)
        await db.refresh(contract, ["section"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    section_data = None
    if contract.section:
        section_data = {
            "id": contract.section.id,
            "name": str(contract.section.id),
            "course_name": "",
        }
    return SectionContractResponse(
        id=contract.id,
        section_id=contract.section_id,
        teacher_id=contract.teacher_id,
        compensation_model=(
            contract.compensation_model.value if contract.compensation_model else None
        ),
        fixed_amount=float(contract.fixed_amount) if contract.fixed_amount else None,
        percentage=float(contract.percentage) if contract.percentage else None,
        holdback_rate=float(contract.holdback_rate),
        status=contract.status.value,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        section=section_data,
    )


@lms_router.post(
    "/sections/{section_id}/contract/complete", response_model=SectionContractResponse
)
@limiter.limit("10/minute")
async def complete_section_contract(
    request: Request,
    section_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found"
        )
    try:
        if contract.status == ContractStatus.ACTIVE:
            contract = await lms_ledger.finalize_grades_for_section(
                db, contract.section_id
            )
        contract = await lms_ledger.settle_contract(db, contract.id, current_user.id)
        await db.refresh(contract, ["section"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    section_data = None
    if contract.section:
        section_data = {
            "id": contract.section.id,
            "name": str(contract.section.id),
            "course_name": "",
        }
    return SectionContractResponse(
        id=contract.id,
        section_id=contract.section_id,
        teacher_id=contract.teacher_id,
        compensation_model=(
            contract.compensation_model.value if contract.compensation_model else None
        ),
        fixed_amount=float(contract.fixed_amount) if contract.fixed_amount else None,
        percentage=float(contract.percentage) if contract.percentage else None,
        holdback_rate=float(contract.holdback_rate),
        status=contract.status.value,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        section=section_data,
    )


# --- Compensation Amendments ---
@lms_router.post(
    "/sections/{section_id}/contract/amend", response_model=AmendmentResponse
)
@limiter.limit("10/minute")
async def create_amendment(
    request: Request,
    section_id: uuid.UUID,
    data: AmendmentCreateRequest,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No contract assigned to this section. Assign a contract before requesting an increase.",
        )
    if (
        current_user.role.name == "teacher"
        and contract.teacher_id != current_user.employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your contract"
        )

    if contract.compensation_model and contract.compensation_model.value == "fixed":
        requested_fixed = Decimal(str(data.requested_amount))
        requested_pct = None
    elif (
        contract.compensation_model
        and contract.compensation_model.value == "percentage"
    ):
        requested_fixed = None
        requested_pct = Decimal(str(data.requested_amount))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract has no compensation model",
        )
    requested_by = current_user.employee_id or contract.teacher_id
    if not requested_by:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot identify requester",
        )
    try:
        amendment = await compensation_service.create_amendment(
            db=db,
            contract_id=contract.id,
            requested_fixed_amount=requested_fixed,
            requested_percentage=requested_pct,
            reason=data.reason,
            requested_by=requested_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        await emit_amendment_pending(
            db,
            amendment_id=amendment.id,
            section_id=section_id,
        )
    except Exception:
        logger.exception("Failed to emit amendment_pending notification")
    return AmendmentResponse(
        id=amendment.id,
        contract_id=amendment.contract_id,
        previous_fixed_amount=(
            float(amendment.previous_fixed_amount)
            if amendment.previous_fixed_amount
            else None
        ),
        requested_fixed_amount=(
            float(amendment.requested_fixed_amount)
            if amendment.requested_fixed_amount
            else None
        ),
        previous_percentage=(
            float(amendment.previous_percentage)
            if amendment.previous_percentage
            else None
        ),
        requested_percentage=(
            float(amendment.requested_percentage)
            if amendment.requested_percentage
            else None
        ),
        reason=amendment.reason,
        requested_by=amendment.requested_by,
        requested_at=amendment.requested_at,
        status=amendment.status.value,
        reviewed_by=amendment.reviewed_by,
        reviewed_at=amendment.reviewed_at,
        review_notes=amendment.review_notes,
    )


@lms_router.get("/amendments/pending", response_model=list[AmendmentPendingItem])
async def list_pending_amendments(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CompensationAmendmentRequest)
        .options(
            joinedload(CompensationAmendmentRequest.contract)
            .joinedload(SectionContract.section)
            .joinedload(CourseSectionModel.course),
            joinedload(CompensationAmendmentRequest.requestor),
        )
        .where(CompensationAmendmentRequest.status == AmendmentStatus.PENDING)
        .order_by(CompensationAmendmentRequest.requested_at)
    )
    amendments = result.scalars().all()
    items = []
    for am in amendments:
        contract = am.contract
        section = contract.section if contract else None
        course = section.course if section else None
        requestor = am.requestor
        teacher_name = requestor.full_name if requestor else ""
        comp_model = (
            contract.compensation_model.value
            if contract and contract.compensation_model
            else None
        )
        if comp_model == "fixed":
            current_amount = (
                float(contract.fixed_amount)
                if contract and contract.fixed_amount
                else None
            )
            requested_amount = (
                float(am.requested_fixed_amount) if am.requested_fixed_amount else None
            )
        else:
            current_amount = (
                float(contract.percentage) if contract and contract.percentage else None
            )
            requested_amount = (
                float(am.requested_percentage) if am.requested_percentage else None
            )
        items.append(
            AmendmentPendingItem(
                id=am.id,
                contract_id=am.contract_id,
                section_name=str(section.id) if section else "",
                course_name=course.name if course else "",
                teacher_name=teacher_name,
                compensation_model=comp_model,
                current_amount=current_amount,
                requested_amount=requested_amount,
                reason=am.reason,
                requested_by_name=teacher_name,
                requested_at=am.requested_at,
            )
        )
    return items


@lms_router.put("/amendments/{amendment_id}/approve", response_model=AmendmentResponse)
@limiter.limit("10/minute")
async def approve_amendment(
    request: Request,
    amendment_id: uuid.UUID,
    data: AmendmentApproveRequest = AmendmentApproveRequest(),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        amendment = await compensation_service.approve_amendment(
            db, amendment_id, current_user.employee_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await _resolve_amendment_notifications(db, amendment_id, "amendment_approved")
    return AmendmentResponse(
        id=amendment.id,
        contract_id=amendment.contract_id,
        previous_fixed_amount=(
            float(amendment.previous_fixed_amount)
            if amendment.previous_fixed_amount
            else None
        ),
        requested_fixed_amount=(
            float(amendment.requested_fixed_amount)
            if amendment.requested_fixed_amount
            else None
        ),
        previous_percentage=(
            float(amendment.previous_percentage)
            if amendment.previous_percentage
            else None
        ),
        requested_percentage=(
            float(amendment.requested_percentage)
            if amendment.requested_percentage
            else None
        ),
        reason=amendment.reason,
        requested_by=amendment.requested_by,
        requested_at=amendment.requested_at,
        status=amendment.status.value,
        reviewed_by=amendment.reviewed_by,
        reviewed_at=amendment.reviewed_at,
        review_notes=data.review_notes or amendment.review_notes,
    )


@lms_router.put("/amendments/{amendment_id}/reject", response_model=AmendmentResponse)
@limiter.limit("10/minute")
async def reject_amendment(
    request: Request,
    amendment_id: uuid.UUID,
    data: AmendmentRejectRequest = AmendmentRejectRequest(),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        amendment = await compensation_service.reject_amendment(
            db, amendment_id, current_user.employee_id, review_notes=data.review_notes
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await _resolve_amendment_notifications(db, amendment_id, "amendment_rejected")
    return AmendmentResponse(
        id=amendment.id,
        contract_id=amendment.contract_id,
        previous_fixed_amount=(
            float(amendment.previous_fixed_amount)
            if amendment.previous_fixed_amount
            else None
        ),
        requested_fixed_amount=(
            float(amendment.requested_fixed_amount)
            if amendment.requested_fixed_amount
            else None
        ),
        previous_percentage=(
            float(amendment.previous_percentage)
            if amendment.previous_percentage
            else None
        ),
        requested_percentage=(
            float(amendment.requested_percentage)
            if amendment.requested_percentage
            else None
        ),
        reason=amendment.reason,
        requested_by=amendment.requested_by,
        requested_at=amendment.requested_at,
        status=amendment.status.value,
        reviewed_by=amendment.reviewed_by,
        reviewed_at=amendment.reviewed_at,
        review_notes=amendment.review_notes,
    )


# --- Wallet Detail ---
@lms_router.get(
    "/teacher-wallets/{teacher_id}/detail", response_model=WalletDetailResponse
)
async def get_wallet_detail(
    teacher_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (
        current_user.role
        and current_user.role.name == "teacher"
        and current_user.employee_id != teacher_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view other teachers' wallet",
        )
    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher wallet not found"
        )
    summary = await lms_ledger.get_wallet_summary(db, wallet.id)
    return summary


# --- Cashier / Refund Disbursement ---
@lms_router.get("/cashier/pending-refunds")
async def list_pending_refunds(
    status: str = "UNCLAIMED",
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await cashier_service.get_pending_refunds_queue(
        db, status=status, page=page, per_page=per_page, search=search, source=source
    )


@lms_router.get("/students/{student_id}/pending-refunds")
async def get_student_refunds(
    student_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    student = await get_academic_student(db, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )

    from app.modules.academic.cancellation_service import get_student_pending_refunds

    refunds = await get_student_pending_refunds(db, student_id)
    return [
        {
            "id": r.id,
            "enrollment_id": r.enrollment_id,
            "section_cancellation_id": r.section_cancellation_id,
            "unenrollment_record_id": r.unenrollment_record_id,
            "amount": float(r.amount),
            "status": r.status,
            "source": r.source,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        }
        for r in refunds
    ]


@lms_router.post("/cashier/pending-refunds/{pending_refund_id}/disburse")
@limiter.limit("10/minute")
async def disburse_refund(
    request: Request,
    pending_refund_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    notes = body.get("notes")

    try:
        refund = await cashier_service.disburse_pending_refund(
            db,
            pending_refund_id=pending_refund_id,
            disbursed_by=current_user.id,
            notes=notes,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    return {
        "success": True,
        "receipt_number": refund.receipt_number,
        "refund_id": str(refund.id),
    }


@lms_router.get("/cashier/refunds")
async def get_refund_history(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    per_page: int = 20,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await cashier_service.get_cashier_refund_history(
        db,
        cashier_id=current_user.id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )


@lms_router.post("/cashier/refunds/{refund_id}/undo")
@limiter.limit("10/minute")
async def undo_refund_disbursement(
    request: Request,
    refund_id: uuid.UUID,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    try:
        pending_refund = await cashier_service.undo_refund(
            db,
            refund_id=refund_id,
            undone_by=current_user.id,
        )
    except ValueError as e:
        detail = str(e)
        if "not found" in detail.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
        if "expired" in detail.lower() or "window" in detail.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    return {"success": True, "pending_refund_id": str(pending_refund.id), "status": pending_refund.status}


# --- Phase 7: Admin Audit Views ---
@lms_router.get("/admin/audit/refunds")
async def list_admin_refunds(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
):
    return await cashier_service.get_cashier_refund_history(
        db,
        cashier_id=None,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )


# --- Refund Voucher Preview ---
@lms_router.get("/cashier/refunds/{refund_id}/preview")
async def preview_refund_voucher(
    refund_id: uuid.UUID,
    locale: str = Query("ar", regex="^(ar|en)$"),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    html = await voucher_service.get_refund_voucher_html_content(
        db, refund_id, locale=locale
    )
    if not html:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Refund not found"
        )
    from fastapi.responses import HTMLResponse

    return HTMLResponse(content=html)
