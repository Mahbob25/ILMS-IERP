import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, contains_eager
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from app.modules.academic.models import Course, CourseSection, Student, Enrollment
from app.modules.lms.models import Payment, TeacherWallet


# --- Course CRUD ---
async def create_course(db: AsyncSession, data: dict) -> Course:
    course = Course(**data)
    db.add(course)
    await db.flush()
    return course

async def get_course(db: AsyncSession, course_id: uuid.UUID) -> Optional[Course]:
    result = await db.execute(select(Course).where(Course.id == course_id))
    return result.scalar_one_or_none()

async def list_courses(
    db: AsyncSession,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "name",
    sort_order: str = "asc",
) -> dict:
    query = select(Course)
    count_query = select(func.count(Course.id))
    if search:
        pattern = f"%{search}%"
        filter_clause = or_(Course.name.ilike(pattern), Course.code.ilike(pattern))
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(Course, sort_by, Course.name)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.scalars().all()
    return {"items": items, "total": total}

async def update_course(db: AsyncSession, course_id: uuid.UUID, data: dict) -> Optional[Course]:
    course = await get_course(db, course_id)
    if not course:
        return None
    for key, value in data.items():
        setattr(course, key, value)
    await db.flush()
    return course

async def delete_course(db: AsyncSession, course_id: uuid.UUID) -> bool:
    course = await get_course(db, course_id)
    if not course:
        return False
    try:
        await db.delete(course)
        await db.flush()
        return True
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete course: one or more sections have enrollments with payments"
        )


# --- CourseSection CRUD ---
async def create_course_section(db: AsyncSession, data: dict) -> CourseSection:
    section = CourseSection(**data)
    db.add(section)
    await db.flush()
    return section

async def get_course_section(db: AsyncSession, section_id: uuid.UUID) -> Optional[CourseSection]:
    result = await db.execute(select(CourseSection).where(CourseSection.id == section_id))
    return result.scalar_one_or_none()

async def list_course_sections(
    db: AsyncSession,
    teacher_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "id",
    sort_order: str = "asc",
) -> dict:
    query = select(CourseSection)
    count_query = select(func.count(CourseSection.id))
    if teacher_id:
        query = query.where(CourseSection.teacher_id == teacher_id)
        count_query = count_query.where(CourseSection.teacher_id == teacher_id)
    if status:
        query = query.where(CourseSection.status == status)
        count_query = count_query.where(CourseSection.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.join(CourseSection.course).where(Course.name.ilike(pattern))
        count_query = count_query.join(CourseSection.course).where(Course.name.ilike(pattern))
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(CourseSection, sort_by, CourseSection.id)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.scalars().all()
    return {"items": items, "total": total}

async def update_course_section(db: AsyncSession, section_id: uuid.UUID, data: dict) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    for key, value in data.items():
        setattr(section, key, value)
    await db.flush()
    return section

async def delete_course_section(db: AsyncSession, section_id: uuid.UUID) -> bool:
    section = await get_course_section(db, section_id)
    if not section:
        return False
    try:
        await db.delete(section)
        await db.flush()
        return True
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete section with existing enrollments or payments"
        )

async def activate_section(db: AsyncSession, section_id: uuid.UUID, teacher_percentage: float) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.status != "pending":
        return None
    min_req = section.min_students_required or 1
    if section.enrolled_count < min_req:
        return None
    section.status = "active"
    section.teacher_percentage = teacher_percentage

    # Retroactively credit teacher wallet for existing payments
    payments_result = await db.execute(
        select(Payment)
        .join(Enrollment, Payment.enrollment_id == Enrollment.id)
        .where(Enrollment.section_id == section_id)
    )
    payments = payments_result.scalars().all()
    if payments:
        total_share = sum(p.amount * teacher_percentage / 100.0 for p in payments)
        if total_share > 0:
            wallet_result = await db.execute(
                select(TeacherWallet).where(TeacherWallet.teacher_id == section.teacher_id)
            )
            wallet = wallet_result.scalar_one_or_none()
            if wallet:
                wallet.balance += total_share
                wallet.last_updated = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                wallet = TeacherWallet(
                    teacher_id=section.teacher_id,
                    balance=total_share,
                    last_updated=datetime.now(timezone.utc).replace(tzinfo=None),
                )
                db.add(wallet)

    await db.flush()
    return section

