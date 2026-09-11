import logging
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from app.modules.academic.certificate_service import get_grade_label
from app.modules.academic.models import CourseSection, Enrollment
from app.modules.academic.pricing import (
    get_enrollment_price_components_batch,
    to_decimal,
)
from app.modules.lms.closure_service import is_date_closed
from app.modules.lms.models import Payment

logger = logging.getLogger(__name__)

# SQL fragments shared by multiple queries.
_ACTIVE_STUDENT = "s.deleted_at IS NULL"
_ACTIVE_ENROLLMENT = "e.deleted_at IS NULL"
_ACTIVE_SECTION = "cs.deleted_at IS NULL"


async def get_linked_students(db: AsyncSession, actor_id: str) -> list[dict[str, Any]]:
    """Students the actor may view.

    An actor is EITHER a student (portal.student_links — user_id is the PK, so at
    most one row) OR a guardian (portal.parent_links — many). Student accounts
    must see their own record, so that is checked first. Without the student
    branch /me returned [] for students and the whole portal dashboard rendered
    its empty state.
    """
    own = await db.execute(
        text(
            f"""
            SELECT s.id AS student_id, s.full_name, s.student_code
            FROM portal.student_links sl
            JOIN students s ON s.id = sl.student_id
            WHERE sl.user_id = :actor_id
              AND {_ACTIVE_STUDENT}
            ORDER BY s.full_name
            """
        ),
        {"actor_id": actor_id},
    )
    own_rows = [dict(r) for r in own.mappings().all()]
    if own_rows:
        return own_rows

    rows = await db.execute(
        text(
            f"""
            SELECT s.id AS student_id, s.full_name, s.student_code
            FROM portal.parent_links pl
            JOIN students s ON s.id = pl.student_id
            WHERE pl.guardian_id = :actor_id
              AND pl.verified_at IS NOT NULL
              AND {_ACTIVE_STUDENT}
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
    grades = [dict(r) for r in rows.mappings().all()]
    # Label server-side with the same bands the ERP certificate uses, rather than
    # duplicating the thresholds in TypeScript.
    for grade in grades:
        score = grade.get("final_score")
        grade["grade_label"] = get_grade_label(float(score)) if score is not None else None
    return grades


async def get_attendance(
    db: AsyncSession,
    student_id: str,
    section_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    query = text(
        f"""
        SELECT ar.status, asn.date, asn.section_id, c.name AS course_name
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
    """Every section the student enrolled in — their course history.

    Unlike the ERP views, a SOFT-DELETED enrollment (withdrawn) is returned too,
    flagged via ``withdrawn``, so the student's record stays complete. A pair of
    withdraw-then-re-enroll rows collapses to one via DISTINCT ON, preferring the
    live enrollment (``uq_active_enrollment`` permits one active per student +
    section, so duplicates are otherwise possible).
    """
    rows = await db.execute(
        text(
            f"""
            SELECT * FROM (
                SELECT DISTINCT ON (cs.id)
                       cs.id, c.name AS course_name, cs.status,
                       cs.start_date, cs.end_date,
                       cs.class_time, cs.class_duration_minutes, cs.classroom,
                       emp.full_name AS teacher_name,
                       (e.deleted_at IS NOT NULL) AS withdrawn,
                       ur.unenrolled_at AS withdrawn_at,
                       ur.reason AS withdrawal_reason
                FROM enrollments e
                JOIN course_sections cs ON cs.id = e.section_id AND {_ACTIVE_SECTION}
                JOIN courses c ON c.id = cs.course_id AND c.deleted_at IS NULL
                LEFT JOIN employees emp ON emp.id = cs.teacher_id
                LEFT JOIN unenrollment_records ur ON ur.enrollment_id = e.id
                WHERE e.student_id = :sid
                ORDER BY cs.id, (e.deleted_at IS NOT NULL) ASC, e.enrolled_at DESC NULLS LAST
            ) t
            ORDER BY t.start_date DESC NULLS LAST, t.course_name
            """
        ),
        {"sid": student_id},
    )
    sections = [dict(r) for r in rows.mappings().all()]
    for section in sections:
        section["class_time"] = _format_class_time(section.get("class_time"))
    return sections


def _format_class_time(value: Any) -> Optional[str]:
    """``time`` columns come back as ``datetime.time``; the DTO wants "HH:MM"."""
    if value is None:
        return None
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value)[:5]


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
    """True when the actor may read/write this student's data.

    Covers both account shapes: a student viewing their own record
    (portal.student_links) and a verified guardian link (portal.parent_links).
    This gates every student-scoped portal route, so the self branch is what
    makes the dashboard work for student accounts.
    """
    row = await db.execute(
        text(
            """
            SELECT 1
            FROM students s
            WHERE s.id = :student_id
              AND s.deleted_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM portal.student_links sl
                    WHERE sl.user_id = :actor_id
                      AND sl.student_id = s.id
                )
                OR EXISTS (
                    SELECT 1 FROM portal.parent_links pl
                    WHERE pl.guardian_id = :actor_id
                      AND pl.student_id = s.id
                      AND pl.verified_at IS NOT NULL
                )
              )
            """
        ),
        {"actor_id": actor_id, "student_id": student_id},
    )
    return row.first() is not None


async def get_fees_summary(db: AsyncSession, student_id: str) -> dict[str, Any]:
    """Fees owed vs paid for a student, per active enrollment.

    Uses the ORM + the canonical ``academic.pricing`` helper rather than raw SQL:
    net_price is derived from dated price history, per-enrollment overrides and
    the admin discount percentage, and re-deriving that here would drift from
    the ERP student report (``reports/service.py``), which uses the same helper.

    Totals only cover enrollments with a known net_price, so ``balance`` never
    mixes priced and unpriced enrollments. Payments are summed without a
    deletion filter, mirroring the ERP report.
    """
    student_uuid = uuid.UUID(str(student_id))

    enrollment_rows = (
        (
            await db.execute(
                select(Enrollment)
                .options(joinedload(Enrollment.section).joinedload(CourseSection.course))
                .where(
                    Enrollment.student_id == student_uuid,
                    Enrollment.deleted_at.is_(None),
                )
            )
        )
        .unique()
        .scalars()
        .all()
    )

    enrollments: list[Enrollment] = []
    sections_by_id: dict[uuid.UUID, CourseSection] = {}
    for enrollment in enrollment_rows:
        section = enrollment.section
        if section is None or section.deleted_at is not None:
            continue
        if section.course is None or section.course.deleted_at is not None:
            continue
        enrollments.append(enrollment)
        sections_by_id[enrollment.section_id] = section

    if not enrollments:
        return {
            "total_net_price": 0.0,
            "total_paid": 0.0,
            "balance": 0.0,
            "sections": [],
        }

    components = await get_enrollment_price_components_batch(
        db, enrollments, sections_by_id
    )

    paid_rows = (
        await db.execute(
            select(
                Payment.enrollment_id,
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(Payment.enrollment_id.in_([e.id for e in enrollments]))
            .group_by(Payment.enrollment_id)
        )
    ).all()
    paid_by_enrollment = {row[0]: row[1] for row in paid_rows}

    sections: list[dict[str, Any]] = []
    total_net = Decimal("0")
    total_paid = Decimal("0")

    for enrollment in enrollments:
        section = sections_by_id[enrollment.section_id]
        net_price = components.get(enrollment.id, {}).get("net_price")
        paid = to_decimal(paid_by_enrollment.get(enrollment.id) or 0) or Decimal("0")

        balance: Optional[Decimal] = None
        if net_price is not None:
            balance = net_price - paid
            total_net += net_price
            total_paid += paid

        sections.append(
            {
                "section_id": enrollment.section_id,
                "course_name": section.course.name,
                "net_price": float(net_price) if net_price is not None else None,
                "total_paid": float(paid),
                "balance": float(balance) if balance is not None else None,
            }
        )

    return {
        "total_net_price": float(total_net),
        "total_paid": float(total_paid),
        "balance": float(total_net - total_paid),
        "sections": sections,
    }
