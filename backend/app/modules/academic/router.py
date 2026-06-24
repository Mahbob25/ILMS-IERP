import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.schemas import (
    CourseCreate, CourseUpdate, CourseResponse,
    CourseSectionCreate, CourseSectionUpdate, CourseSectionResponse,
    StudentCreate, StudentUpdate, StudentResponse,
    EnrollmentCreate, EnrollmentResponse,
)
from app.modules.academic import service as academic_service

academic_router = APIRouter(prefix="/academic", tags=["academic"])


# --- Courses ---
@academic_router.get("/courses", response_model=list[CourseResponse])
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.list_courses(db)

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
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await academic_service.delete_course(db, course_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")


# --- Course Sections ---
@academic_router.get("/course-sections", response_model=list[CourseSectionResponse])
async def list_course_sections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_id = None
    if current_user.role.name == "teacher" and not current_user.is_superadmin:
        teacher_id = current_user.id
    return await academic_service.list_course_sections(db, teacher_id=teacher_id)

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
    deleted = await academic_service.delete_course_section(db, section_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course section not found")


# --- Students ---
@academic_router.get("/students", response_model=list[StudentResponse])
async def list_students(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    return await academic_service.list_students(db)

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
@academic_router.get("/enrollments", response_model=list[EnrollmentResponse])
async def list_enrollments(
    section_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    teacher_id = None
    if current_user.role.name == "teacher" and not current_user.is_superadmin:
        teacher_id = current_user.id
    if section_id and teacher_id:
        section = await academic_service.get_course_section(db, section_id)
        if not section or section.teacher_id != teacher_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this section's enrollments")
    return await academic_service.list_enrollments(db, section_id=section_id)

@academic_router.post("/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def create_enrollment(
    data: EnrollmentCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    enrollment = await academic_service.create_enrollment(db, data.student_id, data.section_id)
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
