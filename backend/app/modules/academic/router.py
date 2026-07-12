import uuid
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.schemas import (
    CourseCreate, CourseUpdate, CourseResponse,
    CourseSectionCreate, CourseSectionUpdate, CourseSectionResponse, SectionActivate,
    StudentCreate, StudentUpdate, StudentResponse,
    EnrollmentCreate, EnrollmentCreateWithStudent, EnrollmentResponse, EnrollmentDetailResponse,
    FinalGradeCreate, FinalGradeBulkCreate, FinalGradeResponse, StudentGradeSummary,
    CertificateResponse, DeactivateRequest,
    PaginatedResponse,
)
from app.modules.academic import service as academic_service
from app.modules.academic import certificate_service
from app.modules.academic import cancellation_service
from app.modules.academic import reconciliation_service
from app.modules.academic.models import (
    CourseSection, SectionCancellation, SectionCompletionOverride,
    PendingRefund, Refund, DailyJobsLog,
)
from app.core.timezone import get_today

academic_router = APIRouter(prefix="/academic", tags=["academic"])


# --- Courses ---
@academic_router.get("/courses", response_model=PaginatedResponse[CourseResponse])
async def list_courses(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.list_courses(db, search=search, skip=skip, limit=limit, sort_by=sort_by, sort_order=sort_order)

@academic_router.post("/courses", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    data: CourseCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.create_course(db, data.model_dump())

@academic_router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: uuid.UUID,
    data: CourseUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    cleaned = {k: v for k, v in data.model_dump().items() if v is not None}
    course = await academic_service.update_course(db, course_id, cleaned)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course

@academic_router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await academic_service.delete_course(db, course_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")


# --- Course Sections ---
@academic_router.get("/course-sections", response_model=PaginatedResponse[CourseSectionResponse])
async def list_course_sections(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    sort_by: str = Query("id"),
    sort_order: str = Query("asc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_id = None
    if current_user.role.name == "teacher":
        teacher_id = current_user.employee_id
    return await academic_service.list_course_sections(
        db, teacher_id=teacher_id, search=search, status=status,
        skip=skip, limit=limit, sort_by=sort_by, sort_order=sort_order
    )

@academic_router.post("/course-sections", response_model=CourseSectionResponse, status_code=status.HTTP_201_CREATED)
async def create_course_section(
    data: CourseSectionCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.create_course_section(db, data.model_dump())

@academic_router.put("/course-sections/{section_id}", response_model=CourseSectionResponse)
async def update_course_section(
    section_id: uuid.UUID,
    data: CourseSectionUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    cleaned = {k: v for k, v in data.model_dump().items() if v is not None}
    section = await academic_service.update_course_section(db, section_id, cleaned)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course section not found")
    return section

@academic_router.delete("/course-sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_section(
    section_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can delete sections")
    deleted = await academic_service.delete_course_section(db, section_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course section not found")

@academic_router.post("/course-sections/{section_id}/activate", response_model=CourseSectionResponse)
async def activate_section(
    section_id: uuid.UUID,
    data: SectionActivate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    sec = await academic_service.get_course_section(db, section_id)
    if not sec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if sec.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section is not in pending status"
        )
    missing = []
    if sec.price is None:
        missing.append("price")
    if sec.teacher_id is None:
        missing.append("teacher")
    if sec.start_date is None:
        missing.append("start_date")
    if sec.class_time is None:
        missing.append("class_time")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot activate section. Missing required fields: {', '.join(missing)}"
        )
    section = await academic_service.activate_section(db, section_id, data.teacher_percentage, activated_by=current_user.id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot activate: insufficient enrollment"
        )
    return section

@academic_router.post("/course-sections/{section_id}/complete", response_model=CourseSectionResponse)
async def complete_section_endpoint(
    section_id: uuid.UUID,
    force: bool = Body(False),
    reason: str = Body(None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    if force and not reason:
        raise HTTPException(status_code=400, detail="reason is required when force=true")
    section = await academic_service.complete_section(
        db, section_id, current_user, force=force, force_reason=reason
    )
    if not section:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete: section not in active status"
        )
    return section


# --- Certificates ---
@academic_router.get("/certificates", response_model=PaginatedResponse[CertificateResponse])
async def list_certificates(
    student_id: Optional[uuid.UUID] = Query(None),
    section_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    sort_by: str = Query("issued_at"),
    sort_order: str = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_id = None
    if current_user.role.name == "teacher":
        teacher_id = current_user.employee_id
    result = await certificate_service.list_certificates(
        db, student_id=student_id, section_id=section_id, search=search,
        skip=skip, limit=limit, sort_by=sort_by, sort_order=sort_order,
        teacher_id=teacher_id
    )
    items = []
    for cert in result["items"]:
        section = cert.section
        duration_text = _section_duration_text(section)
        total_hours = _section_total_hours(section)
        cert_dict = {
            "id": cert.id,
            "student_id": cert.student_id,
            "section_id": cert.section_id,
            "certificate_number": cert.certificate_number,
            "course_name": cert.course_name,
            "student_name": cert.student_name,
            "issued_at": cert.issued_at,
            "final_score": float(cert.final_score) if cert.final_score is not None else None,
            "grade_label": cert.grade_label,
            "student_id_no": cert.student_id_no,
            "student_code": cert.extra_data.get("student_code") if cert.extra_data else None,
            "course_code": cert.extra_data.get("course_code") if cert.extra_data else None,
            "duration_text": duration_text,
            "total_hours": total_hours,
        }
        items.append(cert_dict)
    return {"items": items, "total": result["total"]}


def _section_duration_text(section) -> str:
    if section.start_date and section.end_date:
        return f"{section.start_date.strftime('%Y-%m-%d')} – {section.end_date.strftime('%Y-%m-%d')}"
    return ""


def _section_total_hours(section) -> str:
    if section.class_duration_minutes:
        return f"{section.class_duration_minutes / 60:.1f}h"
    return ""


@academic_router.get("/certificates/{cert_id}", response_model=CertificateResponse)
async def get_certificate(
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    cert = await certificate_service.get_certificate(db, cert_id)
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    section = cert.section
    return {
        "id": cert.id,
        "student_id": cert.student_id,
        "section_id": cert.section_id,
        "certificate_number": cert.certificate_number,
        "course_name": cert.course_name,
        "student_name": cert.student_name,
        "issued_at": cert.issued_at,
        "final_score": float(cert.final_score) if cert.final_score is not None else None,
        "grade_label": cert.grade_label,
        "student_id_no": cert.student_id_no,
        "student_code": cert.extra_data.get("student_code") if cert.extra_data else None,
        "course_code": cert.extra_data.get("course_code") if cert.extra_data else None,
        "duration_text": _section_duration_text(section),
        "total_hours": _section_total_hours(section),
    }


@academic_router.get("/certificates/{cert_id}/preview")
async def preview_certificate(
    cert_id: uuid.UUID,
    locale: str = Query("ar"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    html = await certificate_service.get_certificate_html_content(db, cert_id, locale=locale)
    if not html:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


@academic_router.get("/students/{student_id}/certificates", response_model=PaginatedResponse[CertificateResponse])
async def list_student_certificates(
    student_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await certificate_service.list_certificates(
        db, student_id=student_id, skip=skip, limit=limit
    )
    items = []
    for cert in result["items"]:
        section = cert.section
        cert_dict = {
            "id": cert.id,
            "student_id": cert.student_id,
            "section_id": cert.section_id,
            "certificate_number": cert.certificate_number,
            "course_name": cert.course_name,
            "student_name": cert.student_name,
            "issued_at": cert.issued_at,
            "final_score": float(cert.final_score) if cert.final_score is not None else None,
            "grade_label": cert.grade_label,
            "student_id_no": cert.student_id_no,
            "student_code": cert.extra_data.get("student_code") if cert.extra_data else None,
            "course_code": cert.extra_data.get("course_code") if cert.extra_data else None,
            "duration_text": _section_duration_text(section),
            "total_hours": _section_total_hours(section),
        }
        items.append(cert_dict)
    return {"items": items, "total": result["total"]}


@academic_router.get("/students/{student_id}/final-grades", response_model=list[StudentGradeSummary])
async def get_student_final_grades(
    student_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.get_student_final_grades(db, student_id)


@academic_router.delete("/certificates/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certificate(
    cert_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await certificate_service.delete_certificate(db, cert_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")


# --- Final Grades ---
@academic_router.put("/sections/{section_id}/final-grades", response_model=list[FinalGradeResponse])
async def set_section_final_grades(
    section_id: uuid.UUID,
    data: FinalGradeBulkCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    section = None
    if current_user.role.name == "teacher":
        section = await academic_service.get_course_section(db, section_id)
        if not section or section.teacher_id != current_user.employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this section")

    if not section:
        section = await academic_service.get_course_section(db, section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if section.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot set grades for a section that is not active")

    grades_data = [g.model_dump() for g in data.grades]
    results = await academic_service.set_final_grades_bulk(
        db, section_id=section_id, grades=grades_data, graded_by=current_user.id
    )
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "section_id": r.section_id,
            "final_score": r.final_score,
            "graded_by": r.graded_by,
            "graded_at": r.graded_at,
            "notes": r.notes,
        }
        for r in results
    ]


@academic_router.get("/sections/{section_id}/final-grades", response_model=list[FinalGradeResponse])
async def list_section_final_grades(
    section_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name == "teacher":
        section = await academic_service.get_course_section(db, section_id)
        if not section or section.teacher_id != current_user.employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this section")

    return await academic_service.list_final_grades(db, section_id=section_id)


# --- Students ---
@academic_router.get("/students", response_model=PaginatedResponse[StudentResponse])
async def list_students(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    sort_by: str = Query("full_name"),
    sort_order: str = Query("asc"),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.list_students(db, search=search, skip=skip, limit=limit, sort_by=sort_by, sort_order=sort_order)

@academic_router.post("/students", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    data: StudentCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.create_student(db, data.model_dump())

@academic_router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: uuid.UUID,
    data: StudentUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    cleaned = {k: v for k, v in data.model_dump().items() if v is not None}
    student = await academic_service.update_student(db, student_id, cleaned)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student

@academic_router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await academic_service.delete_student(db, student_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")


# --- Enrollments ---
@academic_router.get("/enrollments", response_model=PaginatedResponse[EnrollmentResponse])
async def list_enrollments(
    section_id: Optional[uuid.UUID] = Query(None),
    student_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
    sort_by: str = Query("enrolled_at"),
    sort_order: str = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_employee_id = None
    if current_user.role.name == "teacher":
        teacher_employee_id = current_user.employee_id
    if section_id and teacher_employee_id:
        section = await academic_service.get_course_section(db, section_id)
        if not section or section.teacher_id != teacher_employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this section's enrollments")
    return await academic_service.list_enrollments(
        db, section_id=section_id, student_id=student_id, search=search,
        skip=skip, limit=limit, sort_by=sort_by, sort_order=sort_order
    )

@academic_router.post("/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def create_enrollment(
    data: EnrollmentCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    if data.admin_discount is not None and current_user.role.name not in ("superadmin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can set discounts")
    enrollment = await academic_service.create_enrollment(
        db, section_id=data.section_id, student_id=data.student_id,
        admin_discount=data.admin_discount
    )
    if enrollment is None:
        section = await academic_service.get_course_section(db, data.section_id)
        if not section:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Section is full or enrollment already exists")
    return enrollment

@academic_router.post("/enrollments/with-student", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def create_enrollment_with_student(
    data: EnrollmentCreateWithStudent,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    if data.admin_discount is not None and current_user.role.name not in ("superadmin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can set discounts")
    student_data = None
    if not data.student_id and data.student_code and data.full_name:
        student_data = {
            "student_code": data.student_code,
            "full_name": data.full_name,
            "email": data.email,
        }
    enrollment = await academic_service.create_enrollment(
        db, section_id=data.section_id, student_id=data.student_id,
        admin_discount=data.admin_discount, student_data=student_data
    )
    if enrollment is None:
        section = await academic_service.get_course_section(db, data.section_id)
        if not section:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Section is full or enrollment already exists")
    return enrollment

@academic_router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_enrollment(
    enrollment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await academic_service.delete_enrollment(db, enrollment_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")

@academic_router.get("/sections/{section_id}/enrollments/detailed", response_model=list[EnrollmentDetailResponse])
async def get_section_enrollments_detailed(
    section_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_employee_id = None
    if current_user.role.name == "teacher":
        teacher_employee_id = current_user.employee_id
    if teacher_employee_id:
        section = await academic_service.get_course_section(db, section_id)
        if not section or section.teacher_id != teacher_employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this section")
    return await academic_service.get_section_enrollments_detailed(db, section_id)


# --- Section Cancellation Management ---
@academic_router.get("/course-sections/{section_id}/cancel-preview")
async def get_cancel_preview(
    section_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    try:
        preview = await cancellation_service.preview_cancellation_impact(db, section_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return {
        "section_id": str(preview.section_id),
        "teacher_reversal_amount": float(preview.teacher_wallet_reversal_amount),
        "teacher_wallet_balance": float(preview.teacher_wallet_balance),
        "teacher_wallet_frozen_balance": float(preview.teacher_wallet_frozen_balance),
        "teacher_wallet_available_balance": float(preview.teacher_wallet_available_balance),
        "shortfall": float(preview.shortfall),
        "enrolled_count": preview.enrolled_count,
        "payments_collected": float(preview.payments_collected),
        "has_attendance_records": preview.has_attendance_records,
        "has_final_grades": preview.has_final_grades,
        "has_certificates": preview.has_certificates,
        "warnings": [],
    }


@academic_router.post("/course-sections/{section_id}/cancel")
async def cancel_section_endpoint(
    section_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    reason = body.get("reason")
    refund_policy = body.get("refund_policy")
    force_cancellation = body.get("force_cancellation", False)

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason is required"
        )
    if refund_policy not in ("authorize_refunds", "no_refund"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="refund_policy must be 'authorize_refunds' or 'no_refund'"
        )

    try:
        cancellation = await cancellation_service.cancel_section(
            db, section_id=section_id,
            cancelled_by=current_user.id,
            reason=reason.strip(),
            refund_policy=refund_policy,
            force_cancellation=force_cancellation,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    return {
        "success": True,
        "section_cancellation_id": str(cancellation.id),
    }


@academic_router.get("/course-sections/{section_id}/cancellation")
async def get_cancellation_detail(
    section_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    cancellation = await cancellation_service.get_cancellation_detail(db, section_id)
    if not cancellation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No cancellation record found for this section"
        )
    return {
        "id": cancellation.id,
        "section_id": cancellation.section_id,
        "cancelled_by": cancellation.cancelled_by,
        "cancelled_at": cancellation.cancelled_at,
        "reason": cancellation.reason,
        "refund_policy": cancellation.refund_policy,
        "teacher_wallet_reversal_amount": float(cancellation.teacher_wallet_reversal_amount),
        "total_payments_collected": float(cancellation.total_payments_collected),
        "total_refund_authorized": float(cancellation.total_refund_authorized),
        "enrolled_student_count": cancellation.enrolled_student_count,
        "has_attendance_records": cancellation.has_attendance_records,
        "has_final_grades": cancellation.has_final_grades,
        "has_certificates": cancellation.has_certificates,
    }


# --- Deactivation ---
@academic_router.post("/course-sections/{section_id}/deactivate")
async def deactivate_section_endpoint(
    section_id: uuid.UUID,
    body: DeactivateRequest = Body(...),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db),
):
    section = await academic_service.deactivate_section(
        db, section_id, current_user, reason=body.reason
    )
    return {
        "success": True,
        "message": f"Section {section_id} deactivated to pending status",
    }


# --- Phase 7: Reconciliation & Monitoring ---

@academic_router.get("/sections/daily-reconciliation")
async def get_daily_reconciliation(
    date: date = Query(default_factory=get_today),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
):
    return await reconciliation_service.generate_daily_reconciliation_report(db, date)


@academic_router.get("/admin/audit/cancellations")
async def list_cancellations(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    manager_id: Optional[uuid.UUID] = Query(None),
    section_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
):
    query = (
        select(SectionCancellation)
        .options(
            joinedload(SectionCancellation.section).joinedload(CourseSection.course),
            joinedload(SectionCancellation.cancelled_by_user),
        )
    )
    count_query = select(func.count(SectionCancellation.id))

    if date_from:
        query = query.where(func.date(SectionCancellation.cancelled_at) >= date_from)
        count_query = count_query.where(func.date(SectionCancellation.cancelled_at) >= date_from)
    if date_to:
        query = query.where(func.date(SectionCancellation.cancelled_at) <= date_to)
        count_query = count_query.where(func.date(SectionCancellation.cancelled_at) <= date_to)
    if manager_id:
        query = query.where(SectionCancellation.cancelled_by == manager_id)
        count_query = count_query.where(SectionCancellation.cancelled_by == manager_id)
    if section_id:
        query = query.where(SectionCancellation.section_id == section_id)
        count_query = count_query.where(SectionCancellation.section_id == section_id)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(SectionCancellation.cancelled_at.desc()).offset(offset).limit(per_page)
    )
    items = result.scalars().all()

    data = []
    for c in items:
        section = c.section
        course_name = section.course.name if section and section.course else ""
        cancelled_by_name = c.cancelled_by_user.full_name if c.cancelled_by_user else ""
        data.append({
            "id": str(c.id),
            "section_id": str(c.section_id),
            "course_name": course_name,
            "cancelled_by": str(c.cancelled_by),
            "cancelled_by_name": cancelled_by_name,
            "cancelled_at": c.cancelled_at.isoformat(),
            "reason": c.reason,
            "refund_policy": c.refund_policy,
            "teacher_wallet_reversal_amount": float(c.teacher_wallet_reversal_amount),
            "total_payments_collected": float(c.total_payments_collected),
            "total_refund_authorized": float(c.total_refund_authorized),
            "enrolled_student_count": c.enrolled_student_count,
        })

    return {
        "data": data,
        "meta": {"total": total, "page": page, "per_page": per_page},
    }


@academic_router.get("/admin/audit/overrides")
async def list_overrides(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
):
    query = (
        select(SectionCompletionOverride)
        .options(
            joinedload(SectionCompletionOverride.section).joinedload(CourseSection.course),
            joinedload(SectionCompletionOverride.overridden_by_user),
        )
    )
    count_query = select(func.count(SectionCompletionOverride.id))

    if date_from:
        query = query.where(func.date(SectionCompletionOverride.overridden_at) >= date_from)
        count_query = count_query.where(func.date(SectionCompletionOverride.overridden_at) >= date_from)
    if date_to:
        query = query.where(func.date(SectionCompletionOverride.overridden_at) <= date_to)
        count_query = count_query.where(func.date(SectionCompletionOverride.overridden_at) <= date_to)

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(SectionCompletionOverride.overridden_at.desc()).offset(offset).limit(per_page)
    )
    items = result.scalars().all()

    data = []
    for o in items:
        section = o.section
        section_label = ""
        if section and section.course:
            section_label = f"{section.course.name} ({str(section.id)[:8]})"
        overridden_by_name = o.overridden_by_user.full_name if o.overridden_by_user else ""
        data.append({
            "id": str(o.id),
            "section_id": str(o.section_id),
            "section_label": section_label,
            "overridden_by": str(o.overridden_by),
            "overridden_by_name": overridden_by_name,
            "overridden_at": o.overridden_at.isoformat(),
            "bypass_grade_check": o.bypass_grade_check,
            "bypass_payment_check": o.bypass_payment_check,
            "reason": o.reason,
            "ungraded_students": o.ungraded_students,
            "unpaid_students": o.unpaid_students,
        })

    return {
        "data": data,
        "meta": {"total": total, "page": page, "per_page": per_page},
    }


@academic_router.get("/sections/financial-impact")
async def get_financial_impact(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
):
    from app.core.timezone import get_today
    today = get_today()
    ytd_start = date(today.year, 1, 1)

    teacher_reversal_result = await db.execute(
        select(func.coalesce(func.sum(SectionCancellation.teacher_wallet_reversal_amount), 0))
        .where(func.date(SectionCancellation.cancelled_at) >= ytd_start)
    )
    total_teacher_wallet_reversed_ytd = float(teacher_reversal_result.scalar() or 0)

    refunds_authorized_result = await db.execute(
        select(func.coalesce(func.sum(SectionCancellation.total_refund_authorized), 0))
        .where(func.date(SectionCancellation.cancelled_at) >= ytd_start)
    )
    total_refunds_authorized_ytd = float(refunds_authorized_result.scalar() or 0)

    refunds_disbursed_result = await db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0))
        .where(func.date(Refund.disbursed_at) >= ytd_start)
    )
    total_refunds_disbursed_ytd = float(refunds_disbursed_result.scalar() or 0)

    unclaimed_liability_result = await db.execute(
        select(func.coalesce(func.sum(PendingRefund.amount), 0))
        .where(PendingRefund.status == "UNCLAIMED")
    )
    unclaimed_refund_liability = float(unclaimed_liability_result.scalar() or 0)

    sections_cancelled_ytd_result = await db.execute(
        select(func.count(SectionCancellation.id))
        .where(func.date(SectionCancellation.cancelled_at) >= ytd_start)
    )
    sections_cancelled_ytd = sections_cancelled_ytd_result.scalar() or 0

    overrides_ytd_result = await db.execute(
        select(func.count(SectionCompletionOverride.id))
        .where(func.date(SectionCompletionOverride.overridden_at) >= ytd_start)
    )
    overrides_ytd = overrides_ytd_result.scalar() or 0

    return {
        "total_teacher_wallet_reversed_ytd": total_teacher_wallet_reversed_ytd,
        "total_refunds_authorized_ytd": total_refunds_authorized_ytd,
        "total_refunds_disbursed_ytd": total_refunds_disbursed_ytd,
        "unclaimed_refund_liability": unclaimed_refund_liability,
        "sections_cancelled_ytd": sections_cancelled_ytd,
        "overrides_ytd": overrides_ytd,
    }


@academic_router.get("/health/startup-checks")
async def check_startup_health(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyJobsLog)
        .where(DailyJobsLog.job_name == "section_daily_check")
        .order_by(DailyJobsLog.last_run_date.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()
    today = get_today()
    return {
        "last_run_date": record.last_run_date.isoformat() if record else None,
        "healthy": record is not None and record.last_run_date >= today - timedelta(days=1),
    }