async def complete_section(db: AsyncSession, section_id: uuid.UUID) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.status != "active":
        return None
    section.status = "completed"
    await db.flush()
    return section


# --- Student CRUD ---
async def create_student(db: AsyncSession, data: dict) -> Student:
    student = Student(**data)
    db.add(student)
    await db.flush()
    return student

async def get_student(db: AsyncSession, student_id: uuid.UUID) -> Optional[Student]:
    result = await db.execute(select(Student).where(Student.id == student_id))
    return result.scalar_one_or_none()

async def list_students(
    db: AsyncSession,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "full_name",
    sort_order: str = "asc",
) -> dict:
    query = select(Student)
    count_query = select(func.count(Student.id))
    if search:
        pattern = f"%{search}%"
        filter_clause = or_(Student.full_name.ilike(pattern), Student.student_code.ilike(pattern), Student.email.ilike(pattern))
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(Student, sort_by, Student.full_name)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.scalars().all()
    return {"items": items, "total": total}

async def update_student(db: AsyncSession, student_id: uuid.UUID, data: dict) -> Optional[Student]:
    student = await get_student(db, student_id)
    if not student:
        return None
    for key, value in data.items():
        setattr(student, key, value)
    await db.flush()
    return student

async def delete_student(db: AsyncSession, student_id: uuid.UUID) -> bool:
    student = await get_student(db, student_id)
    if not student:
        return False
    await db.delete(student)
    await db.flush()
    return True


# --- Enrollment CRUD ---
async def create_enrollment(db: AsyncSession, student_id: uuid.UUID, section_id: uuid.UUID,
                            admin_discount: Optional[float] = None) -> Optional[Enrollment]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.enrolled_count >= section.capacity:
        return None
    enrollment = Enrollment(
        student_id=student_id,
        section_id=section_id,
        agreed_price=section.price,
        admin_discount=admin_discount,
    )
    db.add(enrollment)
    section.enrolled_count += 1
    await db.flush()
    return enrollment

async def get_enrollment(db: AsyncSession, enrollment_id: uuid.UUID) -> Optional[Enrollment]:
    result = await db.execute(select(Enrollment).where(Enrollment.id == enrollment_id))
    return result.scalar_one_or_none()

async def list_enrollments(
    db: AsyncSession,
    section_id: Optional[uuid.UUID] = None,
    student_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "enrolled_at",
    sort_order: str = "desc",
) -> dict:
    query = select(Enrollment)
    count_query = select(func.count(Enrollment.id))
    if section_id:
        query = query.where(Enrollment.section_id == section_id)
        count_query = count_query.where(Enrollment.section_id == section_id)
    if student_id:
        query = query.where(Enrollment.student_id == student_id)
        count_query = count_query.where(Enrollment.student_id == student_id)
    if search:
        pattern = f"%{search}%"
        query = query.join(Enrollment.student).where(
            or_(Student.full_name.ilike(pattern), Student.student_code.ilike(pattern))
        )
        count_query = count_query.join(Enrollment.student).where(
            or_(Student.full_name.ilike(pattern), Student.student_code.ilike(pattern))
        )
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(Enrollment, sort_by, Enrollment.enrolled_at)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.scalars().all()
    return {"items": items, "total": total}

async def delete_enrollment(db: AsyncSession, enrollment_id: uuid.UUID) -> bool:
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        return False
    section = await get_course_section(db, enrollment.section_id)
    try:
        if section:
            section.enrolled_count -= 1
        await db.delete(enrollment)
        await db.flush()
        return True
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete enrollment with existing payments"
        )
