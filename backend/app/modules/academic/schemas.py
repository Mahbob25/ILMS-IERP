import uuid
from datetime import date, datetime, time
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field, field_validator

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
    teacher_id: Optional[uuid.UUID] = None
    capacity: int = 30
    min_students_required: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    class_time: Optional[time] = None
    class_duration_minutes: Optional[int] = None
    classroom: Optional[str] = None
    price: Optional[float] = None
    teacher_percentage: Optional[float] = None

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
    teacher_percentage: Optional[float] = None

class CourseSectionResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    teacher_id: Optional[uuid.UUID] = None
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
    teacher_percentage: Optional[float] = None


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

class EnrollmentCreateWithStudent(BaseModel):
    student_id: Optional[uuid.UUID] = None
    section_id: uuid.UUID
    admin_discount: Optional[float] = None
    student_code: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None

class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    enrolled_at: datetime
    agreed_price: Optional[float] = None
    admin_discount: Optional[float] = None

    class Config:
        from_attributes = True

class EnrollmentDetailResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    enrolled_at: datetime
    agreed_price: Optional[float] = None
    admin_discount: Optional[float] = None
    student_name: str
    student_code: str
    student_email: Optional[str] = None
    total_paid: float = 0
    balance_remaining: Optional[float] = None
    final_score: Optional[float] = None
    grade_label: Optional[str] = None


# --- Final Grade ---
class FinalGradeCreate(BaseModel):
    student_id: uuid.UUID
    final_score: float = Field(ge=0, le=100)
    notes: Optional[str] = None

    @field_validator("final_score")
    @classmethod
    def validate_score(cls, v: float) -> float:
        if v < 0 or v > 100:
            raise ValueError("Final score must be between 0 and 100")
        return round(v, 2)

class FinalGradeBulkCreate(BaseModel):
    grades: list[FinalGradeCreate]

class StudentGradeSummary(BaseModel):
    section_id: uuid.UUID
    final_score: float
    grade_label: str

class FinalGradeResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    final_score: float
    graded_by: uuid.UUID
    graded_at: datetime
    notes: Optional[str] = None
    student_name: Optional[str] = None
    student_code: Optional[str] = None

    class Config:
        from_attributes = True


# --- Certificate ---
class CertificateResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    certificate_number: str
    course_name: str
    student_name: str
    issued_at: datetime
    final_score: Optional[float] = None
    grade_label: Optional[str] = None
    student_id_no: Optional[str] = None
    student_code: Optional[str] = None
    course_code: Optional[str] = None
    duration_text: Optional[str] = None
    total_hours: Optional[str] = None

    class Config:
        from_attributes = True
