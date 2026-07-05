import uuid
from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.modules.lms.models import AttendanceSession, AttendanceRecord, Assignment, Submission, Grade
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


# --- Assignments ---
async def create_assignment(db: AsyncSession, data: dict) -> Assignment:
    assignment = Assignment(**data)
    db.add(assignment)
    await db.flush()
    return assignment

async def get_assignment(db: AsyncSession, assignment_id: uuid.UUID) -> Optional[Assignment]:
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id, Assignment.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()

async def list_assignments(db: AsyncSession, section_id: Optional[uuid.UUID] = None) -> list[Assignment]:
    query = select(Assignment).where(Assignment.deleted_at.is_(None)).order_by(Assignment.created_at.desc())
    if section_id:
        query = query.where(Assignment.section_id == section_id)
    result = await db.execute(query)
    return result.scalars().all()

async def update_assignment(db: AsyncSession, assignment_id: uuid.UUID, data: dict) -> Optional[Assignment]:
    assignment = await get_assignment(db, assignment_id)
    if not assignment:
        return None
    for key, value in data.items():
        setattr(assignment, key, value)
    await db.flush()
    return assignment

async def delete_assignment(db: AsyncSession, assignment_id: uuid.UUID) -> bool:
    assignment = await get_assignment(db, assignment_id)
    if not assignment:
        return False
    assignment.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True


# --- Submissions ---
async def create_submission(db: AsyncSession, assignment_id: uuid.UUID, student_id: uuid.UUID, file_path: Optional[str] = None) -> Optional[Submission]:
    submission = Submission(assignment_id=assignment_id, student_id=student_id, file_path=file_path, status="submitted")
    db.add(submission)
    await db.flush()
    return submission

async def list_submissions(db: AsyncSession, assignment_id: uuid.UUID) -> list[Submission]:
    result = await db.execute(
        select(Submission).options(joinedload(Submission.grade)).where(Submission.assignment_id == assignment_id)
    )
    return result.scalars().all()


# --- Grades ---
async def create_or_update_grade(db: AsyncSession, submission_id: uuid.UUID, score: float, feedback: Optional[str], graded_by: uuid.UUID) -> Optional[Grade]:
    submission = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = submission.scalar_one_or_none()
    if not submission:
        return None
    # Check max score
    assignment = await get_assignment(db, submission.assignment_id)
    if assignment and score > assignment.max_score:
        return None
    grade = Grade(submission_id=submission_id, score=score, feedback=feedback, graded_by=graded_by)
    db.add(grade)
    submission.status = "graded"
    await db.flush()
    return grade

async def list_grades_for_assignment(db: AsyncSession, assignment_id: uuid.UUID) -> list[Grade]:
    result = await db.execute(
        select(Grade).join(Submission).where(Submission.assignment_id == assignment_id)
    )
    return result.scalars().all()
