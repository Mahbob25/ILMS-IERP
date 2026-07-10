from decimal import Decimal
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import exists, func, or_, and_
from app.modules.academic.models import (
    Course,
    CourseSection,
    Student,
    Enrollment,
    FinalGrade,
    SectionCompletionOverride,
    SectionLifecycleConfig,
    DailyJobsLog,
)
from app.modules.academic.certificate_service import create_certificate, get_grade_label
from app.modules.identity.models import User
from app.modules.lms.models import Payment, ContractStatus, SectionContract
from app.modules.lms.ledger_service import (
    activate_contract as ledger_activate_contract,
    settle_contract as ledger_settle_contract,
    finalize_grades_for_section as ledger_finalize_grades,
    deactivate_contract as ledger_deactivate_contract,
)
from app.core.timezone import get_today


# --- Course CRUD ---
async def create_course(db: AsyncSession, data: dict) -> Course:
    if "code" in data and data["code"]:
        existing = await db.execute(
            select(Course).where(
                Course.code == data["code"], Course.deleted_at.is_(None)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Course code already exists",
            )
    course = Course(**data)
    db.add(course)
    await db.flush()
    return course


async def get_course(db: AsyncSession, course_id: uuid.UUID) -> Optional[Course]:
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def list_courses(
    db: AsyncSession,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "name",
    sort_order: str = "asc",
) -> dict:
    query = select(Course).where(Course.deleted_at.is_(None))
    count_query = select(func.count(Course.id)).where(Course.deleted_at.is_(None))
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


async def update_course(
    db: AsyncSession, course_id: uuid.UUID, data: dict
) -> Optional[Course]:
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
    course.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


# --- CourseSection CRUD ---
async def create_course_section(db: AsyncSession, data: dict) -> CourseSection:
    course_id = data.get("course_id")
    if course_id:
        course = await get_course(db, course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
            )

    section = CourseSection(**data)
    db.add(section)
    await db.flush()
    return section


async def get_course_section(
    db: AsyncSession, section_id: uuid.UUID
) -> Optional[CourseSection]:
    result = await db.execute(
        select(CourseSection).where(
            CourseSection.id == section_id, CourseSection.deleted_at.is_(None)
        )
    )
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
    query = select(CourseSection).where(CourseSection.deleted_at.is_(None))
    count_query = select(func.count(CourseSection.id)).where(
        CourseSection.deleted_at.is_(None)
    )
    if teacher_id:
        query = query.where(CourseSection.teacher_id == teacher_id)
        count_query = count_query.where(CourseSection.teacher_id == teacher_id)
    if status:
        query = query.where(CourseSection.status == status)
        count_query = count_query.where(CourseSection.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.join(CourseSection.course).where(Course.name.ilike(pattern))
        count_query = count_query.join(CourseSection.course).where(
            Course.name.ilike(pattern)
        )
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(CourseSection, sort_by, CourseSection.id)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    query = query.options(joinedload(CourseSection.contract))
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.unique().scalars().all()

    for item in items:
        item.contract_status = item.contract.status.value if item.contract else None
        item.contract_compensation_model = (
            item.contract.compensation_model.value
            if item.contract and item.contract.compensation_model
            else None
        )

    return {"items": items, "total": total}


async def update_course_section(
    db: AsyncSession, section_id: uuid.UUID, data: dict
) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None

    for key, value in data.items():
        if value is not None:
            setattr(section, key, value)
    await db.flush()
    return section


async def delete_course_section(db: AsyncSession, section_id: uuid.UUID) -> bool:
    section = await get_course_section(db, section_id)
    if not section:
        return False
    section.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def activate_section(
    db: AsyncSession,
    section_id: uuid.UUID,
    teacher_percentage: Optional[float] = None,
    activated_by: Optional[uuid.UUID] = None,
) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.status != "pending":
        return None
    min_req = section.min_students_required or 1
    if section.enrolled_count < min_req:
        return None
    if section.price is None:
        return None
    if section.teacher_id is None:
        return None
    if section.start_date is None:
        return None
    if section.class_time is None:
        return None

    section.status = "active"
    if teacher_percentage is not None:
        section.teacher_percentage = teacher_percentage

    if (
        section.contract
        and section.contract.status == ContractStatus.ASSIGNED
        and activated_by
    ):
        await ledger_activate_contract(
            db, section.contract.id, activated_by=activated_by
        )

    await db.flush()
    return section


async def complete_section(
    db: AsyncSession, section_id: uuid.UUID, current_user: User,
    force: bool = False, force_reason: str | None = None
) -> Optional[CourseSection]:
    section = await get_course_section(db, section_id)
    if not section:
        return None
    if section.status != "active":
        return None

    # Daily closure check
    if await _is_date_closed(db, get_today()):
        raise HTTPException(
            status_code=400,
            detail="Cannot complete section on a closed financial day. "
                   "Ask a manager to unlock the day first."
        )

    # Grade completeness check (NULL vs 0 distinction)
    enrolled_count = await _count_enrolled_students(db, section_id)
    graded_count = await db.scalar(
        select(func.count(FinalGrade.id)).where(FinalGrade.section_id == section_id)
    ) or 0

    ungraded = []
    if enrolled_count > graded_count:
        ungraded = await _get_ungraded_students(db, section_id)
        if not force:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Section has ungraded students",
                    "ungraded_students": [s["full_name"] for s in ungraded],
                }
            )

    # Payment balance check
    unpaid_students = []
    enrollments_result = await db.execute(
        select(Enrollment).where(
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        )
    )
    for enrollment in enrollments_result.scalars().all():
        net_price = _calculate_net_price(enrollment)
        total_paid = await _sum_payments_for_enrollment(db, enrollment.id)
        balance = net_price - total_paid

        if balance > 0:
            student = await db.get(Student, enrollment.student_id)
            unpaid_students.append({
                "student_id": student.id,
                "student_name": student.full_name,
                "balance": float(balance),
            })

    block_unpaid = await _get_config_bool(db, "block_completion_if_unpaid", True)
    if unpaid_students and block_unpaid and not force:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Section has unpaid students",
                "unpaid_students": unpaid_students,
            }
        )

    # Force override audit trail
    if force and (ungraded or unpaid_students):
        db.add(SectionCompletionOverride(
            section_id=section.id,
            overridden_by=current_user.id,
            bypass_grade_check=bool(ungraded),
            bypass_payment_check=bool(unpaid_students),
            reason=force_reason or "No reason provided",
            ungraded_students=[s["full_name"] for s in (ungraded or [])],
            unpaid_students=[s["student_name"] for s in (unpaid_students or [])],
        ))

    # Ledger settle
    if (
        section.contract
        and section.contract.status == ContractStatus.GRADES_SUBMITTED
        and current_user.id
    ):
        await ledger_settle_contract(db, section.contract.id, settled_by=current_user.id)

    section.status = "completed"

    # Certificates
    enrollments_result = await db.execute(
        select(Enrollment)
        .where(Enrollment.section_id == section_id, Enrollment.deleted_at.is_(None))
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.section).joinedload(CourseSection.course),
        )
    )
    for enrollment in enrollments_result.scalars().all():
        try:
            await create_certificate(db, enrollment, user_id=current_user.id)
        except Exception:
            continue

    await db.flush()
    return section


