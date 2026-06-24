import uuid
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, update
from sqlalchemy.orm import joinedload

from app.modules.lms.models import Payment, TeacherWallet
from app.modules.academic.models import Course, CourseSection, Enrollment


async def get_next_receipt_number(db: AsyncSession, payment_date: date) -> str:
    prefix = f"RCP-{payment_date.strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.coalesce(func.max(Payment.receipt_number), ""))
        .where(Payment.receipt_number.like(f"{prefix}%"))
    )
    max_num = result.scalar() or ""
    if max_num:
        seq = int(max_num.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def create_payment(
    db: AsyncSession,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
    amount: float,
    payment_date: Optional[date] = None,
) -> Optional[Payment]:
    if payment_date is None:
        payment_date = date.today()

    course_result = await db.execute(
        select(Course).options(joinedload(Course.sections)).where(Course.id == course_id)
    )
    course = course_result.unique().scalar_one_or_none()
    if not course:
        return None

    receipt_number = await get_next_receipt_number(db, payment_date)

    payment = Payment(
        student_id=student_id,
        course_id=course_id,
        amount=amount,
        date=payment_date,
        receipt_number=receipt_number,
    )
    db.add(payment)

    teacher_pct = course.teacher_percentage or 0
    teacher_share = amount * teacher_pct / 100.0

    if teacher_share > 0 and course.sections:
        section = course.sections[0]
        enrollment_result = await db.execute(
            select(Enrollment)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.section_id == section.id,
            )
        )
        enrollment = enrollment_result.scalar_one_or_none()

        admin_discount = enrollment.admin_discount if enrollment and enrollment.admin_discount else 0

        teacher_id = section.teacher_id
        wallet_result = await db.execute(
            select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
        )
        wallet = wallet_result.scalar_one_or_none()
        if wallet:
            wallet.balance += teacher_share
            wallet.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            wallet = TeacherWallet(
                teacher_id=teacher_id,
                balance=teacher_share,
                last_updated=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(wallet)

    await db.flush()
    return payment


async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Optional[Payment]:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    return result.scalar_one_or_none()


async def list_payments(
    db: AsyncSession,
    student_id: Optional[uuid.UUID] = None,
    course_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Payment]:
    query = select(Payment).order_by(Payment.date.desc(), Payment.receipt_number.desc())
    if student_id:
        query = query.where(Payment.student_id == student_id)
    if course_id:
        query = query.where(Payment.course_id == course_id)
    if date_from:
        query = query.where(Payment.date >= date_from)
    if date_to:
        query = query.where(Payment.date <= date_to)
    result = await db.execute(query)
    return result.scalars().all()


async def get_teacher_wallet(db: AsyncSession, teacher_id: uuid.UUID) -> Optional[TeacherWallet]:
    result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    )
    return result.scalar_one_or_none()


async def get_student_payment_summary(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> dict:
    total_paid_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            Payment.student_id == student_id,
            Payment.course_id == course_id,
        )
    )
    total_paid = total_paid_result.scalar() or 0.0

    enrollment_result = await db.execute(
        select(Enrollment)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .where(
            Enrollment.student_id == student_id,
            CourseSection.course_id == course_id,
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()

    agreed_price = enrollment.agreed_price if enrollment else None

    return {
        "total_paid": total_paid,
        "agreed_price": agreed_price,
        "balance_remaining": (agreed_price - total_paid) if agreed_price else None,
    }
