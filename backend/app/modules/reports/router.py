from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import (
    RoleChecker,
    PermissionChecker,
    get_current_user,
)
from app.modules.reports.schemas import (
    ReportCatalogResponse,
    PnlReportResponse,
    LedgerReportResponse,
    ClosuresRegisterItem,
    DailyReconciliationReportResponse,
    StudentRegisterResponse,
    EnrollmentSummaryResponse,
    SectionOccupancyResponse,
    AttendanceSummaryResponse,
    TeacherWalletsResponse,
    TeacherPayoutsResponse,
    PayrollRegisterResponse,
    GradeSummaryResponse,
)
from app.modules.reports import service as reports_service
from app.modules.reports.export import csv_download_response, print_html_response

reports_router = APIRouter(prefix="/reports", tags=["reports"])

# Roles allowed per report code — mirrors the per-endpoint gates below so the
# export/print endpoints enforce the same access rules as the JSON endpoints.
_ROLE_GATES: dict[str, list[str]] = {
    "pnl_summary": ["superadmin", "manager"],
    "daily_ledger": ["superadmin", "manager", "accountant"],
    "closures_register": ["superadmin", "manager"],
    "daily_reconciliation": ["superadmin", "manager"],
    "student_register": ["superadmin", "manager", "secretary"],
    "enrollment_summary": ["superadmin", "manager", "secretary"],
    "section_occupancy": ["superadmin", "manager", "secretary"],
    "attendance_summary": ["superadmin", "manager", "secretary"],
    "teacher_wallets": ["superadmin", "manager"],
    "teacher_payouts": ["superadmin", "manager"],
    "staff_payroll": ["superadmin", "manager", "secretary"],
    "grade_summary": ["superadmin", "manager", "teacher"],
}


def _ensure_known_code(code: str) -> None:
    if code not in _ROLE_GATES:
        raise HTTPException(status_code=404, detail=f"Unknown report code: {code}")


async def _report_role_gate(
    code: str,
    current_user: User = Depends(get_current_user),
) -> User:
    """Per-code RBAC gate shared by the export/print endpoints."""
    allowed = _ROLE_GATES.get(code)
    if allowed is None:
        raise HTTPException(status_code=404, detail=f"Unknown report code: {code}")
    if current_user.role.name == "superadmin":
        return current_user
    if current_user.role.name not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Requires one of roles {allowed}",
        )
    return current_user


async def _fetch_report(
    code: str,
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ledger_date: Optional[date] = None,
    report_date: Optional[date] = None,
    month: Optional[date] = None,
    status: Optional[str] = None,
    teacher_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
):
    """Route an export/print request to the matching service function."""
    if code == "pnl_summary":
        return await reports_service.get_pnl_report(db, start_date, end_date)
    if code == "daily_ledger":
        return await reports_service.get_daily_ledger_report(db, ledger_date)
    if code == "closures_register":
        return await reports_service.get_closures_register(db, date_from=start_date, date_to=end_date)
    if code == "daily_reconciliation":
        return await reports_service.get_daily_reconciliation_report(db, report_date)
    if code == "student_register":
        return await reports_service.get_student_register(db, status=status)
    if code == "enrollment_summary":
        return await reports_service.get_enrollment_summary(db, start_date, end_date)
    if code == "section_occupancy":
        return await reports_service.get_section_occupancy(db)
    if code == "attendance_summary":
        return await reports_service.get_attendance_summary(db, start_date, end_date, teacher_id)
    if code == "teacher_wallets":
        return await reports_service.get_teacher_wallets(db)
    if code == "teacher_payouts":
        return await reports_service.get_teacher_payouts(db, start_date, end_date)
    if code == "staff_payroll":
        return await reports_service.get_staff_payroll_report(db, month=month)
    if code == "grade_summary":
        return await reports_service.get_grade_summary(db, section_id=section_id)
    raise HTTPException(status_code=404, detail=f"Unknown report code: {code}")


