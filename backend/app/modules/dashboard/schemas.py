import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class SectionInfo(BaseModel):
    id: uuid.UUID
    name: str
    course_name: str
    enrolled_count: int
    capacity: int

class TodaySession(BaseModel):
    id: uuid.UUID
    section_name: str
    course_name: str
    date: date

class RecentPayment(BaseModel):
    id: uuid.UUID
    student_name: str
    course_name: str
    amount: float
    date: date
    receipt_number: str

class TeacherDashboardResponse(BaseModel):
    sections_count: int
    sections: list[SectionInfo]
    today_sessions_count: int
    today_sessions: list[TodaySession]
    pending_grading: int
    wallet_balance: float
    recent_payments: list[RecentPayment]

    class Config:
        from_attributes = True


class DailyTransaction(BaseModel):
    id: uuid.UUID
    type: str
    description: str
    amount: float
    date: date
    time: str
    direction: str = "in"

class SecretaryDashboardResponse(BaseModel):
    today_payments_count: int
    today_payments_total: float
    today_expenses_count: int
    today_expenses_total: float
    today_refunds_count: int = 0
    today_refunds_total: float = 0
    pending_students: int
    daily_closure_status: str
    recent_enrollments_count: int
    today_transactions: list[DailyTransaction]

    class Config:
        from_attributes = True


class UnlockRequest(BaseModel):
    date: date
    requested_by: Optional[str] = None

class ManagerDashboardResponse(BaseModel):
    total_students: int
    total_courses: int
    total_teachers: int
    monthly_revenue: float
    monthly_expenses: float
    monthly_refunds: float = 0
    pending_unlock_requests: list[UnlockRequest]
    pending_withdrawals_count: int
    recent_activity_count: int

    class Config:
        from_attributes = True


class SystemHealth(BaseModel):
    db_status: str
    api_uptime: str

class AuditLogEntry(BaseModel):
    id: uuid.UUID
    user_name: Optional[str] = None
    action: str
    timestamp: datetime

class SuperadminDashboardResponse(BaseModel):
    total_students: int
    total_courses: int
    total_teachers: int
    monthly_revenue: float
    monthly_expenses: float
    monthly_refunds: float = 0
    pending_unlock_requests: list[UnlockRequest]
    pending_withdrawals_count: int
    system_health: SystemHealth
    backup_status: str
    recent_audit_logs: list[AuditLogEntry]

    class Config:
        from_attributes = True
