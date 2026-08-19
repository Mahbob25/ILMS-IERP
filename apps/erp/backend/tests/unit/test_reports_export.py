"""Unit tests for the reports export helpers (Phase 5).

Covers: CSV row serialization, locale-aware headers, print HTML rendering,
empty/sparse payloads, unknown report codes, and the download responses.
"""

import asyncio
from datetime import date

import pytest

from app.modules.reports import export as export_module
from app.modules.reports.export import (
    _csv_value,
    _localized_headers,
    _money,
    _sections_for,
    csv_download_response,
    print_html_response,
    render_print_html,
    to_csv_rows,
)


async def _consume(iterator):
    return [chunk async for chunk in iterator]


PNL_SAMPLE = {
    "total_revenue": 1000.0,
    "total_expenses": 300.0,
    "total_refunds": 50.0,
    "net_revenue": 650.0,
    "transaction_count": 10,
    "daily_breakdown": [
        {"date": "2026-07-01", "revenue": 500.0, "expenses": 100.0, "refunds": 0.0,
         "closure_status": "closed"},
        {"date": "2026-07-02", "revenue": 500.0, "expenses": 200.0, "refunds": 50.0,
         "closure_status": "pending"},
    ],
    "unclosed_days": ["2026-07-02"],
}

WALLETS_SAMPLE = {
    "total_wallets": 1,
    "total_balance": 500.0,
    "total_frozen": 100.0,
    "total_available": 400.0,
    "wallets": [
        {"teacher_name": "Teacher One", "balance": 500.0, "frozen_balance": 100.0,
         "available": 400.0, "entry_count": 3},
    ],
}


class TestCsvValue:

    def test_none_becomes_empty(self):
        assert _csv_value(None) == ""

    def test_bool_uses_arabic_labels(self):
        assert _csv_value(True) == "نعم"
        assert _csv_value(False) == "لا"

    def test_date_isoformat(self):
        assert _csv_value(date(2026, 7, 14)) == "2026-07-14"

    def test_float_trims_zeros(self):
        assert _csv_value(100.50) == "100.5"
        assert _csv_value(100.0) == "100"

    def test_dict_joins_entries(self):
        assert _csv_value({"a": 1, "b": 2}) == "a: 1, b: 2"

    def test_string_passthrough(self):
        assert _csv_value("text") == "text"


class TestMoney:

    def test_formats_thousands(self):
        assert _money(1234567.5) == "1,234,567.50"

    def test_zero_default(self):
        assert _money(None) == "0.00"
        assert _money("not-a-number") == "0.00"


class TestLocalizedHeaders:

    def test_arabic_headers(self):
        assert _localized_headers(["date", "amount"], "ar") == ["التاريخ", "المبلغ"]

    def test_english_headers(self):
        assert _localized_headers(["date", "amount"], "en") == ["Date", "Amount"]

    def test_unknown_key_falls_back(self):
        assert _localized_headers(["mystery_key"], "ar") == ["mystery_key"]


class TestSectionsFor:

    def test_known_code_returns_sections(self):
        sections = _sections_for("teacher_wallets", WALLETS_SAMPLE)
        assert len(sections) == 2
        assert sections[0][0] == "ملخص الأرصدة"
        assert sections[1][0] == "المحافظ"
        assert sections[1][1] == "Wallets"

    def test_unknown_code_raises(self):
        with pytest.raises(ValueError):
            _sections_for("not_a_report", {})

    def test_empty_payload_yields_headers_only_rows(self):
        rows = to_csv_rows("grade_summary", {})
        assert rows[0] == ["Sections", "Graded Students", "Overall Average"]
        assert rows[1] == ["0", "0", "0"]
        assert rows[2] == []


