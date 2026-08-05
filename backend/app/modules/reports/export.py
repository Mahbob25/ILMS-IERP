"""Export helpers for the reports module (Phase 5).

CSV and print HTML are built exclusively from payloads produced by
`reports.service` — this module never runs its own queries (single
source of truth invariant). Each report declares a list of *sections*
and one section spec drives both the CSV download and the print-ready
HTML document.

Section shape: ``(title_ar, title_en, column_keys, rows)``. Column keys
are resolved through ``_COL_LABELS`` so headers render in Arabic or
English from a single source.
"""

import csv
import html as html_lib
import io
from datetime import date, datetime
from typing import Any, Callable

from fastapi.responses import HTMLResponse, StreamingResponse

from app.core.templates import template_engine
from app.core.timezone import utcnow

_YES_AR = "نعم"
_NO_AR = "لا"

# (arabic, english) labels for every column used by any report table.
_COL_LABELS: dict[str, tuple[str, str]] = {
    "start_date": ("من", "From"),
    "end_date": ("إلى", "To"),
    "date": ("التاريخ", "Date"),
    "report_date": ("تاريخ التقرير", "Report Date"),
    "status": ("الحالة", "Status"),
    "closure_status": ("حالة الإغلاق", "Closure Status"),
    "unclosed_days": ("أيام غير مقفلة", "Unclosed Days"),
    "total_revenue": ("إجمالي الإيرادات", "Total Revenue"),
    "total_expenses": ("إجمالي المصروفات", "Total Expenses"),
    "total_refunds": ("إجمالي المردودات", "Total Refunds"),
    "net_revenue": ("صافي الإيرادات", "Net Revenue"),
    "transactions": ("المعاملات", "Transactions"),
    "revenue": ("الإيرادات", "Revenue"),
    "expenses": ("المصروفات", "Expenses"),
    "refunds": ("المردودات", "Refunds"),
    "payments_in": ("المقبوضات", "Payments In"),
    "expenses_out": ("المصروفات", "Expenses Out"),
    "refunds_out": ("المردودات", "Refunds Out"),
    "net_cash_flow": ("صافي التدفق", "Net Cash Flow"),
    "receipt_number": ("رقم السند", "Receipt No"),
    "student_name": ("الطالب", "Student"),
    "course_name": ("المقرر", "Course"),
    "payment_method": ("طريقة الدفع", "Payment Method"),
    "amount": ("المبلغ", "Amount"),
    "created_by_name": ("أُنشئ بواسطة", "Created By"),
    "type": ("النوع", "Type"),
    "recipient_name": ("المستلم", "Recipient"),
    "description": ("البيان", "Description"),
    "disbursed_at": ("تاريخ الصرف", "Disbursed At"),
    "disbursed_by_name": ("صرف بواسطة", "Disbursed By"),
    "student_code": ("رقم الطالب", "Student Code"),
    "full_name": ("الاسم", "Full Name"),
    "email": ("البريد", "Email"),
    "is_enrolled": ("مسجل", "Enrolled"),
    "section_id": ("معرف الشعبة", "Section ID"),
    "teacher_name": ("المعلم", "Teacher"),
    "enrolled_count": ("المسجلون", "Enrolled"),
    "capacity": ("الطاقة", "Capacity"),
    "occupancy_rate": ("نسبة الإشغال", "Occupancy Rate"),
    "sessions_count": ("الجلسات", "Sessions"),
    "records_count": ("السجلات", "Records"),
    "coverage_rate": ("التغطية", "Coverage"),
    "balance": ("الرصيد", "Balance"),
    "frozen_balance": ("المجمّد", "Frozen"),
    "available": ("المتاح", "Available"),
    "entry_count": ("القيود", "Entries"),
    "withdrawal_count": ("عدد السحوبات", "Withdrawals"),
    "total_withdrawn": ("إجمالي السحوبات", "Total Withdrawn"),
    "active_sections": ("الشعب النشطة", "Active Sections"),
    "ready_completion": ("جاهزة للإكمال", "Ready for Completion"),
    "cancelled_today": ("ملغاة اليوم", "Cancelled Today"),
    "refunds_disbursed": ("مردودات صرفت", "Refunds Disbursed"),
    "overrides": ("تجاوزات", "Overrides"),
    "overdue": ("متأخرة", "Overdue"),
    "unclaimed": ("مردودات غير محصلة", "Unclaimed Refunds"),
    "cancelled_by": ("أُلغي بواسطة", "Cancelled By"),
    "reason": ("السبب", "Reason"),
    "refund_policy": ("سياسة الاسترداد", "Refund Policy"),
    "teacher_reversal": ("عكس نصيب المعلم", "Teacher Reversal"),
    "refunds_authorized": ("مردودات مصرح بها", "Refunds Authorized"),
    "disbursed_by": ("صرف بواسطة", "Disbursed By"),
    "section": ("الشعبة", "Section"),
    "overridden_by": ("بواسطة", "Overridden By"),
    "bypassed_grade_check": ("تجاوز الدرجات", "Bypassed Grade"),
    "bypassed_payment_check": ("تجاوز الدفع", "Bypassed Payment"),
    "days_overdue": ("أيام التأخير", "Days Overdue"),
    "ungraded_count": ("غير مقيمة", "Ungraded"),
    "unpaid_count": ("غير مدفوعة", "Unpaid"),
    "role": ("الدور", "Role"),
    "monthly_salary": ("الراتب الشهري", "Monthly Salary"),
    "total_drawn_this_month": ("المسحوب", "Drawn"),
    "remaining_balance": ("المتبقي", "Remaining"),
    "graded_count": ("عدد المقيّمين", "Graded"),
    "average_score": ("المتوسط", "Average"),
    "distribution": ("التوزيع", "Distribution"),
    "month": ("الشهر", "Month"),
    "total_students": ("الطلاب", "Students"),
    "active_count": ("النشطون", "Active"),
    "unenrolled_count": ("غير المسجلين", "Unenrolled"),
    "total_enrollments": ("إجمالي التسجيلات", "Total Enrollments"),
    "enrollments": ("عدد التسجيلات", "Enrollments"),
    "total_sections": ("عدد الشعب", "Sections"),
    "total_capacity": ("إجمالي الطاقة", "Total Capacity"),
    "total_enrolled": ("إجمالي المسجلين", "Total Enrolled"),
    "overall_occupancy_rate": ("نسبة الإشغال الكلية", "Overall Occupancy"),
    "total_sessions": ("إجمالي الجلسات", "Total Sessions"),
    "total_records": ("إجمالي السجلات", "Total Records"),
    "total_wallets": ("عدد المحافظ", "Wallets"),
    "total_balance": ("إجمالي الرصيد", "Total Balance"),
    "total_frozen": ("إجمالي المجمد", "Total Frozen"),
    "total_available": ("الإجمالي المتاح", "Total Available"),
    "total_members": ("الموظفون", "Members"),
    "total_salary": ("إجمالي الرواتب", "Total Salary"),
    "total_drawn": ("إجمالي المسحوب", "Total Drawn"),
    "total_remaining": ("إجمالي المتبقي", "Total Remaining"),
    "total_graded_students": ("الطلاب المقيّمون", "Graded Students"),
    "overall_average": ("المتوسط الكلي", "Overall Average"),
}

