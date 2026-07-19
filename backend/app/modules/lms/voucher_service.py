import html
import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from app.modules.lms.models import Payment, Expense
from app.modules.academic.models import Enrollment, CourseSection, Refund, PendingRefund
from app.modules.identity.models import User
from app.core.templates import template_engine


RECEIPT_HTML_EN = {
    "cash": "Cash",
    "online": "Bank Transfer",
}

RECEIPT_HTML_AR = {
    "cash": "نقداً",
    "online": "تحويل بنكي",
}

EXPENSE_TYPE_LABELS_EN = {
    "general_expense": "General Expense",
    "teacher_withdrawal": "Teacher Withdrawal",
}

EXPENSE_TYPE_LABELS_AR = {
    "general_expense": "مصروف عام",
    "teacher_withdrawal": "سحب معلم",
}

EXPENSE_TYPE_BADGE = {
    "general_expense": "badge-general",
    "teacher_withdrawal": "badge-teacher",
}


def _generate_receipt_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    student_name: str = "",
    course_name: str = "",
    payment_method: str = "cash",
    transaction_number: Optional[str] = None,
    agreed_price: Optional[float] = None,
    admin_discount: Optional[float] = None,
    total_paid: Optional[float] = None,
    balance_remaining: Optional[float] = None,
    locale: str = "ar",
    cashier_name: str = "",
) -> str:
    labels = RECEIPT_HTML_AR if locale == "ar" else RECEIPT_HTML_EN
    method_label = labels["online"] if payment_method == "online" else labels["cash"]
    amount_str = f"{amount:.2f}"

    agreed_str = f"{agreed_price:.2f}" if agreed_price is not None else ""
    discount_str = f"{admin_discount:.2f}" if admin_discount and admin_discount > 0 else ""
    balance_str = f"{balance_remaining:.2f}" if balance_remaining is not None else ""

    if discount_str:
        discount_en = f'Discount: <span class="fill-in" style="min-width:80px;">-{discount_str}</span><br>'
        discount_ar = f'الخصم: <span class="fill-in" style="min-width:80px;">-{discount_str}</span><br>'
    else:
        discount_en = ""
        discount_ar = ""

    if payment_method == "online" and transaction_number:
        escaped_txn = html.escape(transaction_number)
        transaction_ar = f'<div class="info-row"><span class="info-label">رقم العملية:</span><span class="info-value" style="direction:ltr">{escaped_txn}</span></div>'
        transaction_en = f'Transaction No: <span class="fill-in" style="min-width:80px;">{escaped_txn}</span><br>'
    else:
        transaction_ar = ""
        transaction_en = ""

    variables = {
        "receipt_title_ar": "سند دفع",
        "receipt_title_en": "Payment Receipt",
        "receipt_number": receipt_number,
        "date": date_str,
        "student_name": html.escape(student_name),
        "course_name": html.escape(course_name),
        "payment_method": method_label,
        "agreed_price": agreed_str,
        "discount_en": discount_en,
        "discount_ar": discount_ar,
        "transaction_en": transaction_en,
        "transaction_ar": transaction_ar,
        "paid_amount": amount_str,
        "balance": balance_str,
        "cashier_name": html.escape(cashier_name),
    }
    return template_engine.render_receipt(variables)


def _generate_voucher_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    expense_type: str = "general_expense",
    recipient_name: str = "",
    description: Optional[str] = None,
    locale: str = "ar",
    cashier_name: str = "",
) -> str:
    type_labels = EXPENSE_TYPE_LABELS_AR if locale == "ar" else EXPENSE_TYPE_LABELS_EN
    type_label = type_labels.get(expense_type, expense_type)
    amount_str = f"{amount:.2f}"

    variables = {
        "voucher_title_ar": "سند صرف",
        "voucher_title_en": "Payment Voucher",
        "voucher_number": receipt_number,
        "date": date_str,
        "expense_type": type_label,
        "recipient_name": html.escape(recipient_name),
        "description": html.escape(description or ""),
        "amount": amount_str,
        "cashier_name": html.escape(cashier_name),
    }
    return template_engine.render_voucher(variables)


