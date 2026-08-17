import uuid
from datetime import date, datetime, time
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field, field_validator, model_validator

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
    contract_status: Optional[str] = None
    contract_compensation_model: Optional[str] = None
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


class DeactivateRequest(BaseModel):
    reason: str | None = None


# --- Student ---
PHONE_RE = r"^\+?[0-9]{8,15}$"


class StudentCreate(BaseModel):
    student_code: str
    full_name: str
    email: str
    phone: str = Field(..., pattern=PHONE_RE, min_length=8, max_length=32)
    parent_full_name: Optional[str] = None
    parent_phone: Optional[str] = Field(None, pattern=PHONE_RE, min_length=8, max_length=32)
    parent_email: Optional[str] = None
    parent_relationship: Optional[str] = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("parent_email")
    @classmethod
    def normalize_parent_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return v.strip().lower()

    @model_validator(mode="after")
    def validate_parent_group(self):
        parent_fields = [
            self.parent_full_name,
            self.parent_phone,
            self.parent_email,
            self.parent_relationship,
        ]
        present = [f is not None and f != "" for f in parent_fields]
        if any(present) and not all(present):
            raise ValueError(
                "parent_full_name, parent_phone, parent_email, parent_relationship "
                "must be provided together"
            )
        return self


class StudentUpdate(BaseModel):
    student_code: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = Field(None, pattern=PHONE_RE, min_length=8, max_length=32)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return v.strip().lower()


class StudentResponse(BaseModel):
    id: uuid.UUID
    student_code: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None

    class Config:
        from_attributes = True


# --- Enrollment ---
class EnrollmentCreate(BaseModel):
    student_id: uuid.UUID
    section_id: uuid.UUID
    admin_discount: Optional[float] = None

    @field_validator("admin_discount")
    @classmethod
    def validate_discount(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if v < 0:
            raise ValueError("Discount cannot be negative")
        if v > 100:
            raise ValueError("Discount cannot exceed 100%")
        return round(v, 2)


class EnrollmentCreateWithStudent(BaseModel):
    student_id: Optional[uuid.UUID] = None
    section_id: uuid.UUID
    admin_discount: Optional[float] = None
    student_code: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = Field(None, pattern=PHONE_RE, min_length=8, max_length=32)
    parent_full_name: Optional[str] = None
    parent_phone: Optional[str] = Field(None, pattern=PHONE_RE, min_length=8, max_length=32)
    parent_email: Optional[str] = None
    parent_relationship: Optional[str] = None

    @field_validator("admin_discount")
    @classmethod
    def validate_discount(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if v < 0:
            raise ValueError("Discount cannot be negative")
        if v > 100:
            raise ValueError("Discount cannot exceed 100%")
        return round(v, 2)


class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    section_id: uuid.UUID
    enrolled_at: datetime
    agreed_price: Optional[float] = None
    admin_discount: Optional[float] = None
    total_paid: float = 0
    balance_remaining: Optional[float] = None

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
# --- Unenrollment ---
class UnenrollmentPreviewResponse(BaseModel):
    enrollment_id: uuid.UUID
    student_name: str
    student_code: str
    section_name: str
    course_name: str
    agreed_price: Optional[float] = None
    admin_discount: Optional[float] = None
    net_price: Optional[float] = None
    total_paid: float = 0
    remaining_balance: Optional[float] = None
    teacher_share_reversal_amount: float = 0
    teacher_wallet_balance: float = 0
    teacher_wallet_available_balance: float = 0
    teacher_name: Optional[str] = None
    has_attendance_records: bool = False
    has_grades: bool = False
    has_certificates: bool = False
    can_unenroll: bool = True
    warnings: list[str] = []


class UnenrollRequest(BaseModel):
    reason: str
    refund_policy: str  # 'authorize_refund' or 'no_refund'
    refund_amount: Optional[float] = None
    force: bool = False
    force_reason: Optional[str] = None
    notes: Optional[str] = None


class UnenrollmentRecordResponse(BaseModel):
    id: uuid.UUID
    enrollment_id: uuid.UUID
    section_id: uuid.UUID
    student_id: uuid.UUID
    unenrolled_by: uuid.UUID
    unenrolled_at: datetime
    reason: str
    refund_policy: str
    total_paid: float
    teacher_share_reversed: float
    refund_authorized_amount: float
    has_attendance_records: bool
    has_grades: bool
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class CertificateBatchDeleteRequest(BaseModel):
    cert_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=100)


class BatchDeleteResult(BaseModel):
    deleted_count: int
    errors: list[str] = []


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
