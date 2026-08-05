from datetime import date
from typing import Optional

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