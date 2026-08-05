"""Read-only Financial Records Center.

Projects rows from the existing `payments`, `expenses`, and `refunds`
tables into a unified document list. Mirrors the joins used by
`closure_service.get_daily_ledger` without the date-equality constraint.
No writes, no migrations.
"""

from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.academic.models import (
    Course,
    CourseSection,
    Enrollment,
    PendingRefund,
    Refund,
    Student,
)
from app.modules.identity.models import Employee, User
from app.modules.lms.models import Expense, Payment
from app.modules.lms.schemas import FinancialRecordItem, FinancialRecordListResponse

RECEIPT_PREVIEW_PREFIX = "/api/v1/lms/payments"
VOUCHER_PREVIEW_PREFIX = "/api/v1/lms/expenses"
REFUND_PREVIEW_PREFIX = "/api/v1/lms/cashier/refunds"

DETAIL_MAX_LENGTH = 120


def _payments_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
    limit: int,
    offset: int,
):
    conditions = []
    if date_from:
        conditions.append(Payment.date >= date_from)
    if date_to:
        conditions.append(Payment.date <= date_to)
    if search:
        conditions.append(Payment.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Student.full_name.ilike(f"%{name}%"))

    return (
        select(
            Payment.id,
            Payment.receipt_number,
            Payment.date,
            Payment.amount,
            Payment.payment_method,
            Payment.transaction_number,
            Student.full_name,
            Student.student_code,
            Course.name,
            func.coalesce(Employee.full_name, ""),
        )
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
        .outerjoin(User, Payment.created_by == User.id)
        .outerjoin(Employee, User.employee_id == Employee.id)
        .where(*conditions)
        .order_by(Payment.date.desc(), Payment.receipt_number)
        .limit(offset + limit)
    )


def _payments_count_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
):
    conditions = []
    if date_from:
        conditions.append(Payment.date >= date_from)
    if date_to:
        conditions.append(Payment.date <= date_to)
    if search:
        conditions.append(Payment.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Student.full_name.ilike(f"%{name}%"))

    return (
        select(func.count(Payment.id))
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .where(*conditions)
    )


def _expenses_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
    limit: int,
    offset: int,
):
    conditions = []
    if date_from:
        conditions.append(Expense.date >= date_from)
    if date_to:
        conditions.append(Expense.date <= date_to)
    if search:
        conditions.append(Expense.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Expense.recipient_name.ilike(f"%{name}%"))

    return (
        select(
            Expense.id,
            Expense.receipt_number,
            Expense.date,
            Expense.amount,
            Expense.type,
            Expense.description,
            Expense.recipient_name,
            func.coalesce(Employee.full_name, ""),
        )
        .outerjoin(User, Expense.created_by == User.id)
        .outerjoin(Employee, User.employee_id == Employee.id)
        .where(*conditions)
        .order_by(Expense.date.desc(), Expense.receipt_number)
        .limit(offset + limit)
    )


def _expenses_count_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
):
    conditions = []
    if date_from:
        conditions.append(Expense.date >= date_from)
    if date_to:
        conditions.append(Expense.date <= date_to)
    if search:
        conditions.append(Expense.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Expense.recipient_name.ilike(f"%{name}%"))

    return select(func.count(Expense.id)).where(*conditions)


