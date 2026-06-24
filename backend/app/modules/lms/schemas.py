import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


# --- Attendance ---
class AttendanceSessionCreate(BaseModel):
    section_id: uuid.UUID
    date: date

class AttendanceRecordInput(BaseModel):
    student_id: uuid.UUID
    status: str = "present"

class AttendanceSubmit(BaseModel):
    records: list[AttendanceRecordInput]

class AttendanceSessionResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    date: date
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class AttendanceRecordResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    student_id: uuid.UUID
    status: str

    class Config:
        from_attributes = True


# --- Assignments ---
class AssignmentCreate(BaseModel):
    section_id: uuid.UUID
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_score: int = 100

class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_score: Optional[int] = None

class AssignmentResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_score: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Submissions ---
class SubmissionResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    submitted_at: datetime
    file_path: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


# --- Grades ---
class GradeCreate(BaseModel):
    score: float
    feedback: Optional[str] = None

class GradeResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    score: float
    feedback: Optional[str] = None
    graded_by: uuid.UUID
    graded_at: datetime

    class Config:
        from_attributes = True