_REPORT_TITLES: dict[str, tuple[str, str]] = {
    "pnl_summary": ("ملخص الأرباح والخسائر", "P&L Summary"),
    "daily_ledger": ("دفتر اليومية", "Daily Ledger"),
    "closures_register": ("سجل الإغلاقات", "Closures Register"),
    "daily_reconciliation": ("التسوية اليومية", "Daily Reconciliation"),
    "student_register": ("سجل الطلاب", "Student Register"),
    "enrollment_summary": ("ملخص التسجيلات", "Enrollment Summary"),
    "section_occupancy": ("إشغال الشعب", "Section Occupancy"),
    "attendance_summary": ("ملخص الحضور", "Attendance Summary"),
    "teacher_wallets": ("أرصدة محافظ المعلمين", "Teacher Wallet Balances"),
    "teacher_payouts": ("ملخص سحوبات المعلمين", "Teacher Payout Summary"),
    "staff_payroll": ("سجل رواتب الموظفين", "Staff Payroll Register"),
    "grade_summary": ("ملخص الدرجات", "Grade Summary"),
}

# Section shape: (title_ar, title_en, column_keys, rows)
Section = tuple[str, str, list[str], list[list[Any]]]
SectionBuilder = Callable[[Any], list[Section]]


def _csv_value(value: Any) -> str:
    """Serialize a cell value for CSV / print tables."""
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bool):
        return _YES_AR if value else _NO_AR
    if isinstance(value, float):
        return f"{value:.2f}".rstrip("0").rstrip(".")
    if isinstance(value, dict):
        return ", ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def _money(value: Any) -> str:
    try:
        return f"{float(value or 0):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _distribution_value(distribution: Any) -> str:
    if not distribution:
        return ""
    if isinstance(distribution, dict):
        return ", ".join(f"{label}: {count}" for label, count in distribution.items())
    return str(distribution)


