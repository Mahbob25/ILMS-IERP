from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import RoleChecker, PermissionChecker
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

reports_router = APIRouter(prefix="/reports", tags=["reports"])


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