import uuid
from datetime import date, datetime, time
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Float, Date, DateTime, Time, ForeignKey, Text, Enum as SAEnum, UniqueConstraint, CheckConstraint, Numeric
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.modules.identity.models import Employee


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
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    capacity: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    enrolled_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(SAEnum('pending', 'active', 'completed', name='coursestatus'), nullable=False, default="pending", server_default="pending")
    teacher_percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    min_students_required: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    class_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    class_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    classroom: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="sections")
    teacher_employee: Mapped["Employee"] = relationship(back_populates="sections")
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    attendance_sessions: Mapped[list["AttendanceSession"]] = relationship(back_populates="section", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="section", cascade="all, delete-orphan")


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


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "section_id", name="uq_enrollments_student_section"),
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
