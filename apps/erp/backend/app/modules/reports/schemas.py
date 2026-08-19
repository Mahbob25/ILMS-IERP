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


# --- B. Operational reports ---


class StudentRegisterItem(BaseModel):
    student_id: str
    student_code: str = ""
    full_name: str = ""
    email: Optional[str] = None
    is_enrolled: bool = False


class StudentRegisterResponse(BaseModel):
    """B1 — Student Register (active vs unenrolled)."""

    total_students: int = 0
    active_count: int = 0
    unenrolled_count: int = 0
    status: str = "all"
    students: list[StudentRegisterItem] = []


class EnrollmentByCourseItem(BaseModel):
    course_name: str = ""
    enrollments: int = 0


class EnrollmentBySectionItem(BaseModel):
    section_id: str
    course_name: str = ""
    enrollments: int = 0


class EnrollmentSummaryResponse(BaseModel):
    """B2 — Enrollment Summary for a period."""

    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_enrollments: int = 0
    by_course: list[EnrollmentByCourseItem] = []
    by_section: list[EnrollmentBySectionItem] = []


class SectionOccupancyItem(BaseModel):
    section_id: str
    course_name: str = ""
    teacher_name: str = ""
    status: str = ""
    enrolled_count: int = 0
    capacity: int = 0
    occupancy_rate: float = 0


class SectionOccupancyResponse(BaseModel):
    """B3 — Section Occupancy (enrolled vs capacity)."""

    total_sections: int = 0
    total_capacity: int = 0
    total_enrolled: int = 0
    overall_occupancy_rate: float = 0
    sections: list[SectionOccupancyItem] = []


class AttendanceSummaryItem(BaseModel):
    section_id: str
    course_name: str = ""
    teacher_name: str = ""
    status: str = ""
    enrolled_count: int = 0
    sessions_count: int = 0
    records_count: int = 0
    coverage_rate: float = 0


class AttendanceSummaryResponse(BaseModel):
    """B4 — Attendance Summary (sessions, records, coverage per section)."""

    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_sections: int = 0
    total_sessions: int = 0
    total_records: int = 0
    sections: list[AttendanceSummaryItem] = []


# --- C. Teacher / HR reports ---


class TeacherWalletSummaryItem(BaseModel):
    """C1 — One teacher wallet balance row."""

    teacher_id: str
    teacher_name: str = ""
    balance: float = 0
    frozen_balance: float = 0
    available: float = 0
    entry_count: int = 0


class TeacherWalletsResponse(BaseModel):
    """C1 — Teacher Wallet Balances."""

    total_wallets: int = 0
    total_balance: float = 0
    total_frozen: float = 0
    total_available: float = 0
    wallets: list[TeacherWalletSummaryItem] = []


class TeacherPayoutItem(BaseModel):
    """C2 — One teacher_withdrawal Expense row."""

    withdrawal_id: str
    amount: float = 0
    date: Optional[str] = None
    receipt_number: str = ""
    teacher_name: str = ""


class TeacherPayoutBreakdownItem(BaseModel):
    """C2 — Teacher grouped withdrawal totals."""

    teacher_id: str
    teacher_name: str = ""
    total_withdrawn: float = 0
    withdrawal_count: int = 0


class TeacherPayoutsResponse(BaseModel):
    """C2 — Teacher Payout Summary for a period."""

    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_withdrawn: float = 0
    withdrawal_count: int = 0
    by_teacher: list[TeacherPayoutBreakdownItem] = []
    withdrawals: list[TeacherPayoutItem] = []


class StaffPayrollItem(BaseModel):
    """C3 — One staff-payroll member row."""

    id: str
    full_name: str = ""
    role: str = ""
    monthly_salary: float = 0
    total_drawn_this_month: float = 0
    remaining_balance: float = 0


class PayrollRegisterResponse(BaseModel):
    """C3 — Staff Payroll Register (delegates to staff_payroll_service)."""

    month: Optional[str] = None
    total_members: int = 0
    total_salary: float = 0
    total_drawn: float = 0
    total_remaining: float = 0
    members: list[StaffPayrollItem] = []


class GradeDistributionSectionItem(BaseModel):
    """C4 — One section's grade distribution."""

    section_id: str
    course_name: str = ""
    teacher_name: str = ""
    status: str = ""
    graded_count: int = 0
    average_score: float = 0
    distribution: dict[str, int] = {}


class GradeSummaryResponse(BaseModel):
    """C4 — Grade Summary (grade distribution by section).

    Distribution keys are `certificate_service.get_grade_label` labels.
    """

    total_sections: int = 0
    total_graded_students: int = 0
    overall_average: float = 0
    sections: list[GradeDistributionSectionItem] = []