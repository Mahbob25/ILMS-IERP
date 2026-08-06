import uuid
from datetime import date, datetime, time
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Float, Date, DateTime, Time, ForeignKey, Text, Boolean, Enum as SAEnum, UniqueConstraint, CheckConstraint, Numeric, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.core.timezone import utcnow

if TYPE_CHECKING:
    from app.modules.identity.models import Employee, User

    from app.modules.lms.models import Payment, SectionContract


class FinalGrade(Base):
    __tablename__ = "final_grades"
    __table_args__ = (
        UniqueConstraint("section_id", "student_id", name="uq_final_grades_section_student"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    final_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    graded_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    section: Mapped["CourseSection"] = relationship(back_populates="final_grades")
    student: Mapped["Student"] = relationship()
    graded_by_user: Mapped["User"] = relationship()


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("student_id", "section_id", name="uq_certificates_student_section"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    certificate_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    student_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    final_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    grade_label: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    student_id_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    extra_data: Mapped[Optional[dict]] = mapped_column("extra_data", JSONB, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped["Student"] = relationship(back_populates="certificates")
    section: Mapped["CourseSection"] = relationship(back_populates="certificates")
    enrollment: Mapped["Enrollment"] = relationship(back_populates="certificates")



class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    credits: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sections: Mapped[list["CourseSection"]] = relationship(back_populates="course", cascade="all, delete-orphan")


class CourseSection(Base):
    __tablename__ = "course_sections"
    __table_args__ = (
        CheckConstraint("enrolled_count >= 0 AND enrolled_count <= capacity",
                        name="ck_course_sections_enrolled_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    capacity: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    enrolled_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(SAEnum('pending', 'active', 'completed', 'cancelled', 'ready_for_completion', name='coursestatus'), nullable=False, default="pending", server_default="pending")
    teacher_percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    min_students_required: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    class_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    class_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    classroom: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=text("timezone('utc'::text, now())"),
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    flags: Mapped[dict] = mapped_column("flags", JSONB, nullable=False, default=dict, server_default="{}")
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    course: Mapped[Course] = relationship(back_populates="sections")
    teacher_employee: Mapped[Optional["Employee"]] = relationship(back_populates="sections")
    contract: Mapped[Optional["SectionContract"]] = relationship(back_populates="section", uselist=False)
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    attendance_sessions: Mapped[list["AttendanceSession"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    certificates: Mapped[list["Certificate"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    final_grades: Mapped[list["FinalGrade"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    cancellations: Mapped[list["SectionCancellation"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    completion_overrides: Mapped[list["SectionCompletionOverride"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    cancelled_by_user: Mapped[Optional["User"]] = relationship(foreign_keys=[cancelled_by])


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    student_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="student")
    certificates: Mapped[list["Certificate"]] = relationship(back_populates="student", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"
    # Unique constraint uq_enrollments_student_section replaced by
    # partial unique index uq_active_enrollment in migration

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    agreed_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    admin_discount: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped[Student] = relationship(back_populates="enrollments")
    section: Mapped[CourseSection] = relationship(back_populates="enrollments")
    payments: Mapped[list["Payment"]] = relationship(back_populates="enrollment")
    certificates: Mapped[list["Certificate"]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")
    pending_refunds: Mapped[list["PendingRefund"]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")
    unenrollment_records: Mapped[list["UnenrollmentRecord"]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")


class SectionCancellation(Base):
    __tablename__ = "section_cancellations"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cancelled_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    cancelled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    refund_policy: Mapped[str] = mapped_column(String(20), nullable=False)
    teacher_wallet_reversal_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    total_payments_collected: Mapped[float] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    total_refund_authorized: Mapped[float] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    enrolled_student_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    has_attendance_records: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    has_final_grades: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    has_certificates: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    section: Mapped["CourseSection"] = relationship(back_populates="cancellations")
    cancelled_by_user: Mapped["User"] = relationship()
    pending_refunds: Mapped[list["PendingRefund"]] = relationship(back_populates="section_cancellation", cascade="all, delete-orphan")


class UnenrollmentRecord(Base):
    __tablename__ = "unenrollment_records"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    unenrolled_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    unenrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    refund_policy: Mapped[str] = mapped_column(
        SAEnum("authorize_refund", "no_refund", name="unenrollment_refund_policy"),
        nullable=False
    )
    total_paid: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    teacher_share_reversed: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    refund_authorized_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    has_attendance_records: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    has_grades: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    enrollment: Mapped["Enrollment"] = relationship(back_populates="unenrollment_records")
    section: Mapped["CourseSection"] = relationship()
    student: Mapped["Student"] = relationship()
    unenrolled_by_user: Mapped["User"] = relationship()
    overrides: Mapped[list["UnenrollmentOverride"]] = relationship(back_populates="unenrollment_record", cascade="all, delete-orphan")
    pending_refunds: Mapped[list["PendingRefund"]] = relationship(back_populates="unenrollment_record", cascade="all, delete-orphan")


class UnenrollmentOverride(Base):
    __tablename__ = "unenrollment_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    unenrollment_record_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("unenrollment_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    overridden_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    overridden_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    override_type: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    teacher_wallet_balance_before: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    reversal_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    unenrollment_record: Mapped["UnenrollmentRecord"] = relationship(back_populates="overrides")
    overridden_by_user: Mapped["User"] = relationship()


class PendingRefund(Base):
    __tablename__ = "pending_refunds"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    section_cancellation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("section_cancellations.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    unenrollment_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("unenrollment_records.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum("UNCLAIMED", "CLAIMED", "FORFEITED", name="pending_refund_status"),
        nullable=False, default="UNCLAIMED", server_default="UNCLAIMED"
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="cancellation", server_default="cancellation")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    enrollment: Mapped["Enrollment"] = relationship(back_populates="pending_refunds")
    section_cancellation: Mapped[Optional["SectionCancellation"]] = relationship(back_populates="pending_refunds")
    unenrollment_record: Mapped[Optional["UnenrollmentRecord"]] = relationship(back_populates="pending_refunds")
    refund: Mapped[Optional["Refund"]] = relationship(back_populates="pending_refund", uselist=False, cascade="all, delete-orphan")


class Refund(Base):
    __tablename__ = "refunds"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    pending_refund_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("pending_refunds.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    disbursed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    disbursed_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    pending_refund: Mapped["PendingRefund"] = relationship(back_populates="refund")
    disbursed_by_user: Mapped["User"] = relationship()


class DailyJobsLog(Base):
    __tablename__ = "daily_jobs_log"
    __table_args__ = (
        UniqueConstraint("job_name", "last_run_date", name="uq_daily_jobs_log_job_name_last_run_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    job_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_run_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )


class SectionCompletionOverride(Base):
    __tablename__ = "section_completion_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("course_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    overridden_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    overridden_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
    bypass_grade_check: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    bypass_payment_check: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ungraded_students: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    unpaid_students: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    section: Mapped["CourseSection"] = relationship(back_populates="completion_overrides")
    overridden_by_user: Mapped["User"] = relationship()


class SectionLifecycleConfig(Base):
    __tablename__ = "section_lifecycle_config"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="timezone('utc'::text, now())"
    )
