import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import func, update, select as sa_select
from app.modules.academic.models import Course, CourseSection, Student, Enrollment


# --- Course CRUD ---
async def create_course(db: AsyncSession, data: dict) -> Course:
    data.pop("status", None)
    course = Course(**data)
    db.add(course)
    await db.flush()
    return course

async def get_course(db: AsyncSession, course_id: uuid.UUID) -> Optional[Course]:
    result = await db.execute(select(Course).where(Course.id == course_id))
    return result.scalar_one_or_none()

async def get_course_enrollment_count(db: AsyncSession, course_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(CourseSection.enrolled_count), 0))
        .where(CourseSection.course_id == course_id)
    )
    return result.scalar() or 0

async def activate_course(db: AsyncSession, course_id: uuid.UUID, teacher_percentage: float) -> Optional[Course]:
    course = await get_course(db, course_id)
    if not course:
        return None
    if course.status != "pending":
        return None
    enrolled = await get_course_enrollment_count(db, course_id)
    min_req = course.min_students_required or 1
    if enrolled < min_req:
        return None
    course.status = "active"
    course.teacher_percentage = teacher_percentage
    await db.flush()
    return course

async def complete_course(db: AsyncSession, course_id: uuid.UUID) -> Optional[Course]:
    course = await get_course(db, course_id)
    if not course:
        return None
    if course.status != "active":
        return None
    course.status = "completed"
    await db.flush()
    return course

async def list_courses(db: AsyncSession) -> list[Course]:
    result = await db.execute(select(Course).order_by(Course.name))
    return result.scalars().all()

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
    await db.delete(course)
    await db.flush()
    return True


# --- CourseSection CRUD ---
async def create_course_section(db: AsyncSession, data: dict) -> CourseSection:
    section = CourseSection(**data)
    db.add(section)
    await db.flush()
    return section

async def get_course_section(db: AsyncSession, section_id: uuid.UUID) -> Optional[CourseSection]:
    result = await db.execute(select(CourseSection).where(CourseSection.id == section_id))
    return result.scalar_one_or_none()

async def list_course_sections(db: AsyncSession, teacher_id: Optional[uuid.UUID] = None) -> list[CourseSection]:
    query = select(CourseSection).order_by(CourseSection.id)
    if teacher_id:
        query = query.where(CourseSection.teacher_id == teacher_id)
    result = await db.execute(query)
    return result.scalars().all()

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
    await db.delete(section)
    await db.flush()
    return True


# --- Student CRUD ---
async def create_student(db: AsyncSession, data: dict) -> Student:
    student = Student(**data)
    db.add(student)
    await db.flush()
    return student

async def get_student(db: AsyncSession, student_id: uuid.UUID) -> Optional[Student]:
    result = await db.execute(select(Student).where(Student.id == student_id))
    return result.scalar_one_or_none()

async def list_students(db: AsyncSession) -> list[Student]:
    result = await db.execute(select(Student).order_by(Student.full_name))
    return result.scalars().all()

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
                            agreed_price: Optional[float] = None, admin_discount: Optional[float] = None) -> Optional[Enrollment]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.enrolled_count >= section.capacity:
        return None
    enrollment = Enrollment(
        student_id=student_id,
        section_id=section_id,
        agreed_price=agreed_price,
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
) -> list[Enrollment]:
    query = select(Enrollment).order_by(Enrollment.enrolled_at.desc())
    if section_id:
        query = query.where(Enrollment.section_id == section_id)
    if student_id:
        query = query.where(Enrollment.student_id == student_id)
    result = await db.execute(query)
    return result.scalars().all()

async def delete_enrollment(db: AsyncSession, enrollment_id: uuid.UUID) -> bool:
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        return False
    section = await get_course_section(db, enrollment.section_id)
    if section:
        section.enrolled_count -= 1
    await db.delete(enrollment)
    await db.flush()
    return True
