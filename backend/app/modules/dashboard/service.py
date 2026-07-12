import uuid
from datetime import date, datetime, timezone
from app.core.timezone import get_today
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from app.modules.academic.models import Course, CourseSection, Student, Enrollment, Refund, PendingRefund
from app.modules.lms.models import (
    Payment, Expense, TeacherWallet, DailyClosure,
    AttendanceSession, Assignment, Submission, Grade
)
from app.modules.identity.models import User, Employee, AuditLog
from app.modules.dashboard.schemas import (
    SectionInfo, TodaySession, RecentPayment,
    DailyTransaction, UnlockRequest, AuditLogEntry,
)


async def get_teacher_dashboard(db: AsyncSession, employee_id: uuid.UUID) -> dict:
    sections_result = await db.execute(
        select(CourseSection)
        .options(joinedload(CourseSection.course))
        .where(CourseSection.teacher_id == employee_id)
    )
    sections = sections_result.unique().scalars().all()

    sections_info = [
        SectionInfo(
            id=s.id,
            name=s.course.name,
            course_name=s.course.name,
            enrolled_count=s.enrolled_count,
            capacity=s.capacity,
        )
        for s in sections
    ]

    section_ids = [s.id for s in sections]

    emp_result = await db.execute(
        select(Employee).options(joinedload(Employee.user)).where(Employee.id == employee_id)
    )
    emp = emp_result.scalar_one_or_none()
    user_id = emp.user.id if emp and emp.user else None

    today = get_today()
    today_sessions = []
    if user_id:
        sessions_result = await db.execute(
            select(AttendanceSession)
            .options(
                joinedload(AttendanceSession.section).joinedload(CourseSection.course)
            )
            .where(
                AttendanceSession.date == today,
                AttendanceSession.created_by == user_id,
            )
        )
        today_sessions = sessions_result.unique().scalars().all()

    today_sessions_data = [
        TodaySession(
            id=s.id,
            section_name=s.section.course.name,
            course_name=s.section.course.name,
            date=s.date,
        )
        for s in today_sessions
    ]

    pending_grading = 0
    if section_ids:
        grading_result = await db.execute(
            select(func.count())
            .select_from(Submission)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .outerjoin(Grade, Grade.submission_id == Submission.id)
            .where(
                Assignment.section_id.in_(section_ids),
                Grade.id.is_(None),
            )
        )
        pending_grading = grading_result.scalar() or 0

    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == employee_id)
    )
    wallet = wallet_result.scalar_one_or_none()
    wallet_balance = wallet.balance if wallet else 0.0

    payments_result = await db.execute(
        select(Payment)
        .options(
            joinedload(Payment.enrollment).joinedload(Enrollment.student),
            joinedload(Payment.enrollment).joinedload(Enrollment.section).joinedload(CourseSection.course),
        )
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .join(CourseSection, Enrollment.section_id == CourseSection.id)
        .where(CourseSection.teacher_id == employee_id)
        .order_by(Payment.date.desc())
        .limit(5)
    )
    payments = payments_result.unique().scalars().all()

    recent_payments = [
        RecentPayment(
            id=p.id,
            student_name=p.enrollment.student.full_name if p.enrollment and p.enrollment.student else "Unknown",
            course_name=p.enrollment.section.course.name if p.enrollment and p.enrollment.section and p.enrollment.section.course else "Unknown",
            amount=p.amount,
            date=p.date,
            receipt_number=p.receipt_number,
        )
        for p in payments
    ]

    return {
        "sections_count": len(sections),
        "sections": sections_info,
        "today_sessions_count": len(today_sessions),
        "today_sessions": today_sessions_data,
        "pending_grading": pending_grading,
        "wallet_balance": wallet_balance,
        "recent_payments": recent_payments,
    }