class TestToCsvRows:

    def test_headers_are_localized(self):
        rows = to_csv_rows("teacher_wallets", WALLETS_SAMPLE, locale="ar")
        assert rows[0] == ["عدد المحافظ", "إجمالي الرصيد", "إجمالي المجمد", "الإجمالي المتاح"]
        assert rows[3] == ["المعلم", "الرصيد", "المجمّد", "المتاح", "القيود"]

    def test_english_headers_by_default(self):
        rows = to_csv_rows("teacher_wallets", WALLETS_SAMPLE)
        assert rows[0] == ["Wallets", "Total Balance", "Total Frozen", "Total Available"]

    def test_sections_separated_by_blank_row(self):
        rows = to_csv_rows("teacher_wallets", WALLETS_SAMPLE)
        assert rows[2] == []
        assert rows[3] == ["Teacher", "Balance", "Frozen", "Available", "Entries"]

    def test_pnl_caveat_days_are_counted(self):
        rows = to_csv_rows("pnl_summary", PNL_SAMPLE)
        assert rows[1][-1] == "1"


class TestCsvDownloadResponse:

    def test_streaming_csv_with_bom(self):
        response = csv_download_response("teacher_wallets", WALLETS_SAMPLE)
        body = b"".join(asyncio.run(_consume(response.body_iterator)))
        assert body.startswith(b"\xef\xbb\xbf")
        assert b"Teacher" in body

    def test_content_disposition(self):
        response = csv_download_response("teacher_wallets", WALLETS_SAMPLE)
        assert response.headers["content-disposition"] == 'attachment; filename="teacher_wallets.csv"'


class TestRenderPrintHtml:

    def test_renders_report_title(self, monkeypatch):
        rendered = render_print_html("teacher_wallets", WALLETS_SAMPLE, locale="ar")
        assert "أرصدة محافظ المعلمين" in rendered
        assert "المعلم" in rendered
        assert "Teacher One" in rendered

    def test_english_locale(self, monkeypatch):
        rendered = render_print_html("teacher_wallets", WALLETS_SAMPLE, locale="en")
        assert "Teacher Wallet Balances" in rendered
        assert "Teacher" in rendered

    def test_empty_payload_does_not_crash(self, monkeypatch):
        rendered = render_print_html("daily_reconciliation", {}, locale="ar")
        assert "التسوية اليومية" in rendered

    def test_unknown_code_raises(self, monkeypatch):
        with pytest.raises(ValueError):
            render_print_html("bogus", {}, locale="ar")


class TestPrintHtmlResponse:

    def test_returns_html_response(self):
        response = print_html_response("teacher_wallets", WALLETS_SAMPLE, locale="ar")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert "Teacher One" in response.body.decode("utf-8", errors="replace")


LEDGER_SAMPLE = {
    "date": "2026-07-14",
    "status": "closed",
    "total_payments_in": 500.0,
    "total_expenses_out": 100.0,
    "total_refunds_out": 0.0,
    "net_cash_flow": 400.0,
    "payments": [
        {"receipt_number": "R1", "student_name": "Student A", "course_name": "Course A",
         "payment_method": "cash", "amount": 500.0, "created_by_name": "Cashier"},
    ],
    "expenses": [
        {"receipt_number": "V1", "type": "general_expense", "recipient_name": "Vendor",
         "description": "Supplies", "amount": 100.0, "created_by_name": "Cashier"},
    ],
    "refunds": [
        {"receipt_number": "RF1", "student_name": "Student B", "course_name": "Course B",
         "amount": 50.0, "disbursed_at": "2026-07-14", "disbursed_by_name": "Manager"},
    ],
}

CLOSURES_SAMPLE = [
    {"date": "2026-07-14", "status": "closed", "total_payments_in": 500.0,
     "total_expenses_out": 100.0, "total_refunds_out": 0.0, "net_cash_flow": 400.0},
]

ENROLLMENT_SAMPLE = {
    "start_date": "2026-07-01", "end_date": "2026-07-31", "total_enrollments": 3,
    "by_course": [{"course_name": "Course A", "enrollments": 2}],
    "by_section": [{"section_id": "s1", "course_name": "Course A", "enrollments": 2}],
}

OCCUPANCY_SAMPLE = {
    "total_sections": 1, "total_capacity": 30, "total_enrolled": 20,
    "overall_occupancy_rate": 66.7,
    "sections": [
        {"course_name": "Course A", "teacher_name": "Teacher One", "status": "active",
         "enrolled_count": 20, "capacity": 30, "occupancy_rate": 66.7},
    ],
}

