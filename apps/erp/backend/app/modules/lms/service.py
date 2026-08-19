import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.modules.lms.models import AttendanceSession, AttendanceRecord
from app.modules.academic.models import CourseSection

logger = logging.getLogger(__name__)


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
    try:
        created = []
        for r in records:
            rec = AttendanceRecord(session_id=session_id, student_id=r["student_id"], status=r["status"])
            db.add(rec)
            created.append(rec)
        await db.flush()
        return created
    except Exception as e:
        logger.error("Attendance batch save failed for session %s: %s", session_id, str(e))
        await db.rollback()
        raise HTTPException(status_code=500, detail="Attendance save failed. Please retry.")


# --- Student Attendance Summary ---
async def get_student_attendance_summary(db: AsyncSession, student_id: uuid.UUID) -> list[dict]:
    from sqlalchemy import func, select as sa_select

    result = await db.execute(
        sa_select(
            AttendanceRecord.session_id,
            AttendanceSession.section_id,
            AttendanceRecord.status,
            func.count(AttendanceRecord.id).label("cnt"),
        )
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceRecord.student_id == student_id)
        .group_by(AttendanceRecord.session_id, AttendanceSession.section_id, AttendanceRecord.status)
    )
    rows = result.all()

    section_map: dict[uuid.UUID, dict[str, int]] = {}
    for session_id, section_id, status, cnt in rows:
        if section_id not in section_map:
            section_map[section_id] = {"total_sessions": 0, "present_count": 0, "absent_count": 0, "late_count": 0, "excused_count": 0}
        section_map[section_id]["total_sessions"] += cnt
        key = f"{status}_count"
        if key in section_map[section_id]:
            section_map[section_id][key] += cnt

    # Count distinct session dates per section for total session count
    session_count_result = await db.execute(
        sa_select(
            AttendanceSession.section_id,
            func.count(AttendanceSession.id).label("session_cnt"),
        )
        .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceRecord.student_id == student_id)
        .group_by(AttendanceSession.section_id)
    )
    for section_id, session_cnt in session_count_result.all():
        if section_id in section_map:
            section_map[section_id]["total_sessions"] = session_cnt

    return [
        {
            "section_id": section_id,
            "total_sessions": data["total_sessions"],
            "present_count": data["present_count"],
            "absent_count": data["absent_count"],
            "late_count": data["late_count"],
            "excused_count": data["excused_count"],
        }
        for section_id, data in section_map.items()
    ]