async def get_secretary_dashboard(db: AsyncSession) -> dict:
    today = get_today()

    payments_result = await db.execute(
        select(func.count(), func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date == today)
    )
    pay_count, pay_total = payments_result.one()

    expenses_result = await db.execute(
        select(func.count(), func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date == today)
    )
    exp_count, exp_total = expenses_result.one()

    refunds_result = await db.execute(
        select(func.count(), func.coalesce(func.sum(Refund.amount), 0))
        .where(func.date(Refund.disbursed_at) == today)
    )
    ref_count, ref_total = refunds_result.one()

    students_result = await db.execute(
        select(Student).order_by(Student.full_name)
    )
    all_students = students_result.scalars().all()

    enrolled_student_ids = set()
    if all_students:
        enroll_result = await db.execute(
            select(Enrollment.student_id).distinct()
        )
        enrolled_student_ids = {row[0] for row in enroll_result.fetchall()}
    pending_students = sum(1 for s in all_students if s.id not in enrolled_student_ids)

    closure_result = await db.execute(
        select(DailyClosure).where(DailyClosure.date == today)
    )
    closure = closure_result.scalar_one_or_none()
    closure_status = closure.status if closure else "pending"

    enrollments_result = await db.execute(
        select(func.count()).select_from(Enrollment)
        .where(func.date(Enrollment.enrolled_at) == today)
    )
    recent_enrollments_count = enrollments_result.scalar() or 0

    today_transactions = []

    recent_pay_result = await db.execute(
        select(Payment)
        .options(joinedload(Payment.enrollment).joinedload(Enrollment.student))
        .where(Payment.date == today)
        .order_by(Payment.date.desc())
        .limit(5)
    )
    for p in recent_pay_result.unique().scalars().all():
        today_transactions.append(DailyTransaction(
            id=p.id,
            type="payment",
            description=f"Payment - {p.enrollment.student.full_name if p.enrollment and p.enrollment.student else 'Unknown'}",
            amount=p.amount,
            date=p.date,
            time="",
            direction="in",
        ))

    recent_exp_result = await db.execute(
        select(Expense).where(Expense.date == today).order_by(Expense.date.desc()).limit(5)
    )
    for e in recent_exp_result.scalars().all():
        today_transactions.append(DailyTransaction(
            id=e.id,
            type="expense",
            description=e.description or e.recipient_name,
            amount=-e.amount,
            date=e.date,
            time="",
            direction="out",
        ))

    recent_ref_result = await db.execute(
        select(Refund)
        .options(
            joinedload(Refund.pending_refund)
            .joinedload(PendingRefund.enrollment)
            .joinedload(Enrollment.student),
        )
        .where(func.date(Refund.disbursed_at) == today)
        .order_by(Refund.disbursed_at.desc())
        .limit(5)
    )
    for r in recent_ref_result.scalars().all():
        student_name = ""
        if r.pending_refund and r.pending_refund.enrollment and r.pending_refund.enrollment.student:
            student_name = r.pending_refund.enrollment.student.full_name
        today_transactions.append(DailyTransaction(
            id=r.id,
            type="refund",
            description=f"Refund - {student_name}" if student_name else f"Refund - {r.receipt_number}",
            amount=-r.amount,
            date=today,
            time="",
            direction="out",
        ))

    today_transactions.sort(key=lambda t: str(t.date), reverse=True)

    return {
        "today_payments_count": pay_count,
        "today_payments_total": float(pay_total),
        "today_expenses_count": exp_count,
        "today_expenses_total": float(exp_total),
        "today_refunds_count": ref_count,
        "today_refunds_total": float(ref_total),
        "pending_students": pending_students,
        "daily_closure_status": closure_status,
        "recent_enrollments_count": recent_enrollments_count,
        "today_transactions": today_transactions[:10],
    }


async def get_manager_dashboard(db: AsyncSession) -> dict:
    students_result = await db.execute(select(func.count()).select_from(Student))
    total_students = students_result.scalar() or 0

    sections_result = await db.execute(
        select(func.count()).select_from(CourseSection)
        .where(CourseSection.status.in_(["active", "pending"]))
    )
    total_courses = sections_result.scalar() or 0

    teachers_result = await db.execute(
        select(func.count())
        .select_from(Employee)
        .where(Employee.employee_type == "teacher")
    )
    total_teachers = teachers_result.scalar() or 0

    first_of_month = get_today().replace(day=1)

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.date >= first_of_month)
    )
    monthly_revenue = float(revenue_result.scalar() or 0)

    expenses_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.date >= first_of_month)
    )
    monthly_expenses = float(expenses_result.scalar() or 0)

    refunds_result = await db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0))
        .where(func.date(Refund.disbursed_at) >= first_of_month)
    )
    monthly_refunds = float(refunds_result.scalar() or 0)

    unlocks_result = await db.execute(
        select(DailyClosure).where(DailyClosure.status == "unlock_requested")
    )
    unlock_requests = []
    for u in unlocks_result.scalars().all():
        unlock_requests.append(UnlockRequest(
            date=u.date,
            requested_by=None,
        ))

    withdrawals_result = await db.execute(
        select(func.count())
        .select_from(Expense)
        .where(
            Expense.type == "teacher_withdrawal",
            Expense.date >= first_of_month,
        )
    )
    pending_withdrawals = withdrawals_result.scalar() or 0

    recent_activity_result = await db.execute(
        select(func.count())
        .select_from(Enrollment)
        .where(func.date(Enrollment.enrolled_at) >= first_of_month)
    )
    recent_activity_count = recent_activity_result.scalar() or 0

    return {
        "total_students": total_students,
        "total_courses": total_courses,
        "total_teachers": total_teachers,
        "monthly_revenue": monthly_revenue,
        "monthly_expenses": monthly_expenses,
        "monthly_refunds": monthly_refunds,
        "pending_unlock_requests": unlock_requests,
        "pending_withdrawals_count": pending_withdrawals,
        "recent_activity_count": recent_activity_count,
    }


async def get_superadmin_dashboard(db: AsyncSession) -> dict:
    manager_data = await get_manager_dashboard(db)

    health = {
        "db_status": "healthy",
        "api_uptime": "operational",
    }

    backup_status = "N/A"

    audit_result = await db.execute(
        select(AuditLog)
        .options(joinedload(AuditLog.user).joinedload(User.employee))
        .order_by(AuditLog.timestamp.desc())
        .limit(10)
    )
    audit_logs = []
    for log in audit_result.unique().scalars().all():
        audit_logs.append(AuditLogEntry(
            id=log.id,
            user_name=log.user.employee.full_name if log.user and log.user.employee else None,
            action=log.action,
            timestamp=log.timestamp,
        ))

    return {
        **manager_data,
        "system_health": health,
        "backup_status": backup_status,
        "recent_audit_logs": audit_logs,
    }
