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


# --- Payments ---
class PaymentCreate(BaseModel):
    student_id: uuid.UUID
    course_id: uuid.UUID
    amount: float
    date: Optional[str] = None

class PaymentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    amount: float
    date: date
    receipt_number: str

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
    recipient_name: str
    date: Optional[str] = None
    type: str = "general_expense"

class ExpenseResponse(BaseModel):
    id: uuid.UUID
    amount: float
    description: Optional[str] = None
    recipient_name: str
    date: date
    receipt_number: str
    type: str

    class Config:
        from_attributes = True


# --- Teacher Wallet Withdrawal ---
class WithdrawRequest(BaseModel):
    teacher_id: uuid.UUID
    amount: float
    description: Optional[str] = None

class WithdrawResponse(BaseModel):
    expense: ExpenseResponse
    new_balance: float


# --- Daily Closures ---
class DailyClosureResponse(BaseModel):
    date: date
    status: str
    closed_by_manager_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True

class DailyLedgerResponse(BaseModel):
    date: date
    total_payments_in: float
    total_expenses_out: float
    net_cash_flow: float
    status: str
