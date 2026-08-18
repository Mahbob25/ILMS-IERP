import logging
import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lms.closure_service import is_date_closed

logger = logging.getLogger(__name__)

# SQL fragments shared by multiple queries.
_ACTIVE_STUDENT = "s.deleted_at IS NULL"
_ACTIVE_ENROLLMENT = "e.deleted_at IS NULL"
_ACTIVE_SECTION = "cs.deleted_at IS NULL"


async def get_linked_students(db: AsyncSession, actor_id: str) -> list[dict[str, Any]]:
    """Return students linked to the actor.

    Covers both kinds of portal links:
    - parents via `portal.parent_links` (verified guardian links)
    - students' own accounts via `portal.student_links`
    """
    rows = await db.execute(
        text(
            f"""
            SELECT s.id AS student_id, s.full_name, s.student_code
            FROM students s
            WHERE {_ACTIVE_STUDENT}
              AND (
                s.id IN (
                  SELECT pl.student_id FROM portal.parent_links pl
                  WHERE pl.guardian_id = :actor_id AND pl.verified_at IS NOT NULL
                )
                OR s.id IN (
                  SELECT sl.student_id FROM portal.student_links sl
                  WHERE sl.user_id = :actor_id
                )
              )
            ORDER BY s.full_name
            """
        ),
        {"actor_id": actor_id},
    )
    return [dict(r) for r in rows.mappings().all()]


async def get_guardian_student_ids(db: AsyncSession, actor_id: str) -> list[uuid.UUID]:
    """Verified student ids for an actor — used to scope other reads/writes."""
    rows = await db.execute(
        text(
            f"""
            SELECT s.id
            FROM portal.parent_links pl
            JOIN students s ON s.id = pl.student_id
            WHERE pl.guardian_id = :actor_id
              AND pl.verified_at IS NOT NULL
              AND {_ACTIVE_STUDENT}
            """
        ),
        {"actor_id": actor_id},
    )
    return [r[0] for r in rows.all()]


async def get_student(db: AsyncSession, student_id: str) -> Optional[dict[str, Any]]:
    row = await db.execute(
        text(
            f"""
            SELECT id, full_name, student_code
            FROM students s
            WHERE s.id = :sid AND {_ACTIVE_STUDENT}
            """
        ),
        {"sid": student_id},
    )
    m = row.mappings().first()
    return dict(m) if m else None


async def get_grades(db: AsyncSession, student_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(
        text(
            f"""
            SELECT fg.section_id, c.name AS course_name, fg.final_score,
                   fg.graded_at
            FROM final_grades fg
            JOIN course_sections cs ON cs.id = fg.section_id AND {_ACTIVE_SECTION}
            JOIN courses c ON c.id = cs.course_id AND c.deleted_at IS NULL
            WHERE fg.student_id = :sid
            ORDER BY fg.graded_at DESC
            """
        ),
        {"sid": student_id},
    )
    return [dict(r) for r in rows.mappings().all()]


async def get_attendance(
    db: AsyncSession,
    student_id: str,
    section_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    query = text(
        f"""
        SELECT ar.status, asn.date, c.name AS course_name
        FROM attendance_records ar
        JOIN attendance_sessions asn ON asn.id = ar.session_id
        JOIN course_sections cs ON cs.id = asn.section_id AND {_ACTIVE_SECTION}
        JOIN courses c ON c.id = cs.course_id AND c.deleted_at IS NULL
        WHERE ar.student_id = :sid
          AND (CAST(:section_id AS uuid) IS NULL OR asn.section_id = CAST(:section_id AS uuid))
        ORDER BY asn.date DESC
        """
    )
    rows = await db.execute(query, {"sid": student_id, "section_id": section_id})
    return [dict(r) for r in rows.mappings().all()]


async def get_payments(db: AsyncSession, student_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(
        text(
            f"""
            SELECT p.id, p.amount, p.date, p.receipt_number, p.payment_method,
                   c.name AS course_name
            FROM payments p
            JOIN enrollments e ON e.id = p.enrollment_id AND {_ACTIVE_ENROLLMENT}
            JOIN course_sections cs ON cs.id = e.section_id AND {_ACTIVE_SECTION}
            JOIN courses c ON c.id = cs.course_id AND c.deleted_at IS NULL
            WHERE e.student_id = :sid
            ORDER BY p.date DESC
            """
        ),
        {"sid": student_id},
    )
    return [dict(r) for r in rows.mappings().all()]


async def get_sections(db: AsyncSession, student_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(
        text(
            f"""
            SELECT cs.id, c.name AS course_name, cs.status,
                   cs.start_date, cs.end_date
            FROM enrollments e
            JOIN course_sections cs ON cs.id = e.section_id AND {_ACTIVE_SECTION}
            JOIN courses c ON c.id = cs.course_id AND c.deleted_at IS NULL
            WHERE e.student_id = :sid AND {_ACTIVE_ENROLLMENT}
            ORDER BY cs.start_date DESC NULLS LAST
            """
        ),
        {"sid": student_id},
    )
    return [dict(r) for r in rows.mappings().all()]


async def update_profile(
    db: AsyncSession,
    actor_id: str,
    student_id: str,
    phone: Optional[str] = None,
    locale_pref: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Update student contact/locale fields. Rejects closed days (single-writer guard).

    `phone` maps to students.email (ERP has no phone column); `locale_pref`
    belongs to portal.users (the actor).
    """
    if await is_date_closed(db, date.today()):
        raise PermissionError("Closed day — student profile updates are disabled")

    if not await student_is_linked(db, actor_id, student_id):
        return None

    if phone is not None:
        await db.execute(
            text("UPDATE students SET email = :phone WHERE id = :sid"),
            {"phone": phone, "sid": student_id},
        )
    if locale_pref is not None:
        await db.execute(
            text("UPDATE portal.users SET locale_pref = :locale_pref, updated_at = now() WHERE id = :actor_id"),
            {"locale_pref": locale_pref, "actor_id": actor_id},
        )
    if phone is None and locale_pref is None:
        return await get_student(db, student_id)

    await db.flush()
    return await get_student(db, student_id)


async def student_is_linked(db: AsyncSession, actor_id: str, student_id: str) -> bool:
    """True if the actor can access this student — via a verified parent link
    or as the student's own portal account (portal.student_links)."""
    row = await db.execute(
        text(
            """
            SELECT 1
            FROM students s
            WHERE s.id = :student_id
              AND s.deleted_at IS NULL
              AND (
                EXISTS (
                  SELECT 1 FROM portal.parent_links pl
                  WHERE pl.guardian_id = :actor_id
                    AND pl.student_id = :student_id
                    AND pl.verified_at IS NOT NULL
                )
                OR EXISTS (
                  SELECT 1 FROM portal.student_links sl
                  WHERE sl.user_id = :actor_id
                    AND sl.student_id = :student_id
                )
              )
            """
        ),
        {"actor_id": actor_id, "student_id": student_id},
    )
    return row.first() is not None
