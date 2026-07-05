import uuid
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.modules.lms.models import AttendanceSession, AttendanceRecord
from app.modules.academic.models import CourseSection


# --- Attendance Sessions ---
async def create_attendance_session(db: AsyncSession, section_id: uuid.UUID, session_date: date, created_by: uuid.UUID) -> AttendanceSession:
    session = AttendanceSession(section_id=section_id, date=session_date, created_by=created_by)
    db.add(session)
    await db.flush()
    return session

async def get_attendance_session(db: AsyncSession, session_id: uuid.UUID) -> Optional[AttendanceSession]:
    result = await db.execute(
        select(AttendanceSession).options(joinedload(AttendanceSession.records)).where(AttendanceSession.id == session_id)
    )
    return result.unique().scalar_one_or_none()

async def list_attendance_sessions(db: AsyncSession, section_id: Optional[uuid.UUID] = None) -> list[AttendanceSession]:
    query = select(AttendanceSession).order_by(AttendanceSession.date.desc())
    if section_id:
        query = query.where(AttendanceSession.section_id == section_id)
    result = await db.execute(query)
    return result.scalars().all()


# --- Attendance Records ---
async def set_attendance_records(db: AsyncSession, session_id: uuid.UUID, records: list[dict]) -> list[AttendanceRecord]:
    created = []
    for r in records:
        rec = AttendanceRecord(session_id=session_id, student_id=r["student_id"], status=r["status"])
        db.add(rec)
        created.append(rec)
    await db.flush()
    return created


