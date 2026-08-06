"""Notification emitters — thin functions called after business transactions commit.

Each emitter resolves recipient user ids, then calls create_notification which
deduplicates via ON CONFLICT DO NOTHING. All emitters are best-effort: a failure
to notify never breaks the originating business flow.
"""

import logging
import uuid
from typing import Optional
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.modules.identity.models import User, Role
from app.modules.notifications.service import create_notification

logger = logging.getLogger(__name__)

ROLE_MANAGER = "manager"
ROLE_SECRETARY = "secretary"
ROLE_SUPERADMIN = "superadmin"


async def _user_ids_by_role(db: AsyncSession, *role_names: str) -> list[uuid.UUID]:
    result = await db.execute(
        select(User.id)
        .join(User.role)
        .where(
            Role.name.in_(role_names),
            User.is_active == True,
        )
    )
    return [row[0] for row in result.fetchall()]


async def _user_id_for_employee(db: AsyncSession, employee_id: uuid.UUID) -> Optional[uuid.UUID]:
    result = await db.execute(
        select(User.id).where(
            User.employee_id == employee_id,
            User.is_active == True,
        )
    )
    row = result.first()
    return row[0] if row else None


# ── Cashier emitters ──────────────────────────────────────────────────────────

async def emit_refund_requested(
    db: AsyncSession,
    *,
    pending_refund_id: uuid.UUID,
    source: str,
) -> None:
    """Called after a PendingRefund row is created (cancellation, unenrollment)."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="refund_requested",
            title_key="notif.refund_requested",
            body_key="notif.refund_requested_body",
            params={"source": source},
            target_href="dashboard/cashier/refunds",
            priority="high",
            dedupe_key=f"refund_requested:{pending_refund_id}",
        )


async def emit_refund_disbursed(db: AsyncSession, *, refund_id: uuid.UUID) -> None:
    """Called after a Refund row is created (disbursement)."""
    user_ids = await _user_ids_by_role(db, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="refund_disbursed",
            title_key="notif.refund_disbursed",
            body_key="notif.refund_disbursed_body",
            params={"refund_id": str(refund_id)},
            target_href="dashboard/cashier/refunds",
            priority="normal",
            dedupe_key=f"refund_disbursed:{refund_id}",
        )


# ── Expense emitter ───────────────────────────────────────────────────────────

async def emit_withdrawal_requested(db: AsyncSession, *, expense_id: uuid.UUID) -> None:
    """Called after a teacher_withdrawal expense is created."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="withdrawal_requested",
            title_key="notif.withdrawal_requested",
            body_key="notif.withdrawal_requested_body",
            params={"expense_id": str(expense_id)},
            target_href="dashboard/expenses",
            priority="high",
            dedupe_key=f"withdrawal_requested:{expense_id}",
        )


# ── Closure emitter ───────────────────────────────────────────────────────────

async def emit_unlock_requested(db: AsyncSession, *, closure_date: date) -> None:
    """Called after closure status → unlock_requested."""
    date_str = closure_date.isoformat()
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="unlock_requested",
            title_key="notif.unlock_requested",
            body_key="notif.unlock_requested_body",
            params={"date": date_str},
            target_href="dashboard/daily-closures",
            priority="high",
            dedupe_key=f"unlock_requested:{date_str}",
        )


# ── Amendment emitter ─────────────────────────────────────────────────────────

async def emit_amendment_pending(db: AsyncSession, *, amendment_id: uuid.UUID) -> None:
    """Called after a compensation amendment is created with PENDING status."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER, ROLE_SUPERADMIN)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="amendment_pending",
            title_key="notif.amendment_pending",
            body_key="notif.amendment_pending_body",
            params={"amendment_id": str(amendment_id)},
            target_href="dashboard/sections",
            priority="normal",
            dedupe_key=f"amendment_pending:{amendment_id}",
        )


# ── Section emitters ──────────────────────────────────────────────────────────

async def emit_section_ready_for_completion(
    db: AsyncSession, *, section_id: uuid.UUID
) -> None:
    """Called when a section status transitions to 'ready_for_completion'."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="section_ready_for_completion",
            title_key="notif.section_ready_for_completion",
            body_key="notif.section_ready_for_completion_body",
            params={"section_id": str(section_id)},
            target_href="dashboard/sections",
            priority="normal",
            dedupe_key=f"section_ready_for_completion:{section_id}",
        )


async def emit_section_cancelled(db: AsyncSession, *, section_id: uuid.UUID) -> None:
    """Called after a section is cancelled."""
    user_ids = await _user_ids_by_role(db, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="section_cancelled",
            title_key="notif.section_cancelled",
            body_key="notif.section_cancelled_body",
            params={"section_id": str(section_id)},
            target_href="dashboard/sections",
            priority="high",
            dedupe_key=f"section_cancelled:{section_id}",
        )


# ── Daily checl emitters ──────────────────────────────────────────────────────

async def emit_unclosed_day(db: AsyncSession, *, day: date) -> None:
    """Called when yesterday has no closed DailyClosure row."""
    date_str = day.isoformat()
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="unclosed_day",
            title_key="notif.unclosed_day",
            body_key="notif.unclosed_day_body",
            params={"date": date_str},
            target_href="dashboard/daily-closures",
            priority="high",
            dedupe_key=f"unclosed_day:{date_str}",
        )


async def emit_section_low_occupancy(
    db: AsyncSession, *, section_id: uuid.UUID
) -> None:
    """Called when a pending section has low occupancy."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="section_low_occupancy",
            title_key="notif.section_low_occupancy",
            body_key="notif.section_low_occupancy_body",
            params={"section_id": str(section_id)},
            target_href="dashboard/sections",
            priority="normal",
            dedupe_key=f"section_low_occupancy:{section_id}",
        )


async def emit_section_overdue(db: AsyncSession, *, section_id: uuid.UUID) -> None:
    """Called when an active section is past its end_date."""
    user_ids = await _user_ids_by_role(db, ROLE_MANAGER, ROLE_SECRETARY)
    for uid in user_ids:
        await create_notification(
            db,
            user_id=uid,
            type_="section_overdue",
            title_key="notif.section_overdue",
            body_key="notif.section_overdue_body",
            params={"section_id": str(section_id)},
            target_href="dashboard/sections",
            priority="high",
            dedupe_key=f"section_overdue:{section_id}",
        )


# ── Grade emitter ─────────────────────────────────────────────────────────────

async def emit_grade_submitted(
    db: AsyncSession,
    *,
    section_id: uuid.UUID,
    teacher_employee_id: uuid.UUID,
) -> None:
    """Called after a grade is submitted for a section.

    Notification goes to the teacher who owns the section.
    """
    user_id = await _user_id_for_employee(db, teacher_employee_id)
    if user_id is None:
        return
    await create_notification(
        db,
        user_id=user_id,
        type_="grade_submitted",
        title_key="notif.grade_submitted",
        body_key="notif.grade_submitted_body",
        params={"section_id": str(section_id)},
        target_href="dashboard/gradebook",
        priority="low",
        dedupe_key=f"grade_submitted:{section_id}",
    )
