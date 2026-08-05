from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel

from app.modules.lms.schemas import (
    DailyClosureResponse as ClosuresRegisterItem,
    DailyLedgerResponse as LedgerReportResponse,
    DailyRevenueItem,
    MonthlyRevenueItem,
    RevenueComparison,
    CourseRevenueItem,
    TeacherRevenueItem,
)


class ReportDescription(BaseModel):
    """Metadata for a single report in the catalog (no query logic)."""

    path: str
    category: str
    code: str
    inputs: list[str]


class ReportCatalogResponse(BaseModel):
    reports: list[ReportDescription]


# --- A1. P&L Summary ---


class PnlDailyItem(DailyRevenueItem):
    """Daily breakdown row with the daily-closure status caveat."""

    closure_status: Optional[str] = None


class PnlReportResponse(BaseModel):
    """P&L Summary — revenue minus expenses minus refunds for a period.

    Extends the revenue overview with `DailyClosure` status: `unclosed_days`
    lists the dates in the period whose totals are partial (status != closed).
    """

    total_revenue: float
    total_expenses: float
    total_refunds: float = 0
    net_revenue: float
    transaction_count: int
    avg_per_student: float
    comparison: RevenueComparison
    monthly_trend: list[MonthlyRevenueItem]
    by_course: list[CourseRevenueItem]
    by_teacher: list[TeacherRevenueItem]
    daily_breakdown: list[PnlDailyItem]
    unclosed_days: list[str] = []


# --- A4. Daily Reconciliation ---


class ReconciliationCancellationItem(BaseModel):
    section_id: UUID
    course_name: str = ""
    cancelled_by: str = ""
    reason: Optional[str] = None
    refund_policy: Optional[str] = None
    teacher_reversal: float = 0
    refunds_authorized: float = 0


class ReconciliationRefundItem(BaseModel):
    receipt_number: Optional[str] = None
    student_name: str = ""
    amount: float = 0
    disbursed_by: str = ""


class ReconciliationOverrideItem(BaseModel):
    section: str = ""
    overridden_by: str = ""
    bypassed_grade_check: bool = False
    bypassed_payment_check: bool = False
    reason: Optional[str] = None


class ReconciliationOverdueItem(BaseModel):
    section_id: UUID
    course_name: str = ""
    days_overdue: int = 0
    status: str = ""
    ungraded_count: int = 0
    unpaid_count: int = 0


class ReconciliationSummary(BaseModel):
    total_active_sections: int = 0
    newly_ready_for_completion: int = 0
    sections_cancelled_today: int = 0
    cancellations: list[ReconciliationCancellationItem] = []
    refunds_disbursed_today: list[ReconciliationRefundItem] = []
    overrides_today: list[ReconciliationOverrideItem] = []
    overdue_sections_count: int = 0
    unclaimed_pending_refunds_total: float = 0


class DailyReconciliationReportResponse(BaseModel):
    """Daily reconciliation report with the closure-status caveat."""

    report_date: str
    generated_at: datetime
    summary: ReconciliationSummary
    closure_status: str = "pending"
    is_closed: bool = False