async def _section_has_payments(db: AsyncSession, section_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(exists().where(
            Payment.enrollment_id == Enrollment.id,
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        ))
    )
    return result.scalar() or False


async def deactivate_section(
    db: AsyncSession,
    section_id: uuid.UUID,
    current_user: User,
    reason: str | None = None,
) -> CourseSection:
    section = await db.get(CourseSection, section_id)
    if not section or section.deleted_at:
        raise HTTPException(status_code=404, detail="Section not found")

    if section.status != "active":
        raise HTTPException(status_code=400, detail="Only active sections can be deactivated")

    has_payments = await _section_has_payments(db, section_id)
    if has_payments and not reason:
        raise HTTPException(
            status_code=400,
            detail="Reason required: section has student payments recorded. "
                   "Provide a reason for deactivation."
        )

    result = await db.execute(
        select(SectionContract).where(SectionContract.section_id == section_id)
    )
    contract = result.scalar_one_or_none()
    if contract and contract.status == ContractStatus.ACTIVE:
        await ledger_deactivate_contract(
            db, contract, reason or "Manager deactivation", deactivated_by=current_user.id
        )

    section.status = "pending"
    await db.commit()
    await db.refresh(section)
    return section


# --- Student CRUD ---
async def create_student(db: AsyncSession, data: dict) -> Student:
    if "student_code" in data and data["student_code"]:
        existing = await db.execute(
            select(Student).where(
                Student.student_code == data["student_code"],
                Student.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student code already exists",
            )
    student = Student(**data)
    db.add(student)
    await db.flush()
    return student


async def get_student(db: AsyncSession, student_id: uuid.UUID) -> Optional[Student]:
    result = await db.execute(
        select(Student).where(Student.id == student_id, Student.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def find_student_by_code(
    db: AsyncSession, student_code: str
) -> Optional[Student]:
    result = await db.execute(
        select(Student).where(
            Student.student_code == student_code, Student.deleted_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def list_students(
    db: AsyncSession,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "full_name",
    sort_order: str = "asc",
) -> dict:
    query = select(Student).where(Student.deleted_at.is_(None))
    count_query = select(func.count(Student.id)).where(Student.deleted_at.is_(None))
    if search:
        pattern = f"%{search}%"
        filter_clause = or_(
            Student.full_name.ilike(pattern),
            Student.student_code.ilike(pattern),
            Student.email.ilike(pattern),
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)
    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(Student, sort_by, Student.full_name)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    items = result.scalars().all()
    return {"items": items, "total": total}


async def update_student(
    db: AsyncSession, student_id: uuid.UUID, data: dict
) -> Optional[Student]:
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
    student.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


# --- Enrollment CRUD ---
async def create_enrollment(
    db: AsyncSession,
    section_id: uuid.UUID,
    student_id: Optional[uuid.UUID] = None,
    admin_discount: Optional[float] = None,
    student_data: Optional[dict] = None,
) -> Optional[Enrollment]:
    if not student_id and student_data:
        existing = await find_student_by_code(db, student_data["student_code"])
        if existing:
            student_id = existing.id
        else:
            student = await create_student(db, student_data)
            student_id = student.id
    if not student_id:
        return None
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


async def get_enrollment(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> Optional[Enrollment]:
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.id == enrollment_id, Enrollment.deleted_at.is_(None)
        )
    )
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
    query = select(Enrollment).where(Enrollment.deleted_at.is_(None))
    count_query = select(func.count(Enrollment.id)).where(
        Enrollment.deleted_at.is_(None)
    )
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

    if items:
        enrollment_ids = [e.id for e in items]
        total_paid_rows = await db.execute(
            select(Payment.enrollment_id, func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.enrollment_id.in_(enrollment_ids))
            .group_by(Payment.enrollment_id)
        )
        total_paid_map = {row[0]: Decimal(str(row[1])) for row in total_paid_rows.all()}

        for e in items:
            total_paid = float(total_paid_map.get(e.id, Decimal("0")))
            agreed_price = float(e.agreed_price) if e.agreed_price is not None else None
            admin_discount = (
                float(e.admin_discount) if e.admin_discount is not None else None
            )
            net_price = agreed_price
            if agreed_price is not None and admin_discount is not None:
                net_price = agreed_price - (agreed_price * admin_discount / 100)
            balance = (net_price - total_paid) if net_price is not None else None
            e.total_paid = total_paid
            e.balance_remaining = balance

    return {"items": items, "total": total}


async def delete_enrollment(db: AsyncSession, enrollment_id: uuid.UUID) -> bool:
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        return False
    section = await get_course_section(db, enrollment.section_id)
    if section:
        section.enrolled_count -= 1
    enrollment.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def get_section_enrollments_detailed(
    db: AsyncSession, section_id: uuid.UUID
) -> list[dict]:
    result = await db.execute(
        select(Enrollment)
        .options(joinedload(Enrollment.student))
        .where(Enrollment.section_id == section_id, Enrollment.deleted_at.is_(None))
    )
    enrollments = result.scalars().all()

    if not enrollments:
        return []

    enrollment_ids = [e.id for e in enrollments]
    student_ids = [e.student_id for e in enrollments]

    total_paid_rows = await db.execute(
        select(Payment.enrollment_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id.in_(enrollment_ids))
        .group_by(Payment.enrollment_id)
    )
    total_paid_map = {row[0]: Decimal(str(row[1])) for row in total_paid_rows.all()}

    grade_rows = await db.execute(
        select(FinalGrade).where(
            FinalGrade.section_id == section_id,
            FinalGrade.student_id.in_(student_ids),
        )
    )
    grades = grade_rows.scalars().all()
    grade_map = {g.student_id: g for g in grades}

    results = []
    for e in enrollments:
        total_paid = total_paid_map.get(e.id, Decimal("0"))
        net_price = e.agreed_price
        if e.agreed_price is not None and e.admin_discount is not None:
            net_price = e.agreed_price - (e.agreed_price * e.admin_discount / 100)
        balance = (net_price - total_paid) if net_price is not None else None

        final_grade = grade_map.get(e.student_id)
        final_score = float(final_grade.final_score) if final_grade else None
        grade_label = get_grade_label(final_score) if final_score is not None else None

        results.append(
            {
                "id": e.id,
                "student_id": e.student_id,
                "section_id": e.section_id,
                "enrolled_at": e.enrolled_at,
                "agreed_price": e.agreed_price,
                "admin_discount": e.admin_discount,
                "student_name": e.student.full_name,
                "student_code": e.student.student_code,
                "student_email": e.student.email,
                "total_paid": total_paid,
                "balance_remaining": balance,
                "final_score": final_score,
                "grade_label": grade_label,
            }
        )

    return results


# --- Final Grade CRUD ---
async def set_final_grade(
    db: AsyncSession,
    section_id: uuid.UUID,
    student_id: uuid.UUID,
    final_score: float,
    graded_by: uuid.UUID,
    notes: Optional[str] = None,
) -> FinalGrade:
    result = await db.execute(
        select(FinalGrade).where(
            FinalGrade.section_id == section_id,
            FinalGrade.student_id == student_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.final_score = final_score
        existing.graded_by = graded_by
        existing.graded_at = datetime.now(timezone.utc)
        existing.notes = notes
    else:
        existing = FinalGrade(
            section_id=section_id,
            student_id=student_id,
            final_score=final_score,
            graded_by=graded_by,
            notes=notes,
        )
        db.add(existing)
    await db.flush()
    return existing


async def set_final_grades_bulk(
    db: AsyncSession,
    section_id: uuid.UUID,
    grades: list[dict],
    graded_by: uuid.UUID,
) -> list[FinalGrade]:
    results = []
    for g in grades:
        fg = await set_final_grade(
            db,
            section_id=section_id,
            student_id=g["student_id"],
            final_score=g["final_score"],
            graded_by=graded_by,
            notes=g.get("notes"),
        )
        results.append(fg)

    enrolled_count = (
        await db.scalar(
            select(func.count(Enrollment.id)).where(
                Enrollment.section_id == section_id,
                Enrollment.deleted_at.is_(None),
            )
        )
        or 0
    )

    graded_count = (
        await db.scalar(
            select(func.count(FinalGrade.id)).where(FinalGrade.section_id == section_id)
        )
        or 0
    )

    if enrolled_count > 0 and graded_count >= enrolled_count:
        try:
            await ledger_finalize_grades(db, section_id=section_id)
        except ValueError:
            pass

    return results


async def list_final_grades(
    db: AsyncSession,
    section_id: uuid.UUID,
) -> list[dict]:
    query = (
        select(FinalGrade, Student.full_name, Student.student_code)
        .join(Student, FinalGrade.student_id == Student.id)
        .where(FinalGrade.section_id == section_id)
        .order_by(Student.full_name)
    )
    result = await db.execute(query)
    rows = []
    for fg, student_name, student_code in result.all():
        rows.append(
            {
                "id": fg.id,
                "student_id": fg.student_id,
                "section_id": fg.section_id,
                "final_score": fg.final_score,
                "graded_by": fg.graded_by,
                "graded_at": fg.graded_at,
                "notes": fg.notes,
                "student_name": student_name,
                "student_code": student_code,
            }
        )
    return rows


async def get_student_final_grades(
    db: AsyncSession, student_id: uuid.UUID
) -> list[dict]:
    result = await db.execute(
        select(FinalGrade).where(FinalGrade.student_id == student_id)
    )
    grades = result.scalars().all()
    return [
        {
            "section_id": g.section_id,
            "final_score": float(g.final_score),
            "grade_label": get_grade_label(float(g.final_score)),
        }
        for g in grades
    ]


async def get_student_final_grade(
    db: AsyncSession,
    section_id: uuid.UUID,
    student_id: uuid.UUID,
) -> Optional[FinalGrade]:
    result = await db.execute(
        select(FinalGrade).where(
            FinalGrade.section_id == section_id,
            FinalGrade.student_id == student_id,
        )
    )
    return result.scalar_one_or_none()


# --- Section Lifecycle Helpers (Phase 3) ---

async def _count_enrolled_students(db: AsyncSession, section_id: uuid.UUID) -> int:
    result = await db.scalar(
        select(func.count(Enrollment.id)).where(
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        )
    )
    return result or 0


async def _get_ungraded_students(
    db: AsyncSession, section_id: uuid.UUID
) -> list[dict]:
    final_grades_table = FinalGrade.__table__
    enrollments_table = Enrollment.__table__
    students_table = Student.__table__

    query = (
        select(students_table.c.id, students_table.c.full_name)
        .select_from(
            enrollments_table.join(
                students_table,
                students_table.c.id == enrollments_table.c.student_id,
            ).outerjoin(
                final_grades_table,
                and_(
                    final_grades_table.c.section_id == enrollments_table.c.section_id,
                    final_grades_table.c.student_id == enrollments_table.c.student_id,
                ),
            )
        )
        .where(
            enrollments_table.c.section_id == section_id,
            enrollments_table.c.deleted_at.is_(None),
            final_grades_table.c.id.is_(None),
        )
    )
    result = await db.execute(query)
    return [{"id": str(row.id), "full_name": row.full_name} for row in result.all()]


def _calculate_net_price(enrollment: Enrollment) -> Decimal:
    net_price = enrollment.agreed_price or Decimal("0")
    if enrollment.agreed_price is not None and enrollment.admin_discount is not None:
        net_price = enrollment.agreed_price - (
            enrollment.agreed_price * enrollment.admin_discount / Decimal("100")
        )
    return Decimal(str(net_price)) if not isinstance(net_price, Decimal) else net_price


async def _sum_payments_for_enrollment(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> Decimal:
    result = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.enrollment_id == enrollment_id
        )
    )
    return Decimal(str(result))


async def _get_config_bool(
    db: AsyncSession, key: str, default: bool = True
) -> bool:
    result = await db.scalar(
        select(SectionLifecycleConfig.value).where(
            SectionLifecycleConfig.key == key
        )
    )
    if result is None:
        return default
    return result.lower() == "true"


async def _is_date_closed(db: AsyncSession, check_date: date) -> bool:
    result = await db.scalar(
        select(DailyJobsLog).where(
            DailyJobsLog.job_name == "daily_financial_close",
            DailyJobsLog.last_run_date == check_date,
        )
    )
    return result is not None
