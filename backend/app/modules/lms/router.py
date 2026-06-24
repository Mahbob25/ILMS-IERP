import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.academic.service import get_course_section
from app.modules.lms.schemas import (
    AttendanceSessionCreate, AttendanceSessionResponse,
    AttendanceRecordResponse, AttendanceSubmit,
    AssignmentCreate, AssignmentUpdate, AssignmentResponse,
    SubmissionResponse, GradeCreate, GradeResponse,
)
from app.modules.lms import service as lms_service
from app.core.storage import save_upload

lms_router = APIRouter(prefix="/lms", tags=["lms"])


# --- Attendance ---
@lms_router.post("/attendance/sessions", response_model=AttendanceSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_attendance_session(
    data: AttendanceSessionCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    section = await get_course_section(db, data.section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if current_user.role.name == "teacher" and not current_user.is_superadmin and section.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your section")
    return await lms_service.create_attendance_session(db, data.section_id, data.date, current_user.id)

@lms_router.get("/attendance/sessions", response_model=list[AttendanceSessionResponse])
async def list_attendance_sessions(
    section_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name == "teacher" and not current_user.is_superadmin:
        if section_id:
            section = await get_course_section(db, section_id)
            if not section or section.teacher_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your section")
    return await lms_service.list_attendance_sessions(db, section_id=section_id)

@lms_router.get("/attendance/sessions/{session_id}", response_model=AttendanceSessionResponse)
async def get_attendance_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session

@lms_router.post("/attendance/sessions/{session_id}/records", response_model=list[AttendanceRecordResponse])
async def submit_attendance(
    session_id: uuid.UUID,
    data: AttendanceSubmit,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    session = await lms_service.get_attendance_session(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if current_user.role.name == "teacher" and not current_user.is_superadmin and session.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your session")
    records_data = [r.model_dump() for r in data.records]
    return await lms_service.set_attendance_records(db, session_id, records_data)


# --- Assignments ---
@lms_router.get("/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    section_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await lms_service.list_assignments(db, section_id=section_id)

@lms_router.post("/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    data: AssignmentCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    section = await get_course_section(db, data.section_id)
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if current_user.role.name == "teacher" and not current_user.is_superadmin and section.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your section")
    return await lms_service.create_assignment(db, data.model_dump())

@lms_router.put("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID,
    data: AssignmentUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    cleaned = {k: v for k, v in data.model_dump().items() if v is not None}
    assignment = await lms_service.update_assignment(db, assignment_id, cleaned)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment

@lms_router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    deleted = await lms_service.delete_assignment(db, assignment_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")


# --- Submissions ---
@lms_router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionResponse])
async def list_submissions(
    assignment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await lms_service.list_submissions(db, assignment_id)

@lms_router.post("/assignments/{assignment_id}/submissions", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_assignment(
    assignment_id: uuid.UUID,
    student_id: str = Form(...),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    assignment = await lms_service.get_assignment(db, assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    file_path = None
    if file:
        file_path = await save_upload(file, subdir="submissions")
    submission = await lms_service.create_submission(db, assignment_id, uuid.UUID(student_id), file_path)
    if not submission:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission already exists")
    return submission


# --- Grades ---
@lms_router.post("/submissions/{submission_id}/grade", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
async def grade_submission(
    submission_id: uuid.UUID,
    data: GradeCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    grade = await lms_service.create_or_update_grade(db, submission_id, data.score, data.feedback, current_user.id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid submission or score exceeds max")
    return grade

@lms_router.get("/assignments/{assignment_id}/grades", response_model=list[GradeResponse])
async def list_grades(
    assignment_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await lms_service.list_grades_for_assignment(db, assignment_id)