def _generate_refund_voucher_html(
    receipt_number: str,
    date_str: str,
    amount: float,
    student_name: str = "",
    course_name: str = "",
    locale: str = "ar",
    cashier_name: str = "",
) -> str:
    amount_str = f"{amount:.2f}"

    variables = {
        "refund_title_ar": "سند استرداد",
        "refund_title_en": "Refund Voucher",
        "refund_number": receipt_number,
        "date": date_str,
        "student_name": html.escape(student_name),
        "course_name": html.escape(course_name),
        "reason": "استرداد رسوم" if locale == "ar" else "Refund",
        "amount": amount_str,
        "cashier_name": html.escape(cashier_name),
    }
    return template_engine.render_refund_voucher(variables)


async def get_receipt_html_content(db: AsyncSession, payment_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    result = await db.execute(
        select(Payment)
        .options(
            joinedload(Payment.enrollment)
            .joinedload(Enrollment.student),
            joinedload(Payment.enrollment)
            .joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Payment.created_by_user).joinedload(User.employee),
        )
        .where(Payment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return None

    enrollment = payment.enrollment
    student = enrollment.student
    section = enrollment.section
    course = section.course

    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id == enrollment.id)
    )
    total_paid = Decimal(str(total_paid_result.scalar() or 0))
    agreed_price = enrollment.agreed_price or 0
    discount_pct = enrollment.admin_discount or 0
    discount_amount = agreed_price * discount_pct / 100
    net_price = agreed_price - discount_amount
    if net_price <= 0:
        net_price = max(agreed_price, 1)
    balance_remaining = net_price - total_paid

    cashier_name = (payment.created_by_user.full_name or "") if payment.created_by_user else ""

    return _generate_receipt_html(
        receipt_number=payment.receipt_number,
        date_str=payment.date.isoformat(),
        amount=payment.amount,
        student_name=student.full_name if student else "",
        course_name=course.name if course else "",
        payment_method=payment.payment_method,
        transaction_number=payment.transaction_number,
        agreed_price=agreed_price if agreed_price > 0 else None,
        admin_discount=discount_amount if discount_amount > 0 else None,
        total_paid=total_paid,
        balance_remaining=balance_remaining,
        locale=locale,
        cashier_name=cashier_name,
    )


async def get_voucher_html_content(db: AsyncSession, expense_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    result = await db.execute(
        select(Expense)
        .options(joinedload(Expense.created_by_user).joinedload(User.employee))
        .where(Expense.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return None

    cashier_name = (expense.created_by_user.full_name or "") if expense.created_by_user else ""

    return _generate_voucher_html(
        receipt_number=expense.receipt_number,
        date_str=expense.date.isoformat(),
        amount=expense.amount,
        expense_type=expense.type,
        recipient_name=expense.recipient_name,
        description=expense.description,
        locale=locale,
        cashier_name=cashier_name,
    )


async def get_refund_voucher_html_content(db: AsyncSession, refund_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    result = await db.execute(
        select(Refund)
        .options(
            joinedload(Refund.pending_refund)
            .joinedload(PendingRefund.enrollment)
            .joinedload(Enrollment.student),
            joinedload(Refund.pending_refund)
            .joinedload(PendingRefund.enrollment)
            .joinedload(Enrollment.section)
            .joinedload(CourseSection.course),
            joinedload(Refund.disbursed_by_user)
            .joinedload(User.employee),
        )
        .where(Refund.id == refund_id)
    )
    refund = result.scalar_one_or_none()
    if not refund:
        return None

    pending_refund = refund.pending_refund
    enrollment = pending_refund.enrollment if pending_refund else None
    student = enrollment.student if enrollment else None
    section = enrollment.section if enrollment else None
    course = section.course if section else None

    cashier_name = (refund.disbursed_by_user.full_name or "") if refund.disbursed_by_user else ""

    return _generate_refund_voucher_html(
        receipt_number=refund.receipt_number,
        date_str=refund.disbursed_at.isoformat(),
        amount=refund.amount,
        student_name=student.full_name if student else "",
        course_name=course.name if course else "",
        locale=locale,
        cashier_name=cashier_name,
    )
