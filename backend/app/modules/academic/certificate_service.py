import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import func, extract, or_
from app.modules.academic.models import Certificate, CourseSection, Course, Enrollment, Student, FinalGrade
from app.core.templates import template_engine


def get_grade_label(score: float) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 80:
        return "Very Good"
    if score >= 70:
        return "Good"
    if score >= 60:
        return "Pass"
    return "Fail"


async def _next_certificate_number(db: AsyncSession) -> str:
    year = datetime.now(timezone.utc).year
    count_result = await db.execute(
        select(func.count(Certificate.id)).where(
            extract('year', Certificate.issued_at) == year,
            Certificate.deleted_at.is_(None)
        )
    )
    count = count_result.scalar() or 0
    return f"CERT-{year}-{count + 1:06d}"


def _generate_certificate_html(
    student_name: str,
    course_name: str,
    certificate_number: str,
    issued_at: datetime,
    locale: str = "ar",
    final_score: Optional[float] = None,
    grade_label: Optional[str] = None,
    start_date: str = "",
    end_date: str = "",
) -> str:
    issue_date = issued_at.strftime("%Y/%m/%d") if issued_at else ""
    grade_text = f"{final_score:.1f}% - {grade_label}" if final_score is not None and grade_label else ""

    variables = {
        "student_name_en": student_name,
        "course_name_en": course_name,
        "start_date": start_date,
        "end_date": end_date,
        "grade_en": grade_text,
        "student_name_ar": student_name,
        "course_name_ar": course_name,
        "grade_ar": grade_text,
        "issue_number": certificate_number,
        "issue_date": issue_date,
    }
    return template_engine.render_certificate(variables)


async def create_certificate(
    db: AsyncSession,
    enrollment: Enrollment,
    user_id: Optional[uuid.UUID] = None,
) -> Certificate:
    section = enrollment.section
    course = section.course
    student = enrollment.student

    existing = await db.execute(
        select(Certificate).where(
            Certificate.student_id == student.id,
            Certificate.section_id == section.id,
            Certificate.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Certificate already exists for this student and section"
        )

    final_grade_result = await db.execute(
        select(FinalGrade).where(
            FinalGrade.section_id == section.id,
            FinalGrade.student_id == student.id,
        )
    )
    final_grade = final_grade_result.scalar_one_or_none()

    final_score = final_grade.final_score if final_grade else None
    grade_label_text = get_grade_label(final_grade.final_score) if final_grade else None

    certificate_number = await _next_certificate_number(db)
    now = datetime.now(timezone.utc)

    cert = Certificate(
        student_id=student.id,
        section_id=section.id,
        enrollment_id=enrollment.id,
        certificate_number=certificate_number,
        course_name=course.name,
        student_name=student.full_name,
        issued_at=now,
        final_score=final_score,
        grade_label=grade_label_text,
        student_id_no=student.student_code,
        extra_data={
            "course_code": course.code,
            "student_code": student.student_code,
        },
    )
    db.add(cert)
    await db.flush()

    return cert


async def get_certificate(db: AsyncSession, cert_id: uuid.UUID) -> Optional[Certificate]:
    result = await db.execute(
        select(Certificate)
        .options(joinedload(Certificate.section))
        .where(Certificate.id == cert_id, Certificate.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_certificate_html_content(
    db: AsyncSession,
    cert_id: uuid.UUID,
    locale: str = "ar",
) -> Optional[str]:
    result = await db.execute(
        select(Certificate)
        .options(joinedload(Certificate.section))
        .where(Certificate.id == cert_id, Certificate.deleted_at.is_(None))
    )
    cert = result.scalar_one_or_none()
    if not cert:
        return None
    section = cert.section
    start_date_str = section.start_date.strftime('%Y-%m-%d') if section.start_date else ""
    end_date_str = section.end_date.strftime('%Y-%m-%d') if section.end_date else ""
    return _generate_certificate_html(
        student_name=cert.student_name,
        course_name=cert.course_name,
        certificate_number=cert.certificate_number,
        issued_at=cert.issued_at,
        locale=locale,
        final_score=float(cert.final_score) if cert.final_score is not None else None,
        grade_label=cert.grade_label,
        start_date=start_date_str,
        end_date=end_date_str,
    )


async def list_certificates(
    db: AsyncSession,
    student_id: Optional[uuid.UUID] = None,
    section_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "issued_at",
    sort_order: str = "desc",
    teacher_id: Optional[uuid.UUID] = None,
) -> dict:
    query = (
        select(Certificate)
        .options(joinedload(Certificate.section))
        .where(Certificate.deleted_at.is_(None))
    )
    count_query = select(func.count(Certificate.id)).where(Certificate.deleted_at.is_(None))

    if student_id:
        query = query.where(Certificate.student_id == student_id)
        count_query = count_query.where(Certificate.student_id == student_id)
    if section_id:
        query = query.where(Certificate.section_id == section_id)
        count_query = count_query.where(Certificate.section_id == section_id)
    if teacher_id:
        query = query.join(Certificate.section).where(CourseSection.teacher_id == teacher_id)
        count_query = count_query.join(Certificate.section).where(CourseSection.teacher_id == teacher_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Certificate.student_name.ilike(pattern),
                Certificate.course_name.ilike(pattern),
                Certificate.certificate_number.ilike(pattern),
            )
        )
        count_query = count_query.where(
            or_(
                Certificate.student_name.ilike(pattern),
                Certificate.course_name.ilike(pattern),
                Certificate.certificate_number.ilike(pattern),
            )
        )

    total = (await db.execute(count_query)).scalar() or 0
    sort_col = getattr(Certificate, sort_by, Certificate.issued_at)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    result = await db.execute(
        query.order_by(order).offset(skip).limit(limit)
    )
    items = result.scalars().all()
    return {"items": items, "total": total}


async def delete_certificate(db: AsyncSession, cert_id: uuid.UUID) -> bool:
    cert = await get_certificate(db, cert_id)
    if not cert:
        return False
    cert.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def delete_certificates_batch(db: AsyncSession, cert_ids: list[uuid.UUID]) -> dict:
    deleted_count = 0
    errors: list[str] = []

    for cert_id in cert_ids:
        try:
            cert = await get_certificate(db, cert_id)
            if not cert:
                errors.append(f"Certificate {cert_id} not found")
                continue
            cert.deleted_at = datetime.now(timezone.utc)
            await db.flush()
            deleted_count += 1
        except Exception as e:
            errors.append(f"Certificate {cert_id}: {str(e)}")

    return {"deleted_count": deleted_count, "errors": errors}
