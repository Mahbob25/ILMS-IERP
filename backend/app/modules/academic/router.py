import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.schemas import (
    CourseCreate, CourseUpdate, CourseResponse,
    CourseSectionCreate, CourseSectionUpdate, CourseSectionResponse, SectionActivate,
    StudentCreate, StudentUpdate, StudentResponse,
    EnrollmentCreate, EnrollmentCreateWithStudent, EnrollmentResponse, EnrollmentDetailResponse,
    FinalGradeCreate, FinalGradeBulkCreate, FinalGradeResponse, StudentGradeSummary,
    CertificateResponse,
    PaginatedResponse,
)
from app.modules.academic import service as academic_service
from app.modules.academic import certificate_service

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
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
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
    section = await academic_service.activate_section(db, section_id, data.teacher_percentage)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot activate: insufficient enrollment or section not in pending status"
        )
    return section

@academic_router.post("/course-sections/{section_id}/complete", response_model=CourseSectionResponse)
async def complete_section(
    section_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    section = await academic_service.complete_section(db, section_id, user_id=current_user.id)
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