def _refunds_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
    limit: int,
    offset: int,
):
    disbursement_date = func.date(Refund.disbursed_at)
    conditions = []
    if date_from:
        conditions.append(disbursement_date >= date_from)
    if date_to:
        conditions.append(disbursement_date <= date_to)
    if search:
        conditions.append(Refund.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Student.full_name.ilike(f"%{name}%"))

    return (
        select(
            Refund.id,
            Refund.receipt_number,
            disbursement_date,
            Refund.amount,
            Refund.notes,
            Student.full_name,
            Student.student_code,
            Course.name,
            func.coalesce(Employee.full_name, ""),
        )
        .join(PendingRefund, Refund.pending_refund_id == PendingRefund.id)
        .join(Enrollment, PendingRefund.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .join(Course, CourseSection.course_id == Course.id)
        .outerjoin(User, Refund.disbursed_by == User.id)
        .outerjoin(Employee, User.employee_id == Employee.id)
        .where(*conditions)
        .order_by(disbursement_date.desc(), Refund.receipt_number)
        .limit(offset + limit)
    )


def _refunds_count_query(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    search: Optional[str],
    name: Optional[str],
):
    disbursement_date = func.date(Refund.disbursed_at)
    conditions = []
    if date_from:
        conditions.append(disbursement_date >= date_from)
    if date_to:
        conditions.append(disbursement_date <= date_to)
    if search:
        conditions.append(Refund.receipt_number.ilike(f"%{search}%"))
    if name:
        conditions.append(Student.full_name.ilike(f"%{name}%"))

    return (
        select(func.count(Refund.id))
        .join(PendingRefund, Refund.pending_refund_id == PendingRefund.id)
        .join(Enrollment, PendingRefund.enrollment_id == Enrollment.id)
        .join(Student, Enrollment.student_id == Student.id)
        .where(*conditions)
    )


def _shorten(value: Optional[str]) -> str:
    if not value:
        return ""
    return value if len(value) <= DETAIL_MAX_LENGTH else value[: DETAIL_MAX_LENGTH - 3] + "..."


def _map_payment(row) -> FinancialRecordItem:
    return FinancialRecordItem(
        doc_type="receipt",
        source_id=row[0],
        receipt_number=row[1],
        date=row[2],
        amount=float(row[3]),
        counterparty=row[6] or "",
        created_by_name=row[9] or "",
        detail=row[4],
        preview_url=f"{RECEIPT_PREVIEW_PREFIX}/{row[0]}/preview",
        student_code=row[7],
        course_name=row[8] or "",
        payment_method=row[4],
        transaction_number=row[5],
    )


def _map_expense(row) -> FinancialRecordItem:
    detail = f"{row[4]}: {row[5]}" if row[5] else row[4]
    return FinancialRecordItem(
        doc_type="voucher",
        source_id=row[0],
        receipt_number=row[1],
        date=row[2],
        amount=float(row[3]),
        counterparty=row[6] or "",
        created_by_name=row[7] or "",
        detail=_shorten(detail),
        preview_url=f"{VOUCHER_PREVIEW_PREFIX}/{row[0]}/preview",
        expense_type=row[4],
        notes=row[5],
    )


def _map_refund(row) -> FinancialRecordItem:
    return FinancialRecordItem(
        doc_type="refund",
        source_id=row[0],
        receipt_number=row[1],
        date=row[2],
        amount=float(row[3]),
        counterparty=row[5] or "",
        created_by_name=row[8] or "",
        detail=_shorten(row[4]),
        preview_url=f"{REFUND_PREVIEW_PREFIX}/{row[0]}/preview",
        student_code=row[6],
        course_name=row[7] or "",
        notes=row[4],
    )


def merge_records(
    payments: list[tuple],
    expenses: list[tuple],
    refunds: list[tuple],
) -> list[FinancialRecordItem]:
    """Merges the three source row sets into one list sorted by
    `date` desc, then `receipt_number`. Pagination is applied by the caller."""
    items = [_map_payment(row) for row in payments]
    items.extend(_map_expense(row) for row in expenses)
    items.extend(_map_refund(row) for row in refunds)
    items.sort(key=lambda item: (-item.date.toordinal(), item.receipt_number))
    return items


async def search_financial_records(
    db: AsyncSession,
    *,
    doc_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    name: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> FinancialRecordListResponse:
    query_kwargs = {
        "date_from": date_from,
        "date_to": date_to,
        "search": search,
        "name": name,
    }

    payments_rows: list[tuple] = []
    expenses_rows: list[tuple] = []
    refunds_rows: list[tuple] = []
    total = 0

    if doc_type in (None, "receipt"):
        payments_result = await db.execute(
            _payments_query(limit=limit, offset=offset, **query_kwargs)
        )
        payments_rows = payments_result.fetchall()
        count_result = await db.execute(
            _payments_count_query(**query_kwargs)
        )
        total += count_result.scalar() or 0

    if doc_type in (None, "voucher"):
        expenses_result = await db.execute(
            _expenses_query(limit=limit, offset=offset, **query_kwargs)
        )
        expenses_rows = expenses_result.fetchall()
        count_result = await db.execute(
            _expenses_count_query(**query_kwargs)
        )
        total += count_result.scalar() or 0

    if doc_type in (None, "refund"):
        refunds_result = await db.execute(
            _refunds_query(limit=limit, offset=offset, **query_kwargs)
        )
        refunds_rows = refunds_result.fetchall()
        count_result = await db.execute(
            _refunds_count_query(**query_kwargs)
        )
        total += count_result.scalar() or 0

    merged = merge_records(payments_rows, expenses_rows, refunds_rows)
    return FinancialRecordListResponse(
        items=merged[offset : offset + limit],
        total=int(total or 0),
    )