ATTENDANCE_SAMPLE = {
    "start_date": "2026-07-01", "end_date": "2026-07-15", "total_sections": 1,
    "total_sessions": 4, "total_records": 60,
    "sections": [
        {"course_name": "Course A", "teacher_name": "Teacher One", "status": "active",
         "enrolled_count": 20, "sessions_count": 4, "records_count": 60, "coverage_rate": 75.0},
    ],
}

PAYOUTS_SAMPLE = {
    "start_date": "2026-07-01", "end_date": "2026-07-31", "total_withdrawn": 300.0,
    "withdrawal_count": 1,
    "by_teacher": [{"teacher_name": "Teacher One", "withdrawal_count": 1,
                    "total_withdrawn": 300.0}],
    "withdrawals": [
        {"date": "2026-07-14", "receipt_number": "W1", "teacher_name": "Teacher One",
         "amount": 300.0},
    ],
}

PAYROLL_SAMPLE = {
    "month": "2026-07", "total_members": 1, "total_salary": 2000.0, "total_drawn": 500.0,
    "total_remaining": 1500.0,
    "members": [
        {"full_name": "Staff One", "role": "secretary", "monthly_salary": 2000.0,
         "total_drawn_this_month": 500.0, "remaining_balance": 1500.0},
    ],
}

STUDENT_SAMPLE = {
    "total_students": 1, "active_count": 1, "unenrolled_count": 0, "status": "all",
    "students": [
        {"student_code": "STU001", "full_name": "Test Student", "email": "t@test.com",
         "is_enrolled": True},
    ],
}

GRADE_SAMPLE = {
    "total_sections": 1, "total_graded_students": 2, "overall_average": 85.0,
    "sections": [
        {"course_name": "Course A", "teacher_name": "Teacher One", "graded_count": 2,
         "average_score": 85.0, "distribution": {"ممتاز": 1, "جيد جدا": 1}},
    ],
}

RECONCILIATION_SAMPLE = {
    "report_date": "2026-07-14",
    "closure_status": "pending",
    "is_closed": False,
    "summary": {
        "total_active_sections": 45,
        "newly_ready_for_completion": 1,
        "sections_cancelled_today": 0,
        "cancellations": [],
        "refunds_disbursed_today": [],
        "overrides_today": [],
        "overdue_sections_count": 2,
        "overdue_sections": [],
        "unclaimed_pending_refunds_total": 15000.0,
    },
}

RECONCILIATION_FULL = {
    "report_date": "2026-07-14",
    "closure_status": "closed",
    "is_closed": True,
    "summary": {
        "total_active_sections": 45,
        "newly_ready_for_completion": 1,
        "sections_cancelled_today": 1,
        "cancellations": [
            {"course_name": "Course X", "cancelled_by": "Manager", "reason": "Low demand",
             "refund_policy": "authorize_refunds", "teacher_reversal": 100.0,
             "refunds_authorized": 200.0},
        ],
        "refunds_disbursed_today": [
            {"receipt_number": "RF2", "student_name": "Student C", "amount": 50.0,
             "disbursed_by": "Cashier"},
        ],
        "overrides_today": [
            {"section": "Section A", "overridden_by": "Manager",
             "bypassed_grade_check": True, "bypassed_payment_check": False,
             "reason": "Override reason"},
        ],
        "overdue_sections_count": 1,
        "overdue_sections": [
            {"course_name": "Course B", "days_overdue": 3, "status": "active",
             "ungraded_count": 1, "unpaid_count": 0},
        ],
        "unclaimed_pending_refunds_total": 15000.0,
    },
}


