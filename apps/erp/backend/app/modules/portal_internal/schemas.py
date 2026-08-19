import uuid
from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel


class LinkedStudentDTO(BaseModel):
    student_id: uuid.UUID
    full_name: str
    student_code: str


class PortalMeResponse(BaseModel):
    actor_id: str
    linked_students: List[LinkedStudentDTO]


class GradeDTO(BaseModel):
    section_id: uuid.UUID
    course_name: str
    final_score: Optional[float] = None
    graded_at: Optional[datetime] = None


class AttendanceDTO(BaseModel):
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


class ProfileUpdateRequest(BaseModel):
    phone: Optional[str] = None
    locale_pref: Optional[str] = None
