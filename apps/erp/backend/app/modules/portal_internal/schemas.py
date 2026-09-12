import uuid
from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel


class LinkedStudentDTO(BaseModel):
    student_id: uuid.UUID
    full_name: str
    student_code: str
    # Earliest enrollments.enrolled_at — when the student joined. None when they
    # have never been enrolled in a section (the portal hides the badge then).
    registered_at: Optional[datetime] = None


class PortalMeResponse(BaseModel):
    actor_id: str
    linked_students: List[LinkedStudentDTO]


class GradeDTO(BaseModel):
    section_id: uuid.UUID
    course_name: str
    final_score: Optional[float] = None
    grade_label: Optional[str] = None
    graded_at: Optional[datetime] = None


class AttendanceDTO(BaseModel):
    # Which section the session belonged to — lets the portal attribute
    # attendance per course without one query per section.
    section_id: uuid.UUID
    date: date
    status: str
    course_name: str


class PaymentDTO(BaseModel):
    id: uuid.UUID
    amount: float
    date: date
    receipt_number: str
    payment_method: str
    course_name: str


class SectionDTO(BaseModel):
    id: uuid.UUID
    course_name: str
    status: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    # "HH:MM", formatted server-side (the column is a time, not a string).
    class_time: Optional[str] = None
    class_duration_minutes: Optional[int] = None
    classroom: Optional[str] = None
    teacher_name: Optional[str] = None
    # Set when the student withdrew: the enrollment is soft-deleted but stays in
    # the course history so the academic record is complete.
    withdrawn: bool = False
    withdrawn_at: Optional[datetime] = None
    withdrawal_reason: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    phone: Optional[str] = None
    locale_pref: Optional[str] = None


class AnnouncementDTO(BaseModel):
    id: uuid.UUID
    text_ar: str
    text_en: str
    sort_order: int = 0
    created_at: Optional[datetime] = None


class SectionFeeDTO(BaseModel):
    section_id: uuid.UUID
    course_name: str
    # None when the enrollment has no derivable price (no override, no history,
    # no section price) — balance is then unknown rather than zero.
    net_price: Optional[float] = None
    total_paid: float = 0.0
    balance: Optional[float] = None


class FeesSummaryDTO(BaseModel):
    total_net_price: float = 0.0
    total_paid: float = 0.0
    balance: float = 0.0
    sections: List[SectionFeeDTO] = []
