"""Reports service — one function per report.

Read-only aggregation/reporting layer. Report functions either delegate to
existing services (single source of truth invariant) or run their own
aggregation queries over the ORM models. No writes to the database.
"""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.modules.academic.models import Course, CourseSection, Enrollment, Student, FinalGrade
from app.modules.academic.certificate_service import get_grade_label
from app.modules.lms.models import (
    AttendanceRecord,
    AttendanceSession,
    DailyClosure,
    Expense,
    LedgerEntry,
    TeacherWallet,
)
from app.modules.lms.financial_service import get_revenue_overview
from app.modules.lms.closure_service import get_daily_ledger, list_closures
from app.modules.lms.staff_payroll_service import list_staff_for_payroll
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


# --- B. Operational reports ---


async def get_student_register(
    db: AsyncSession,
    status: Optional[str] = None,
) -> dict:
    """B1 — Student Register (active vs unenrolled).

    Lists students with their enrollment state; `status` may be
    `enrolled`/`unenrolled` to limit the returned rows.
    """
    students_result = await db.execute(
        select(Student)
        .where(Student.deleted_at.is_(None))
        .order_by(Student.full_name)
    )
    students = students_result.scalars().all()

    enrolled_result = await db.execute(
        select(Enrollment.student_id).where(Enrollment.deleted_at.is_(None))
    )
    enrolled_ids = {row[0] for row in enrolled_result.fetchall()}

    rows = [
        {
            "student_id": str(s.id),
            "student_code": s.student_code,
            "full_name": s.full_name,
            "email": s.email,
            "is_enrolled": s.id in enrolled_ids,
        }
        for s in students
    ]

    active_count = sum(1 for r in rows if r["is_enrolled"])
    if status == "enrolled":
        rows = [r for r in rows if r["is_enrolled"]]
    elif status == "unenrolled":
        rows = [r for r in rows if not r["is_enrolled"]]

    return {
        "total_students": len(students),
        "active_count": active_count,
        "unenrolled_count": len(students) - active_count,
        "status": status or "all",
        "students": rows,
    }