def _table_html(headers: list[str], rows: list[list[Any]]) -> str:
    thead = "".join(f"<th>{html_lib.escape(h)}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{html_lib.escape(_csv_value(cell))}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    empty = f'<tr><td colspan="{len(headers)}" class="empty">—</td></tr>'
    return f"<table><thead><tr>{thead}</tr></thead><tbody>{body or empty}</tbody></table>"


def _localized_headers(keys: list[str], locale: str) -> list[str]:
    idx = 0 if locale == "ar" else 1
    return [_COL_LABELS.get(k, (k, k))[idx] for k in keys]


def _period_start_end(daily: list[dict]) -> tuple[str, str]:
    dates = sorted(d.get("date") for d in daily if d.get("date"))
    if not dates:
        return "", ""
    return _csv_value(dates[0]), _csv_value(dates[-1])


# --- Per-report section builders ------------------------------------------


def _sections_pnl_summary(payload: dict) -> list[Section]:
    daily = payload.get("daily_breakdown") or []
    period_from, period_to = _period_start_end(daily)
    unclosed = payload.get("unclosed_days") or []

    summary = [[
        period_from,
        period_to,
        _money(payload.get("total_revenue", 0)),
        _money(payload.get("total_expenses", 0)),
        _money(payload.get("total_refunds", 0)),
        _money(payload.get("net_revenue", 0)),
        payload.get("transaction_count", 0) or 0,
        len(unclosed) if isinstance(unclosed, list) else (unclosed or 0),
    ]]
    detail = [
        [
            _csv_value(item.get("date")),
            _money(item.get("revenue", 0)),
            _money(item.get("expenses", 0)),
            _money(item.get("refunds", 0)),
            item.get("closure_status") or "",
        ]
        for item in daily
    ]
    return [
        (
            "ملخص الفترة",
            "Period Summary",
            ["start_date", "end_date", "total_revenue", "total_expenses", "total_refunds",
             "net_revenue", "transactions", "unclosed_days"],
            summary,
        ),
        (
            "التفاصيل اليومية",
            "Daily Breakdown",
            ["date", "revenue", "expenses", "refunds", "closure_status"],
            detail,
        ),
    ]


def _sections_daily_ledger(payload: dict) -> list[Section]:
    summary = [[
        _csv_value(payload.get("date")),
        payload.get("status") or "pending",
        _money(payload.get("total_payments_in", 0)),
        _money(payload.get("total_expenses_out", 0)),
        _money(payload.get("total_refunds_out", 0)),
        _money(payload.get("net_cash_flow", 0)),
    ]]
    payments = [
        [
            _csv_value(p.get("receipt_number")),
            _csv_value(p.get("student_name")),
            _csv_value(p.get("course_name")),
            _csv_value(p.get("payment_method")),
            _money(p.get("amount", 0)),
            _csv_value(p.get("created_by_name")),
        ]
        for p in (payload.get("payments") or [])
    ]
    expenses = [
        [
            _csv_value(e.get("receipt_number")),
            _csv_value(e.get("type")),
            _csv_value(e.get("recipient_name")),
            _csv_value(e.get("description")),
            _money(e.get("amount", 0)),
            _csv_value(e.get("created_by_name")),
        ]
        for e in (payload.get("expenses") or [])
    ]
    refunds = [
        [
            _csv_value(r.get("receipt_number")),
            _csv_value(r.get("student_name")),
            _csv_value(r.get("course_name")),
            _money(r.get("amount", 0)),
            _csv_value(r.get("disbursed_at")),
            _csv_value(r.get("disbursed_by_name")),
        ]
        for r in (payload.get("refunds") or [])
    ]
    return [
        (
            "ملخص اليوم",
            "Day Summary",
            ["date", "status", "payments_in", "expenses_out", "refunds_out", "net_cash_flow"],
            summary,
        ),
        (
            "المقبوضات",
            "Payments",
            ["receipt_number", "student_name", "course_name", "payment_method", "amount",
             "created_by_name"],
            payments,
        ),
        (
            "المصروفات",
            "Expenses",
            ["receipt_number", "type", "recipient_name", "description", "amount",
             "created_by_name"],
            expenses,
        ),
        (
            "المردودات",
            "Refunds",
            ["receipt_number", "student_name", "course_name", "amount", "disbursed_at",
             "disbursed_by_name"],
            refunds,
        ),
    ]


def _sections_closures_register(payload: Any) -> list[Section]:
    rows = [
        [
            _csv_value(item.get("date")),
            item.get("status", "pending"),
            _money(item.get("total_payments_in", 0)),
            _money(item.get("total_expenses_out", 0)),
            _money(item.get("total_refunds_out", 0)),
            _money(item.get("net_cash_flow", 0)),
        ]
        for item in (payload or [])
    ]
    return [
        (
            "سجل الإغلاقات",
            "Closures Register",
            ["date", "status", "payments_in", "expenses_out", "refunds_out", "net_cash_flow"],
            rows,
        ),
    ]


def _sections_daily_reconciliation(payload: dict) -> list[Section]:
    summary = payload.get("summary") or {}
    summary_row = [[
        _csv_value(payload.get("report_date")),
        summary.get("total_active_sections", 0),
        summary.get("newly_ready_for_completion", 0),
        summary.get("sections_cancelled_today", 0),
        len(summary.get("refunds_disbursed_today") or []),
        len(summary.get("overrides_today") or []),
        summary.get("overdue_sections_count", 0),
        _money(summary.get("unclaimed_pending_refunds_total", 0)),
        _csv_value(payload.get("closure_status", "pending")),
    ]]
    cancellations = [
        [
            _csv_value(c.get("course_name")),
            _csv_value(c.get("cancelled_by")),
            _csv_value(c.get("reason")),
            _csv_value(c.get("refund_policy")),
            _money(c.get("teacher_reversal", 0)),
            _money(c.get("refunds_authorized", 0)),
        ]
        for c in (summary.get("cancellations") or [])
    ]
    refunds = [
        [
            _csv_value(r.get("receipt_number")),
            _csv_value(r.get("student_name")),
            _money(r.get("amount", 0)),
            _csv_value(r.get("disbursed_by")),
        ]
        for r in (summary.get("refunds_disbursed_today") or [])
    ]
    overrides = [
        [
            _csv_value(o.get("section")),
            _csv_value(o.get("overridden_by")),
            _csv_value(o.get("bypassed_grade_check")),
            _csv_value(o.get("bypassed_payment_check")),
            _csv_value(o.get("reason")),
        ]
        for o in (summary.get("overrides_today") or [])
    ]
    overdue = [
        [
            _csv_value(o.get("course_name")),
            o.get("days_overdue", 0),
            _csv_value(o.get("status")),
            o.get("ungraded_count", 0),
            o.get("unpaid_count", 0),
        ]
        for o in (summary.get("overdue_sections") or [])
    ]
    return [
        (
            "ملخص التقرير",
            "Report Summary",
            ["report_date", "active_sections", "ready_completion", "cancelled_today",
             "refunds_disbursed", "overrides", "overdue", "unclaimed", "closure_status"],
            summary_row,
        ),
        (
            "إلغاءات الشعبة",
            "Section Cancellations",
            ["course_name", "cancelled_by", "reason", "refund_policy", "teacher_reversal",
             "refunds_authorized"],
            cancellations,
        ),
        (
            "المردودات المصروفة",
            "Refunds Disbursed",
            ["receipt_number", "student_name", "amount", "disbursed_by"],
            refunds,
        ),
        (
            "تجاوزات الإكمال",
            "Completion Overrides",
            ["section", "overridden_by", "bypassed_grade_check", "bypassed_payment_check",
             "reason"],
            overrides,
        ),
        (
            "شعب متأخرة",
            "Overdue Sections",
            ["course_name", "days_overdue", "status", "ungraded_count", "unpaid_count"],
            overdue,
        ),
    ]


def _sections_student_register(payload: dict) -> list[Section]:
    summary = [[
        payload.get("total_students", 0),
        payload.get("active_count", 0),
        payload.get("unenrolled_count", 0),
        payload.get("status", "all"),
    ]]
    detail = [
        [
            _csv_value(s.get("student_code")),
            _csv_value(s.get("full_name")),
            _csv_value(s.get("email")),
            _csv_value(s.get("is_enrolled")),
        ]
        for s in (payload.get("students") or [])
    ]
    return [
        (
            "ملخص",
            "Summary",
            ["total_students", "active_count", "unenrolled_count", "status"],
            summary,
        ),
        (
            "تفاصيل الطلاب",
            "Student Details",
            ["student_code", "full_name", "email", "is_enrolled"],
            detail,
        ),
    ]


def _sections_enrollment_summary(payload: dict) -> list[Section]:
    summary = [[
        _csv_value(payload.get("start_date")),
        _csv_value(payload.get("end_date")),
        payload.get("total_enrollments", 0),
    ]]
    by_course = [
        [_csv_value(c.get("course_name")), c.get("enrollments", 0)]
        for c in (payload.get("by_course") or [])
    ]
    by_section = [
        [_csv_value(s.get("section_id")), _csv_value(s.get("course_name")),
         s.get("enrollments", 0)]
        for s in (payload.get("by_section") or [])
    ]
    return [
        (
            "ملخص التسجيلات",
            "Enrollment Summary",
            ["start_date", "end_date", "total_enrollments"],
            summary,
        ),
        (
            "حسب المقرر",
            "By Course",
            ["course_name", "enrollments"],
            by_course,
        ),
        (
            "حسب الشعبة",
            "By Section",
            ["section_id", "course_name", "enrollments"],
            by_section,
        ),
    ]


def _sections_section_occupancy(payload: dict) -> list[Section]:
    summary = [[
        payload.get("total_sections", 0),
        payload.get("total_capacity", 0),
        payload.get("total_enrolled", 0),
        payload.get("overall_occupancy_rate", 0),
    ]]
    detail = [
        [
            _csv_value(s.get("course_name")),
            _csv_value(s.get("teacher_name")),
            _csv_value(s.get("status")),
            s.get("enrolled_count", 0),
            s.get("capacity", 0),
            s.get("occupancy_rate", 0),
        ]
        for s in (payload.get("sections") or [])
    ]
    return [
        (
            "ملخص الإشغال",
            "Occupancy Summary",
            ["total_sections", "total_capacity", "total_enrolled", "overall_occupancy_rate"],
            summary,
        ),
        (
            "تفاصيل الشعب",
            "Section Details",
            ["course_name", "teacher_name", "status", "enrolled_count", "capacity",
             "occupancy_rate"],
            detail,
        ),
    ]


def _sections_attendance_summary(payload: dict) -> list[Section]:
    summary = [[
        _csv_value(payload.get("start_date")),
        _csv_value(payload.get("end_date")),
        payload.get("total_sections", 0),
        payload.get("total_sessions", 0),
        payload.get("total_records", 0),
    ]]
    detail = [
        [
            _csv_value(s.get("course_name")),
            _csv_value(s.get("teacher_name")),
            _csv_value(s.get("status")),
            s.get("enrolled_count", 0),
            s.get("sessions_count", 0),
            s.get("records_count", 0),
            s.get("coverage_rate", 0),
        ]
        for s in (payload.get("sections") or [])
    ]
    return [
        (
            "ملخص الحضور",
            "Attendance Summary",
            ["start_date", "end_date", "total_sections", "total_sessions", "total_records"],
            summary,
        ),
        (
            "تفاصيل الشعب",
            "Section Details",
            ["course_name", "teacher_name", "status", "enrolled_count", "sessions_count",
             "records_count", "coverage_rate"],
            detail,
        ),
    ]


def _sections_teacher_wallets(payload: dict) -> list[Section]:
    summary = [[
        payload.get("total_wallets", 0),
        _money(payload.get("total_balance", 0)),
        _money(payload.get("total_frozen", 0)),
        _money(payload.get("total_available", 0)),
    ]]
    detail = [
        [
            _csv_value(w.get("teacher_name")),
            _money(w.get("balance", 0)),
            _money(w.get("frozen_balance", 0)),
            _money(w.get("available", 0)),
            w.get("entry_count", 0),
        ]
        for w in (payload.get("wallets") or [])
    ]
    return [
        (
            "ملخص الأرصدة",
            "Balance Summary",
            ["total_wallets", "total_balance", "total_frozen", "total_available"],
            summary,
        ),
        (
            "المحافظ",
            "Wallets",
            ["teacher_name", "balance", "frozen_balance", "available", "entry_count"],
            detail,
        ),
    ]


def _sections_teacher_payouts(payload: dict) -> list[Section]:
    by_teacher = [
        [
            _csv_value(t.get("teacher_name")),
            t.get("withdrawal_count", 0),
            _money(t.get("total_withdrawn", 0)),
        ]
        for t in (payload.get("by_teacher") or [])
    ]
    withdrawals = [
        [
            _csv_value(w.get("date")),
            _csv_value(w.get("receipt_number")),
            _csv_value(w.get("teacher_name")),
            _money(w.get("amount", 0)),
        ]
        for w in (payload.get("withdrawals") or [])
    ]
    return [
        (
            "حسب المعلم",
            "By Teacher",
            ["teacher_name", "withdrawal_count", "total_withdrawn"],
            by_teacher,
        ),
        (
            "السحوبات",
            "Withdrawals",
            ["date", "receipt_number", "teacher_name", "amount"],
            withdrawals,
        ),
    ]


def _sections_staff_payroll(payload: dict) -> list[Section]:
    summary = [[
        payload.get("month") or "",
        payload.get("total_members", 0),
        _money(payload.get("total_salary", 0)),
        _money(payload.get("total_drawn", 0)),
        _money(payload.get("total_remaining", 0)),
    ]]
    members = [
        [
            _csv_value(m.get("full_name")),
            _csv_value(m.get("role")),
            _money(m.get("monthly_salary", 0)),
            _money(m.get("total_drawn_this_month", 0)),
            _money(m.get("remaining_balance", 0)),
        ]
        for m in (payload.get("members") or [])
    ]
    return [
        (
            "ملخص الراتب",
            "Payroll Summary",
            ["month", "total_members", "total_salary", "total_drawn", "total_remaining"],
            summary,
        ),
        (
            "كشف الرواتب",
            "Payroll Register",
            ["full_name", "role", "monthly_salary", "total_drawn_this_month",
             "remaining_balance"],
            members,
        ),
    ]


def _sections_grade_summary(payload: dict) -> list[Section]:
    summary = [[
        payload.get("total_sections", 0),
        payload.get("total_graded_students", 0),
        payload.get("overall_average", 0),
    ]]
    detail = [
        [
            _csv_value(s.get("course_name")),
            _csv_value(s.get("teacher_name")),
            s.get("graded_count", 0),
            s.get("average_score", 0),
            _distribution_value(s.get("distribution")),
        ]
        for s in (payload.get("sections") or [])
    ]
    return [
        (
            "ملخص الدرجات",
            "Grade Summary",
            ["total_sections", "total_graded_students", "overall_average"],
            summary,
        ),
        (
            "توزيع الدرجات",
            "Grade Distribution",
            ["course_name", "teacher_name", "graded_count", "average_score", "distribution"],
            detail,
        ),
    ]


_SECTION_BUILDERS: dict[str, SectionBuilder] = {
    "pnl_summary": _sections_pnl_summary,
    "daily_ledger": _sections_daily_ledger,
    "closures_register": _sections_closures_register,
    "daily_reconciliation": _sections_daily_reconciliation,
    "student_register": _sections_student_register,
    "enrollment_summary": _sections_enrollment_summary,
    "section_occupancy": _sections_section_occupancy,
    "attendance_summary": _sections_attendance_summary,
    "teacher_wallets": _sections_teacher_wallets,
    "teacher_payouts": _sections_teacher_payouts,
    "staff_payroll": _sections_staff_payroll,
    "grade_summary": _sections_grade_summary,
}


def _sections_for(report_code: str, payload: Any) -> list[Section]:
    builder = _SECTION_BUILDERS.get(report_code)
    if builder is None:
        raise ValueError(f"Unknown report code: {report_code}")
    return builder(payload)


# --- Public API -----------------------------------------------------------


def to_csv_rows(report_code: str, payload: Any, locale: str = "en") -> list[list[str]]:
    """Serialize a report payload into CSV rows (headers + data).

    Each section becomes its own headed table, separated by a blank line.
    Handles sparse and empty payloads without erroring.
    """
    rows: list[list[str]] = []
    for _, _, keys, section_rows in _sections_for(report_code, payload):
        rows.append(_localized_headers(keys, locale))
        rows.extend([_csv_value(cell) for cell in row] for row in section_rows)
        rows.append([])
    return rows


def csv_download_response(
    report_code: str, payload: Any, locale: str = "en"
) -> StreamingResponse:
    """Build a BOM-prefixed CSV ``StreamingResponse`` for a report payload."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for row in to_csv_rows(report_code, payload, locale):
        writer.writerow(row)
    content = buffer.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{report_code}.csv"'},
    )


def _period_label(report_code: str, payload: Any) -> str:
    if report_code == "pnl_summary":
        period_from, period_to = _period_start_end(payload.get("daily_breakdown") or [])
        return f"{period_from} — {period_to}" if period_from else ""
    if report_code in ("daily_ledger", "daily_reconciliation"):
        return _csv_value(payload.get("date") or payload.get("report_date"))
    if report_code == "staff_payroll":
        return _csv_value(payload.get("month"))
    if report_code in ("enrollment_summary", "attendance_summary", "teacher_payouts"):
        start = _csv_value(payload.get("start_date"))
        end = _csv_value(payload.get("end_date"))
        return f"{start} — {end}" if start or end else ""
    return ""


def _subtitle_html(subtitle: str) -> str:
    if not subtitle:
        return ""
    return f'<div class="doc-subtitle">{html_lib.escape(subtitle)}</div>'


def _closure_caveat_html(report_code: str, payload: Any, locale: str) -> str:
    if report_code == "pnl_summary":
        unclosed = payload.get("unclosed_days") or []
        if isinstance(unclosed, list) and unclosed:
            message = (
                "تنبيه: الأيام التالية غير مقفلة يومياً — أرقامها جزئية وقد تتغير: "
                if locale == "ar"
                else "Warning: the following days are not daily-closed — their figures are "
                "partial and may change: "
            )
            return (
                f'<div class="caveat">{html_lib.escape(message)}'
                f"{html_lib.escape(', '.join(unclosed))}</div>"
            )
    if report_code == "daily_reconciliation" and not payload.get("is_closed"):
        message = (
            "تنبيه: هذا اليوم غير مقفل — البيانات جزئية وقد تتغير."
            if locale == "ar"
            else "Warning: this day is not daily-closed — data is partial and may change."
        )
        return f'<div class="caveat">{html_lib.escape(message)}</div>'
    return ""


def render_print_html(report_code: str, payload: Any, locale: str = "ar") -> str:
    """Render a self-contained, print-ready HTML document for a report."""
    title_ar, title_en = _REPORT_TITLES.get(report_code, (report_code, report_code))
    title = title_ar if locale == "ar" else title_en

    parts: list[str] = []
    for section_ar, section_en, keys, section_rows in _sections_for(report_code, payload):
        section_title = section_ar if locale == "ar" else section_en
        parts.append(
            f'<h3 class="section-title">{html_lib.escape(section_title)}</h3>'
            + _table_html(_localized_headers(keys, locale), section_rows)
        )

    variables = {
        "report_title": title,
        "subtitle_html": _subtitle_html(_period_label(report_code, payload)),
        "generated_at": utcnow().strftime("%Y-%m-%d %H:%M"),
        "caveat_html": _closure_caveat_html(report_code, payload, locale),
        "table_html": "".join(parts),
    }
    return template_engine.render_report(variables)


def print_html_response(report_code: str, payload: Any, locale: str = "ar") -> HTMLResponse:
    """Build an ``HTMLResponse`` for the print/PDF export of a report."""
    return HTMLResponse(content=render_print_html(report_code, payload, locale))
