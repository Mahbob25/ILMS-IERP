import uuid
from datetime import date, datetime, time
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int


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
    min_students_required: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    class_time: Optional[time] = None
    class_duration_minutes: Optional[int] = None
    classroom: Optional[str] = None
    price: Optional[float] = None

class CourseSectionUpdate(BaseModel):
    teacher_id: Optional[uuid.UUID] = None
    capacity: Optional[int] = None
    min_students_required: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    class_time: Optional[time] = None
    class_duration_minutes: Optional[int] = None
    classroom: Optional[str] = None
    price: Optional[float] = None

class CourseSectionResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    teacher_id: uuid.UUID
    capacity: int
    enrolled_count: int
    status: str = "pending"
    teacher_percentage: Optional[float] = None
    min_students_required: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    class_time: Optional[time] = None
    class_duration_minutes: Optional[int] = None
    classroom: Optional[str] = None
    price: Optional[float] = None

    class Config:
        from_attributes = True

class SectionActivate(BaseModel):
    teacher_percentage: float


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
    admin_discount: Optional[float] = None

class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    enrolled_at: datetime
    agreed_price: Optional[float] = None
    admin_discount: Optional[float] = None

    class Config:
        from_attributes = True