@reports_router.get("/{code}/export.csv")
async def export_report_csv(
    code: str,
    locale: str = Query(default="en", pattern="^(ar|en)$"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    ledger_date: Optional[date] = Query(default=None),
    report_date: Optional[date] = Query(default=None),
    month: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None),
    teacher_id: Optional[UUID] = Query(default=None),
    section_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(_report_role_gate),
    db: AsyncSession = Depends(get_db),
):
    """Download a report as CSV (headers localized via `locale`)."""
    _ensure_known_code(code)
    payload = await _fetch_report(
        code, db, start_date, end_date, ledger_date, report_date, month,
        status, teacher_id, section_id,
    )
    return csv_download_response(code, payload, locale=locale)


@reports_router.get("/{code}/print", response_class=HTMLResponse)
async def export_report_print(
    code: str,
    locale: str = Query(default="ar", pattern="^(ar|en)$"),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    ledger_date: Optional[date] = Query(default=None),
    report_date: Optional[date] = Query(default=None),
    month: Optional[date] = Query(default=None),
    status: Optional[str] = Query(default=None),
    teacher_id: Optional[UUID] = Query(default=None),
    section_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(_report_role_gate),
    db: AsyncSession = Depends(get_db),
):
    """Render a print-ready HTML document (for browser print / PDF save)."""
    _ensure_known_code(code)
    payload = await _fetch_report(
        code, db, start_date, end_date, ledger_date, report_date, month,
        status, teacher_id, section_id,
    )
    return print_html_response(code, payload, locale=locale)


@reports_router.get("/catalog", response_model=ReportCatalogResponse)
async def get_report_catalog(
    current_user: User = Depends(PermissionChecker("page_reports")),
) -> ReportCatalogResponse:
    return await reports_service.list_report_catalog()


# --- A. Financial reports ---


@reports_router.get("/financial/pnl", response_model=PnlReportResponse)
async def get_pnl_report(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_pnl_report(db, start_date, end_date)


@reports_router.get("/financial/ledger/{ledger_date}", response_model=LedgerReportResponse)
async def get_daily_ledger_report(
    ledger_date: date,
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "accountant"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_daily_ledger_report(db, ledger_date)


@reports_router.get("/financial/closures", response_model=list[ClosuresRegisterItem])
async def get_closures_register(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_closures_register(db, date_from=date_from, date_to=date_to)


@reports_router.get(
    "/financial/reconciliation/{report_date}",
    response_model=DailyReconciliationReportResponse,
)
async def get_daily_reconciliation_report(
    report_date: date,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_daily_reconciliation_report(db, report_date)


# --- B. Operational reports ---


@reports_router.get("/students", response_model=StudentRegisterResponse)
async def get_student_register_report(
    status: Optional[str] = Query(default=None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_student_register(db, status=status)


@reports_router.get("/enrollments", response_model=EnrollmentSummaryResponse)
async def get_enrollment_summary_report(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_enrollment_summary(db, start_date, end_date)


@reports_router.get("/sections/occupancy", response_model=SectionOccupancyResponse)
async def get_section_occupancy_report(
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_section_occupancy(db)


@reports_router.get("/attendance", response_model=AttendanceSummaryResponse)
async def get_attendance_summary_report(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    teacher_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_attendance_summary(
        db, start_date, end_date, teacher_id
    )


# --- C. Teacher / HR reports ---


@reports_router.get("/teachers/wallets", response_model=TeacherWalletsResponse)
async def get_teacher_wallets_report(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_teacher_wallets(db)


@reports_router.get("/teachers/payouts", response_model=TeacherPayoutsResponse)
async def get_teacher_payouts_report(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_teacher_payouts(db, start_date, end_date)


@reports_router.get("/payroll", response_model=PayrollRegisterResponse)
async def get_payroll_register_report(
    month: Optional[date] = Query(default=None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_staff_payroll_report(db, month=month)


@reports_router.get("/grades", response_model=GradeSummaryResponse)
async def get_grade_summary_report(
    section_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "teacher"])
    ),
    db: AsyncSession = Depends(get_db),
):
    return await reports_service.get_grade_summary(db, section_id=section_id)