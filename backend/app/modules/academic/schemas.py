import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# --- Course ---
class CourseCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    credits: int = 3

class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    credits: Optional[int] = None

class CourseResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    credits: int

    class Config:
        from_attributes = True


# --- Course Section ---
class CourseSectionCreate(BaseModel):
    course_id: uuid.UUID
    teacher_id: uuid.UUID
    capacity: int = 30

class CourseSectionUpdate(BaseModel):
    course_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    capacity: Optional[int] = None

class CourseSectionResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    teacher_id: uuid.UUID
    capacity: int
    enrolled_count: int

    class Config:
        from_attributes = True


# --- Student ---
class StudentCreate(BaseModel):
    student_code: str
    full_name: str
    email: Optional[str] = None

class StudentUpdate(BaseModel):
    student_code: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None

class StudentResponse(BaseModel):
    id: uuid.UUID
    student_code: str
    full_name: str
    email: Optional[str] = None

    class Config:
        from_attributes = True


# --- Enrollment ---
class EnrollmentCreate(BaseModel):
    student_id: uuid.UUID
    section_id: uuid.UUID

class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    enrolled_at: datetime

    class Config:
        from_attributes = True
