"""Reports service — one function per report.

Read-only aggregation/reporting layer. Report functions either delegate to
existing services (single source of truth invariant) or run their own
aggregation queries over the ORM models. No writes to the database.
"""

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
