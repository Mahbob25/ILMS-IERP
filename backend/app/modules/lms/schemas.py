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

class StudentAttendanceSummary(BaseModel):
    section_id: uuid.UUID
    total_sessions: int
    present_count: int
    absent_count: int
    late_count: int
    excused_count: int


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
    frozen_balance: float = 0
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
    total_refunds_out: float = 0
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

class RefundDetailItem(BaseModel):
    id: uuid.UUID
    amount: float
    receipt_number: str
    student_name: str
    course_name: str
    disbursed_by: Optional[uuid.UUID] = None
    disbursed_by_name: str = ""
    disbursed_at: datetime
    notes: Optional[str] = None

class DailyLedgerResponse(BaseModel):
    date: date
    total_payments_in: float
    total_expenses_out: float
    total_refunds_out: float = 0
    net_cash_flow: float
    status: str
    closed_by_manager_id: Optional[uuid.UUID] = None
    payments: list[PaymentDetailItem]
    expenses: list[ExpenseDetailItem]
    refunds: list[RefundDetailItem] = []
    prev_date: date
    next_date: date


# --- Revenue ---
class MonthlyRevenueItem(BaseModel):
    month: str
    revenue: float
    expenses: float
    refunds: float = 0

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
    refunds: float = 0

class RevenueComparison(BaseModel):
    current_period: float
    previous_period: float
    change_pct: float

class RevenueOverviewResponse(BaseModel):
    total_revenue: float
    total_expenses: float
    total_refunds: float = 0
    net_revenue: float
    transaction_count: int
    avg_per_student: float
    comparison: RevenueComparison
    monthly_trend: list[MonthlyRevenueItem]
    by_course: list[CourseRevenueItem]
    by_teacher: list[TeacherRevenueItem]
    daily_breakdown: list[DailyRevenueItem]


# --- Section Contract ---
class ContractAssignRequest(BaseModel):
    teacher_id: uuid.UUID
    compensation_model: str  # "fixed" or "percentage"
    fixed_amount: Optional[float] = None
    percentage: Optional[float] = None
    holdback_rate: Optional[float] = None


class ContractSectionInfo(BaseModel):
    id: uuid.UUID
    name: str
    course_name: str

    class Config:
        from_attributes = True


class SectionContractResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    teacher_id: Optional[uuid.UUID] = None
    compensation_model: Optional[str] = None
    fixed_amount: Optional[float] = None
    percentage: Optional[float] = None
    holdback_rate: float = 0.20
    status: str
    created_at: datetime
    updated_at: datetime
    section: Optional[ContractSectionInfo] = None

    class Config:
        from_attributes = True


# --- Amendment Requests ---
class AmendmentCreateRequest(BaseModel):
    requested_amount: float
    reason: Optional[str] = None


class AmendmentResponse(BaseModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    previous_fixed_amount: Optional[float] = None
    requested_fixed_amount: Optional[float] = None
    previous_percentage: Optional[float] = None
    requested_percentage: Optional[float] = None
    reason: Optional[str] = None
    requested_by: uuid.UUID
    requested_at: datetime
    status: str
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None

    class Config:
        from_attributes = True


class AmendmentApproveRequest(BaseModel):
    review_notes: Optional[str] = None


class AmendmentRejectRequest(BaseModel):
    review_notes: Optional[str] = None


class AmendmentPendingItem(BaseModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    section_name: str
    course_name: str
    teacher_name: str
    compensation_model: Optional[str] = None
    current_amount: Optional[float] = None
    requested_amount: Optional[float] = None
    reason: Optional[str] = None
    requested_by_name: str
    requested_at: datetime

    class Config:
        from_attributes = True


# --- Wallet Detail ---
class WalletSectionDetail(BaseModel):
    contract_id: str
    section_name: Optional[str] = None
    course_name: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = None
    credited: float = 0
    frozen: float = 0
    available: float = 0


class WalletDetailResponse(BaseModel):
    total_balance: float
    total_frozen: float
    total_available: float
    sections: list[WalletSectionDetail]