async def get_enrollment_summary(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    """B2 — Enrollment Summary (new enrollments per period, by course/section)."""
    filters = [Enrollment.deleted_at.is_(None)]
    if start_date:
        filters.append(func.date(Enrollment.enrolled_at) >= start_date)
    if end_date:
        filters.append(func.date(Enrollment.enrolled_at) <= end_date)

    total_result = await db.execute(
        select(func.count()).select_from(Enrollment).where(*filters)
    )
    total = total_result.scalar() or 0

    course_result = await db.execute(
        select(Course.name, func.count(Enrollment.id))
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
        .where(*filters)
        .group_by(Course.name)
        .order_by(func.count(Enrollment.id).desc())
    )
    by_course = [
        {"course_name": course_name, "enrollments": cnt}
        for course_name, cnt in course_result.fetchall()
    ]

    section_result = await db.execute(
        select(CourseSection.id, Course.name, func.count(Enrollment.id))
        .join(Enrollment, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
        .where(*filters)
        .group_by(CourseSection.id, Course.name)
        .order_by(func.count(Enrollment.id).desc())
    )
    by_section = [
        {
            "section_id": str(section_id),
            "course_name": course_name,
            "enrollments": cnt,
        }
        for section_id, course_name, cnt in section_result.fetchall()
    ]

    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "total_enrollments": total,
        "by_course": by_course,
        "by_section": by_section,
    }


async def get_section_occupancy(db: AsyncSession) -> dict:
    """B3 — Section Occupancy (enrolled vs capacity per section)."""
    result = await db.execute(
        select(CourseSection)
        .options(
            joinedload(CourseSection.course),
            joinedload(CourseSection.teacher_employee),
        )
        .where(CourseSection.deleted_at.is_(None))
        .order_by(CourseSection.enrolled_count.desc())
    )
    sections = result.unique().scalars().all()

    total_capacity = 0
    total_enrolled = 0
    items: list[dict] = []
    for section in sections:
        capacity = section.capacity or 0
        enrolled = section.enrolled_count or 0
        total_capacity += capacity
        total_enrolled += enrolled
        items.append(
            {
                "section_id": str(section.id),
                "course_name": section.course.name if section.course else "",
                "teacher_name": (
                    section.teacher_employee.full_name if section.teacher_employee else ""
                ),
                "status": section.status,
                "enrolled_count": enrolled,
                "capacity": capacity,
                "occupancy_rate": round(enrolled / capacity * 100, 1) if capacity else 0.0,
            }
        )

    return {
        "total_sections": len(items),
        "total_capacity": total_capacity,
        "total_enrolled": total_enrolled,
        "overall_occupancy_rate": (
            round(total_enrolled / total_capacity * 100, 1) if total_capacity else 0.0
        ),
        "sections": items,
    }


async def get_attendance_summary(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    teacher_id: Optional[uuid.UUID] = None,
) -> dict:
    """B4 — Attendance Summary (sessions, records, coverage per section).

    Coverage rate = records recorded ÷ (sessions × enrolled students).
    """
    filters: list = []
    if start_date:
        filters.append(AttendanceSession.date >= start_date)
    if end_date:
        filters.append(AttendanceSession.date <= end_date)
    if teacher_id:
        filters.append(CourseSection.teacher_id == teacher_id)

    sessions_result = await db.execute(
        select(CourseSection.id, func.count(AttendanceSession.id))
        .select_from(AttendanceSession)
        .join(CourseSection, AttendanceSession.section_id == CourseSection.id)
        .where(*filters)
        .group_by(CourseSection.id)
    )
    section_sessions = {row[0]: row[1] for row in sessions_result.fetchall()}

    section_ids = list(section_sessions.keys())
    if not section_ids:
        return {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "total_sections": 0,
            "total_sessions": 0,
            "total_records": 0,
            "sections": [],
        }

    records_result = await db.execute(
        select(CourseSection.id, func.count(AttendanceRecord.id))
        .select_from(AttendanceRecord)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(CourseSection, AttendanceSession.section_id == CourseSection.id)
        .where(*filters)
        .group_by(CourseSection.id)
    )
    section_records = {row[0]: row[1] for row in records_result.fetchall()}

    detail_result = await db.execute(
        select(CourseSection)
        .options(
            joinedload(CourseSection.course),
            joinedload(CourseSection.teacher_employee),
        )
        .where(CourseSection.id.in_(section_ids))
        .order_by(CourseSection.enrolled_count.desc())
    )
    sections = detail_result.unique().scalars().all()

    sessions_total = 0
    records_total = 0
    items: list[dict] = []
    for section in sections:
        session_count = section_sessions.get(section.id, 0)
        record_count = section_records.get(section.id, 0)
        expected_records = session_count * (section.enrolled_count or 0)
        sessions_total += session_count
        records_total += record_count
        items.append(
            {
                "section_id": str(section.id),
                "course_name": section.course.name if section.course else "",
                "teacher_name": (
                    section.teacher_employee.full_name if section.teacher_employee else ""
                ),
                "status": section.status,
                "enrolled_count": section.enrolled_count or 0,
                "sessions_count": session_count,
                "records_count": record_count,
                "coverage_rate": (
                    round(record_count / expected_records * 100, 1) if expected_records else 0.0
                ),
            }
        )

    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "total_sections": len(items),
        "total_sessions": sessions_total,
        "total_records": records_total,
        "sections": items,
    }


# --- C. Teacher / HR reports ---


async def get_teacher_wallets(db: AsyncSession) -> dict:
    """C1 — Teacher Wallet Balances.

    Aggregates `TeacherWallet` rows with the teacher's name and the number
    of ledger entries per wallet. Read-only.
    """
    wallets_result = await db.execute(
        select(TeacherWallet).options(joinedload(TeacherWallet.teacher_employee))
    )
    wallets = wallets_result.scalars().all()

    entry_counts_result = await db.execute(
        select(LedgerEntry.wallet_id, func.count(LedgerEntry.id)).group_by(
            LedgerEntry.wallet_id
        )
    )
    entry_counts = dict(entry_counts_result.fetchall())

    items: list[dict] = []
    total_balance = 0.0
    total_frozen = 0.0
    for wallet in wallets:
        balance = float(wallet.balance or 0)
        frozen = float(wallet.frozen_balance or 0)
        total_balance += balance
        total_frozen += frozen
        teacher = wallet.teacher_employee
        items.append(
            {
                "teacher_id": str(wallet.teacher_id),
                "teacher_name": teacher.full_name if teacher else "",
                "balance": balance,
                "frozen_balance": frozen,
                "available": balance - frozen,
                "entry_count": entry_counts.get(wallet.id, 0),
            }
        )

    return {
        "total_wallets": len(items),
        "total_balance": total_balance,
        "total_frozen": total_frozen,
        "total_available": total_balance - total_frozen,
        "wallets": items,
    }


