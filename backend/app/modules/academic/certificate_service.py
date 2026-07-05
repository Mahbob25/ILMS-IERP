import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy import func, extract, or_
from app.modules.academic.models import Certificate, CourseSection, Course, Enrollment, Student, FinalGrade


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


CERTIFICATE_HTML_TEMPLATE = """<!DOCTYPE html>
<html dir="{dir}">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap');

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}

  body {{
    font-family: {font_family};
    background: #f0f2f5;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
  }}

  .certificate {{
    width: 800px;
    max-width: 100%;
    background: #fff;
    border: 3px solid #1e293b;
    padding: 50px 50px;
    text-align: center;
    position: relative;
  }}

  .certificate::before {{
    content: '';
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    bottom: 8px;
    border: 1px solid #cbd5e1;
    pointer-events: none;
  }}

  .institution {{
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: #64748b;
    margin-bottom: 30px;
  }}

  .title {{
    font-size: 32px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 24px;
    text-transform: uppercase;
    letter-spacing: 2px;
  }}

  .subtitle {{
    font-size: 14px;
    color: #64748b;
    margin-bottom: 8px;
  }}

  .student-name {{
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
    margin: 24px 0;
    padding: 12px 0;
    border-top: 2px solid #e2e8f0;
    border-bottom: 2px solid #e2e8f0;
  }}

  .course-name {{
    font-size: 18px;
    color: #334155;
    margin-bottom: 30px;
  }}

  .details {{
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 30px 50px;
    margin-top: 30px;
    font-size: 12px;
    color: #64748b;
  }}

  .details div {{
    min-width: 140px;
  }}

  .details span {{
    display: block;
  }}

  .details strong {{
    display: block;
    color: #1e293b;
    font-size: 13px;
    margin-top: 3px;
  }}

  .grade-row {{
    margin-top: 24px;
    display: flex;
    justify-content: center;
    gap: 40px;
    font-size: 14px;
  }}

  .grade-item {{
    padding: 8px 24px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }}

  .grade-item .label {{
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1px;
  }}

  .grade-item .value {{
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }}

  .seal {{
    margin-top: 40px;
    width: 70px;
    height: 70px;
    border: 2px solid #1e293b;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 1px;
  }}

  .footer {{
    margin-top: 32px;
    font-size: 10px;
    color: #94a3b8;
  }}
</style>
</head>
<body>
  <div class="certificate">
    <div class="institution">{institution}</div>
    <div class="title">{certificate_title}</div>
    <div class="subtitle">{presented_to}</div>
    <div class="student-name">{student_name}</div>
    <div class="course-name">{course_label}: <strong>{course_name}</strong></div>

    {result_block}

    <div class="details">
      <div>{student_id_label} <strong>{student_id_no}</strong></div>
      <div>{cert_number_label} <strong>{certificate_number}</strong></div>
      <div>{issue_date_label} <strong>{issue_date}</strong></div>
      <div>{duration_label} <strong>{duration_text}</strong></div>
      <div>{hours_label} <strong>{total_hours}</strong></div>
    </div>
    <div class="seal">{seal_text}</div>
    <div class="footer">{footer_text}</div>
  </div>
</body>
</html>"""


CERTIFICATE_HTML_EN = {
    "certificate_title": "Certificate of Completion",
    "presented_to": "Presented to",
    "course_label": "Course",
    "result_label": "Final Result",
    "grade_label": "Grade",
    "student_id_label": "Student ID",
    "cert_number_label": "Certificate No.",
    "issue_date_label": "Issue Date",
    "duration_label": "Duration",
    "hours_label": "Total Hours",
    "seal_text": "LCS Institute",
    "footer_text": "Languages Computer Science and Studies Institute",
    "font_family": "'Inter', 'Arial', sans-serif",
    "dir": "ltr",
}

CERTIFICATE_HTML_AR = {
    "certificate_title": "شهادة إتمام",
    "presented_to": "يُمنح لـ",
    "course_label": "المقرر",
    "result_label": "النتيجة النهائية",
    "grade_label": "التقدير",
    "student_id_label": "رقم الطالب",
    "cert_number_label": "رقم الشهادة",
    "issue_date_label": "تاريخ الإصدار",
    "duration_label": "المدة",
    "hours_label": "عدد الساعات",
    "seal_text": "معهد LCS",
    "footer_text": "معهد اللغات وعلوم الحاسب والدراسات",
    "font_family": "'Cairo', 'Arial', sans-serif",
    "dir": "rtl",
}


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
    student_id_no: str = "",
    duration_text: str = "",
    total_hours: str = "",
) -> str:
    labels = CERTIFICATE_HTML_AR if locale == "ar" else CERTIFICATE_HTML_EN
    institution = "Languages Computer Science and Studies Institute"
    issue_date = issued_at.strftime("%Y-%m-%d") if issued_at else ""

    if final_score is not None and grade_label:
        result_block = f"""<div class="grade-row">
      <div class="grade-item"><span class="label">{labels["result_label"]}</span><span class="value">{final_score:.1f}%</span></div>
      <div class="grade-item"><span class="label">{labels["grade_label"]}</span><span class="value">{grade_label}</span></div>
    </div>"""
    else:
        result_block = ""

    html = CERTIFICATE_HTML_TEMPLATE.format(
        institution=institution,
        certificate_title=labels["certificate_title"],
        presented_to=labels["presented_to"],
        student_name=student_name,
        course_name=course_name,
        course_label=labels["course_label"],
        result_block=result_block,
        student_id_label=labels["student_id_label"],
        student_id_no=student_id_no or "—",
        certificate_number=certificate_number,
        issue_date=issue_date,
        cert_number_label=labels["cert_number_label"],
        issue_date_label=labels["issue_date_label"],
        duration_label=labels["duration_label"],
        duration_text=duration_text or "—",
        hours_label=labels["hours_label"],
        total_hours=total_hours or "—",
        seal_text=labels["seal_text"],
        footer_text=labels["footer_text"],
        font_family=labels["font_family"],
        dir=labels["dir"],
    )
    return html


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
    duration_text = ""
    if section.start_date and section.end_date:
        duration_text = f"{section.start_date.strftime('%Y-%m-%d')} – {section.end_date.strftime('%Y-%m-%d')}"
    total_hours_text = ""
    if section.class_duration_minutes:
        total_hours_text = f"{section.class_duration_minutes / 60:.1f}h"
    return _generate_certificate_html(
        student_name=cert.student_name,
        course_name=cert.course_name,
        certificate_number=cert.certificate_number,
        issued_at=cert.issued_at,
        locale=locale,
        final_score=float(cert.final_score) if cert.final_score is not None else None,
        grade_label=cert.grade_label,
        student_id_no=cert.student_id_no or "",
        duration_text=duration_text,
        total_hours=total_hours_text,
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
