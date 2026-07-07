import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, field_validator


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


# --- Payments ---
class PaymentCreate(BaseModel):
    enrollment_id: uuid.UUID
    amount: float
    date: Optional[str] = None
    payment_method: str = "cash"
    transaction_number: Optional[str] = None

class PaymentResponse(BaseModel):
    id: uuid.UUID
    enrollment_id: uuid.UUID
    amount: float
    date: date
    receipt_number: str
    payment_method: str
    transaction_number: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    created_by_name: str = ""

    class Config:
        from_attributes = True


# --- Teacher Wallet ---
class TeacherWalletResponse(BaseModel):
    teacher_id: uuid.UUID
    balance: float
    last_updated: datetime

    class Config:
        from_attributes = True


# --- Expenses ---
class ExpenseCreate(BaseModel):
    amount: float
    description: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_id: Optional[uuid.UUID] = None
    date: Optional[str] = None
    type: str = "general_expense"

class ExpenseResponse(BaseModel):
    id: uuid.UUID
    amount: float
    description: Optional[str] = None
    recipient_name: str
    recipient_id: Optional[uuid.UUID] = None
    date: date
    receipt_number: str
    type: str
    created_by: Optional[uuid.UUID] = None
    created_by_name: str = ""

    class Config:
        from_attributes = True


class EligibleRecipientResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str
    available_limit: float
    is_eligible: bool


# --- Daily Closures ---
class DailyClosureResponse(BaseModel):
    date: date
    status: str
    closed_by_manager_id: Optional[uuid.UUID] = None
    total_payments_in: float = 0
    total_expenses_out: float = 0
    net_cash_flow: float = 0

    class Config:
        from_attributes = True

class PaymentDetailItem(BaseModel):
    id: uuid.UUID
    amount: float
    receipt_number: str
    payment_method: str
    transaction_number: Optional[str] = None
    enrollment_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    course_name: str
    created_by: Optional[uuid.UUID] = None
    created_by_name: str = ""

class ExpenseDetailItem(BaseModel):
    id: uuid.UUID
    amount: float
    receipt_number: str
    type: str
    recipient_name: Optional[str] = None
    description: Optional[str] = None
    recipient_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_by_name: str = ""

class DailyLedgerResponse(BaseModel):
    date: date
    total_payments_in: float
    total_expenses_out: float
    net_cash_flow: float
    status: str
    closed_by_manager_id: Optional[uuid.UUID] = None
    payments: list[PaymentDetailItem]
    expenses: list[ExpenseDetailItem]
    prev_date: date
    next_date: date


# --- Revenue ---
class MonthlyRevenueItem(BaseModel):
    month: str
    revenue: float
    expenses: float

class CourseRevenueItem(BaseModel):
    course_name: str
    revenue: float
    pct: float

class TeacherRevenueItem(BaseModel):
    teacher_name: str
    revenue: float
    pct: float

class DailyRevenueItem(BaseModel):
    date: str
    revenue: float
    expenses: float

class RevenueComparison(BaseModel):
    current_period: float
    previous_period: float
    change_pct: float

class RevenueOverviewResponse(BaseModel):
    total_revenue: float
    total_expenses: float
    net_revenue: float
    transaction_count: int
    avg_per_student: float
    comparison: RevenueComparison
    monthly_trend: list[MonthlyRevenueItem]
    by_course: list[CourseRevenueItem]
    by_teacher: list[TeacherRevenueItem]
    daily_breakdown: list[DailyRevenueItem]