class TestSectionBuilders:

    def test_daily_ledger_all_categories(self):
        html = render_print_html("daily_ledger", LEDGER_SAMPLE, locale="en")
        assert "Payment Voucher" not in html and "Day Summary" in html
        assert "Student A" in html and "Vendor" in html and "Student B" in html

    def test_closures_register(self):
        rows = to_csv_rows("closures_register", CLOSURES_SAMPLE)
        assert rows[0] == ["Date", "Status", "Payments In", "Expenses Out",
                           "Refunds Out", "Net Cash Flow"]

    def test_student_register(self):
        rows = to_csv_rows("student_register", STUDENT_SAMPLE)
        assert rows[0] == ["Students", "Active", "Unenrolled", "Status"]
        assert rows[1] == ["1", "1", "0", "all"]
        assert rows[3] == ["Student Code", "Full Name", "Email", "Enrolled"]

    def test_enrollment_summary(self):
        rows = to_csv_rows("enrollment_summary", ENROLLMENT_SAMPLE)
        assert rows[1] == ["2026-07-01", "2026-07-31", "3"]
        assert rows[3] == ["Course", "Enrollments"]
        assert rows[6] == ["Section ID", "Course", "Enrollments"]

    def test_section_occupancy(self):
        rows = to_csv_rows("section_occupancy", OCCUPANCY_SAMPLE)
        assert rows[1] == ["1", "30", "20", "66.7"]

    def test_attendance_summary(self):
        rows = to_csv_rows("attendance_summary", ATTENDANCE_SAMPLE)
        assert rows[1] == ["2026-07-01", "2026-07-15", "1", "4", "60"]
        assert "Teacher One" in rows[4]

    def test_teacher_payouts(self):
        rows = to_csv_rows("teacher_payouts", PAYOUTS_SAMPLE)
        assert rows[1] == ["Teacher One", "1", "300.00"]
        assert rows[3] == ["Date", "Receipt No", "Teacher", "Amount"]

    def test_staff_payroll(self):
        rows = to_csv_rows("staff_payroll", PAYROLL_SAMPLE)
        assert rows[1] == ["2026-07", "1", "2,000.00", "500.00", "1,500.00"]
        assert rows[3] == ["Full Name", "Role", "Monthly Salary", "Drawn", "Remaining"]

    def test_grade_summary_with_distribution(self):
        html = render_print_html("grade_summary", GRADE_SAMPLE, locale="en")
        assert "Overall Average" in html
        assert "ممتاز" in html or "distribution" in html

    def test_reconciliation_empty_summary(self):
        html = render_print_html("daily_reconciliation", RECONCILIATION_SAMPLE, locale="ar")
        assert "التسوية اليومية" in html
        assert "غير مقفل" in html

    def test_reconciliation_full_detail(self):
        html = render_print_html("daily_reconciliation", RECONCILIATION_FULL, locale="en")
        assert "Section Cancellations" in html
        assert "Student C" in html
        assert "Override reason" in html
        assert "Course B" in html or "Course A" in html


class TestCaveats:

    def test_pnl_unclosed_caveat(self):
        html = render_print_html("pnl_summary", PNL_SAMPLE, locale="en")
        assert "Warning:" in html

    def test_pnl_closed_no_caveat(self):
        clean = dict(PNL_SAMPLE)
        clean["unclosed_days"] = []
        html = render_print_html("pnl_summary", clean, locale="en")
        assert "Warning:" not in html

    def test_reconciliation_closed_no_caveat(self):
        html = render_print_html("daily_reconciliation", RECONCILIATION_FULL, locale="en")
        assert "Warning:" not in html


class TestPeriodLabels:

    def test_pnl_period_from_breakdown(self):
        html = render_print_html("pnl_summary", PNL_SAMPLE, locale="en")
        assert "2026-07-01" in html or "2026-07-02" in html

    def test_daily_ledger_period_is_date(self):
        html = render_print_html("daily_ledger", LEDGER_SAMPLE, locale="en")
        assert "2026-07-14" in html

    def test_payroll_period_is_month(self):
        html = render_print_html("staff_payroll", PAYROLL_SAMPLE, locale="en")
        assert "2026-07" in html

    def test_enrollment_period_range(self):
        html = render_print_html("enrollment_summary", ENROLLMENT_SAMPLE, locale="en")
        assert "2026-07-01" in html

    def test_known_code_with_empty_payload_uses_fallback_label(self):
        html = render_print_html("teacher_payouts", {}, locale="en")
        assert "Teacher Payout Summary" in html
