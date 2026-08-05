"""Reports service — one function per report.

Read-only aggregation/reporting layer. Report functions either delegate to
existing services (single source of truth invariant) or run their own
aggregation queries over the ORM models. No writes to the database.
"""

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lms.models import DailyClosure
from app.modules.lms.financial_service import get_revenue_overview
from app.modules.lms.closure_service import get_daily_ledger, list_closures
from app.modules.academic.reconciliation_service import (
    generate_daily_reconciliation_report,
)
from app.modules.reports.schemas import ReportCatalogResponse

# Full report catalog (metadata only — Phase 1 skeleton).
# `inputs` declares which period filters a report accepts:
#   date_range, single_date, single_month, none
REPORT_CATALOG: list[dict] = [
    # A. Financial
    {"path": "financial/pnl", "category": "financial", "code": "pnl_summary", "inputs": ["date_range"]},
    {"path": "financial/ledger/{date}", "category": "financial", "code": "daily_ledger", "inputs": ["single_date"]},
    {"path": "financial/closures", "category": "financial", "code": "closures_register", "inputs": ["date_range"]},
    {"path": "financial/reconciliation/{date}", "category": "financial", "code": "daily_reconciliation", "inputs": ["single_date"]},
    # B. Operational
    {"path": "students", "category": "operational", "code": "student_register", "inputs": []},
    {"path": "enrollments", "category": "operational", "code": "enrollment_summary", "inputs": ["date_range"]},
    {"path": "sections/occupancy", "category": "operational", "code": "section_occupancy", "inputs": []},
    {"path": "attendance", "category": "operational", "code": "attendance_summary", "inputs": ["date_range"]},
    # C. Teacher / HR
    {"path": "teachers/wallets", "category": "teacher_hr", "code": "teacher_wallets", "inputs": []},
    {"path": "teachers/payouts", "category": "teacher_hr", "code": "teacher_payouts", "inputs": ["date_range"]},
    {"path": "payroll", "category": "teacher_hr", "code": "staff_payroll", "inputs": ["single_month"]},
    {"path": "grades", "category": "teacher_hr", "code": "grade_summary", "inputs": []},
]


async def list_report_catalog() -> ReportCatalogResponse:
    """Return the report catalog so the UI picker renders from one source."""
    return ReportCatalogResponse(reports=REPORT_CATALOG)


# --- A. Financial reports ---


async def _get_closure_status_map(
    db: AsyncSession, start_date: Optional[date], end_date: Optional[date]
) -> dict[str, str]:
    """DailyClosure status per date within the range (read-only)."""
    result = await db.execute(
        select(DailyClosure.date, DailyClosure.status).where(
            DailyClosure.date >= start_date,
            DailyClosure.date <= end_date,
        )
    )
    return {row[0].isoformat(): row[1] for row in result.fetchall()}


async def get_pnl_report(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    """A1 — P&L Summary.

    Delegates to `financial_service.get_revenue_overview` and augments the
    daily breakdown with `DailyClosure.status` so managers can see which days
    in the period are partial (unclosed).
    """
    report = await get_revenue_overview(db, start_date, end_date)

    effective_end = end_date or date.today()
    effective_start = start_date or effective_end.replace(day=1)
    status_map = await _get_closure_status_map(db, effective_start, effective_end)

    unclosed_days: list[str] = []
    for item in report["daily_breakdown"]:
        day_status = status_map.get(item["date"])
        item["closure_status"] = day_status
        if day_status != "closed":
            unclosed_days.append(item["date"])

    report["unclosed_days"] = unclosed_days
    return report


async def get_daily_ledger_report(db: AsyncSession, ledger_date: date) -> dict:
    """A2 — Daily Ledger. Pure delegation; closure status already included."""
    return await get_daily_ledger(db, ledger_date)


async def get_closures_register(
    db: AsyncSession,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[dict]:
    """A3 — Closures Register. Pure delegation."""
    return await list_closures(db, date_from=date_from, date_to=date_to)


async def get_daily_reconciliation_report(db: AsyncSession, report_date: date) -> dict:
    """A4 — Daily Reconciliation.

    Delegates to `reconciliation_service` and adds the closure-status caveat
    so managers can see whether the day's refund/operations data is final.
    """
    report = await generate_daily_reconciliation_report(db, report_date)

    status = "pending"
    result = await db.execute(
        select(DailyClosure.status).where(DailyClosure.date == report_date)
    )
    status = result.scalar() or "pending"

    report["closure_status"] = status
    report["is_closed"] = status == "closed"
    return report