import uuid
import enum
from datetime import date, datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Date, DateTime, ForeignKey, Text, Enum as SAEnum, UniqueConstraint, Numeric
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.modules.academic.models import CourseSection, Enrollment
    from app.modules.identity.models import User, Employee


class ContractStatus(str, enum.Enum):
    DRAFT = "draft"
    ASSIGNED = "assigned"
    ACTIVE = "active"
    GRADES_SUBMITTED = "grades_submitted"
    SETTLED = "settled"
    CANCELLED = "cancelled"


class CompensationModel(str, enum.Enum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class LedgerEntryType(str, enum.Enum):
    ACTIVATION_CREDIT = "activation_credit"
    PAYMENT_SHARE = "payment_share"
    GRADE_UNFREEZE = "grade_unfreeze"
    AMENDMENT_ADJUSTMENT = "amendment_adjustment"
    REVERSAL = "reversal"
    WITHDRAWAL = "withdrawal"
    WITHDRAWAL_REVERSAL = "withdrawal_reversal"
    DEACTIVATION_REVERSAL = "deactivation_reversal"
    REFUND_DISBURSEMENT = "refund_disbursement"


class AmendmentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        UniqueConstraint("section_id", "date", name="uq_attendance_session_section_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )

    section: Mapped["CourseSection"] = relationship(back_populates="attendance_sessions")
    records: Mapped[list["AttendanceRecord"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_attendance_record_session_student"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="present", server_default="present")

    session: Mapped[AttendanceSession] = relationship(back_populates="records")


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False, default=100, server_default="100")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    section: Mapped["CourseSection"] = relationship(back_populates="assignments")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted", server_default="submitted")

    assignment: Mapped[Assignment] = relationship(back_populates="submissions")
    grade: Mapped[Optional["Grade"]] = relationship(back_populates="submission", uselist=False, cascade="all, delete-orphan")


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graded_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )

    submission: Mapped[Submission] = relationship(back_populates="grade")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    payment_method: Mapped[str] = mapped_column(SAEnum('cash', 'online', name='paymentmethod'), nullable=False, default="cash", server_default="cash")
    transaction_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    enrollment: Mapped["Enrollment"] = relationship(back_populates="payments")
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    type: Mapped[str] = mapped_column(SAEnum('general_expense', 'teacher_withdrawal', 'salary_draw', name='expensetype'), nullable=False, default="general_expense", server_default="general_expense")

    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    recipient_employee: Mapped[Optional["Employee"]] = relationship(back_populates="expenses")
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])


class TeacherWallet(Base):
    __tablename__ = "teacher_wallets"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    frozen_balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )

    teacher_employee: Mapped["Employee"] = relationship(back_populates="wallet")
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="wallet")


class SectionContract(Base):
    __tablename__ = "section_contracts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    compensation_model: Mapped[Optional[CompensationModel]] = mapped_column(
        SAEnum(CompensationModel, name="compensationmodel", create_constraint=True, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True
    )
    fixed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    holdback_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=0.20, server_default="0.20")
    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(ContractStatus, name="contractstatus", create_constraint=True, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False, default=ContractStatus.DRAFT, server_default="draft"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )

    section: Mapped["CourseSection"] = relationship(back_populates="contract")
    teacher_employee: Mapped[Optional["Employee"]] = relationship(back_populates="contracts")
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="contract")
    amendment_requests: Mapped[list["CompensationAmendmentRequest"]] = relationship(back_populates="contract")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("teacher_wallets.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    contract_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("section_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    type: Mapped[LedgerEntryType] = mapped_column(
        SAEnum(LedgerEntryType, name="ledgerentrytype", create_constraint=True, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False
    )
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    available_delta: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    frozen_delta: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    reference_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    reference_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    wallet: Mapped["TeacherWallet"] = relationship(back_populates="ledger_entries")
    contract: Mapped[Optional["SectionContract"]] = relationship(back_populates="ledger_entries")
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])


class CompensationAmendmentRequest(Base):
    __tablename__ = "compensation_amendment_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("section_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_fixed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    requested_fixed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    previous_percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    requested_percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    status: Mapped[AmendmentStatus] = mapped_column(
        SAEnum(AmendmentStatus, name="amendmentstatus", create_constraint=True, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False, default=AmendmentStatus.PENDING, server_default="pending"
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ledger_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("ledger_entries.id", ondelete="SET NULL"), nullable=True
    )

    contract: Mapped["SectionContract"] = relationship(back_populates="amendment_requests")
    requestor: Mapped["Employee"] = relationship(foreign_keys=[requested_by])
    reviewer: Mapped[Optional["Employee"]] = relationship(foreign_keys=[reviewed_by])
    ledger_entry: Mapped[Optional["LedgerEntry"]] = relationship()


class DailyClosure(Base):
    __tablename__ = "daily_closures"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    status: Mapped[str] = mapped_column(SAEnum('closed', 'pending', 'unlock_requested', name='closurystatus'), nullable=False, default="pending", server_default="pending")
    closed_by_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("idempotency_key", "endpoint", name="uq_idempotency_keys_key_endpoint"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(100), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())",
    )