async def get_teacher_payouts(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    """C2 — Teacher Payout Summary (teacher_withdrawal expenses per period)."""
    filters = [Expense.type == "teacher_withdrawal"]
    if start_date:
        filters.append(Expense.date >= start_date)
    if end_date:
        filters.append(Expense.date <= end_date)

    result = await db.execute(
        select(Expense)
        .options(joinedload(Expense.recipient_employee))
        .where(*filters)
        .order_by(Expense.date.desc(), Expense.receipt_number.desc())
    )
    expenses = result.scalars().all()

    by_teacher: dict[str, dict] = {}
    withdrawals: list[dict] = []
    for expense in expenses:
        amount = float(expense.amount or 0)
        recipient = expense.recipient_employee
        teacher_name = recipient.full_name if recipient else expense.recipient_name or ""
        teacher_id = str(expense.recipient_id) if expense.recipient_id else ""

        withdrawals.append(
            {
                "withdrawal_id": str(expense.id),
                "amount": amount,
                "date": expense.date.isoformat() if expense.date else None,
                "receipt_number": expense.receipt_number,
                "teacher_name": teacher_name,
            }
        )

        bucket = by_teacher.setdefault(
            teacher_id, {"teacher_id": teacher_id, "teacher_name": teacher_name,
                         "total_withdrawn": 0.0, "withdrawal_count": 0}
        )
        if not bucket["teacher_name"]:
            bucket["teacher_name"] = teacher_name
        bucket["total_withdrawn"] += amount
        bucket["withdrawal_count"] += 1

    return {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "total_withdrawn": sum(b["total_withdrawn"] for b in by_teacher.values()),
        "withdrawal_count": len(expenses),
        "by_teacher": sorted(by_teacher.values(), key=lambda b: b["total_withdrawn"], reverse=True),
        "withdrawals": withdrawals,
    }


async def get_staff_payroll_report(
    db: AsyncSession,
    month: Optional[date] = None,
) -> dict:
    """C3 — Staff Payroll Register.

    Delegates to `staff_payroll_service.list_staff_for_payroll` (single source
    of truth) and adds month-level totals.
    """
    members = await list_staff_for_payroll(db, month=month)

    return {
        "month": month.strftime("%Y-%m") if month else None,
        "total_members": len(members),
        "total_salary": sum(m["monthly_salary"] for m in members),
        "total_drawn": sum(m["total_drawn_this_month"] for m in members),
        "total_remaining": sum(m["remaining_balance"] for m in members),
        "members": members,
    }


async def get_grade_summary(db: AsyncSession, section_id: Optional[uuid.UUID] = None) -> dict:
    """C4 — Grade Summary (grade distribution by section).

    Aggregates `FinalGrade.final_score` per section, computing the average and
    bucketing the distribution with `get_grade_label` labels.
    """
    filters = []
    if section_id:
        filters.append(FinalGrade.section_id == section_id)

    result = await db.execute(
        select(FinalGrade.section_id, FinalGrade.final_score)
        .where(*filters)
    )
    rows = result.fetchall()

    grades_by_section: dict[str, list[float]] = {}
    for sec_id, score in rows:
        key = str(sec_id)
        grades_by_section.setdefault(key, []).append(float(score))

    if not grades_by_section:
        return {
            "total_sections": 0,
            "total_graded_students": 0,
            "overall_average": 0,
            "sections": [],
        }

    section_detail = await db.execute(
        select(CourseSection, Course.name)
        .join(Course, CourseSection.course_id == Course.id)
        .options(joinedload(CourseSection.teacher_employee))
        .where(CourseSection.id.in_([uuid.UUID(k) for k in grades_by_section.keys()]))
    )
    detail_rows = section_detail.fetchall()

    detail_by_id: dict[str, tuple] = {}
    for section, course_name in detail_rows:
        detail_by_id[str(section.id)] = (section, course_name)

    all_scores: list[float] = []
    sections: list[dict] = []
    for key, scores in grades_by_section.items():
        detail = detail_by_id.get(key)
        section, course_name = detail if detail else (None, "")
        student_count = len(scores)
        all_scores.extend(scores)

        distribution: dict[str, int] = {}
        for score in scores:
            label = get_grade_label(score)
            distribution[label] = distribution.get(label, 0) + 1

        sections.append(
            {
                "section_id": key,
                "course_name": course_name,
                "teacher_name": (
                    section.teacher_employee.full_name
                    if section and section.teacher_employee
                    else ""
                ),
                "status": section.status if section else "",
                "graded_count": student_count,
                "average_score": round(sum(scores) / student_count, 1) if student_count else 0.0,
                "distribution": distribution,
            }
        )

    sections.sort(key=lambda s: s["course_name"])
    return {
        "total_sections": len(sections),
        "total_graded_students": len(all_scores),
        "overall_average": round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0,
        "sections": sections,
    }