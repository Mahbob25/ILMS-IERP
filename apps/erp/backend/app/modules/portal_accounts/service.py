"""Portal account provisioning — creates/syncs portal.users rows for students
and their parents from inside ERP transactions.

All functions are called with the SAME AsyncSession as the caller so they join
the caller's transaction (rollback together on failure). They only touch the
`portal.*` schema and `students`.
"""

import logging
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_messages import get_error_detail
from app.modules.identity.security import get_password_hash

logger = logging.getLogger(__name__)


async def find_portal_user_by_email(db: AsyncSession, email: str) -> Optional[dict[str, Any]]:
    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active
                FROM portal.users
                WHERE lower(email) = lower(:email)
                """
            ),
            {"email": email},
        )
    ).mappings().first()
    return dict(row) if row else None


async def find_portal_user_by_phone(db: AsyncSession, phone: str) -> Optional[dict[str, Any]]:
    """Portal account owning a phone number (portal.users.phone is UNIQUE)."""
    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active
                FROM portal.users
                WHERE phone = :phone
                """
            ),
            {"phone": phone},
        )
    ).mappings().first()
    return dict(row) if row else None


async def find_portal_user_by_student_id(db: AsyncSession, student_id: str) -> Optional[dict[str, Any]]:
    """Portal account linked to a student via portal.student_links."""
    row = (
        await db.execute(
            text(
                """
                SELECT u.id, u.phone, u.email, u.full_name, u.locale_pref, u.is_active
                FROM portal.student_links sl
                JOIN portal.users u ON u.id = sl.user_id
                WHERE sl.student_id = :sid
                """
            ),
            {"sid": student_id},
        )
    ).mappings().first()
    return dict(row) if row else None


_PARENT_SELECT = """
    SELECT pl.student_id, u.full_name, u.email, u.phone, pl.relationship
    FROM portal.parent_links pl
    JOIN portal.users u ON u.id = pl.guardian_id
"""


async def get_parent_for_student(db: AsyncSession, student_id: str) -> Optional[dict[str, Any]]:
    """Primary linked parent for a student, as editable parent fields."""
    row = (
        await db.execute(
            text(
                _PARENT_SELECT
                + """
                WHERE pl.student_id = :sid
                ORDER BY pl.verified_at DESC NULLS LAST, u.created_at
                LIMIT 1
                """
            ),
            {"sid": student_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def get_parents_for_students(
    db: AsyncSession, student_ids: list[Any]
) -> dict[str, dict[str, Any]]:
    """Primary linked parent per student, keyed by student id (one query)."""
    if not student_ids:
        return {}
    rows = await db.execute(
        text(
            _PARENT_SELECT
            + """
            WHERE pl.student_id IN :ids
            ORDER BY pl.student_id, pl.verified_at DESC NULLS LAST, u.created_at
            """
        ).bindparams(bindparam("ids", expanding=True)),
        {"ids": list(student_ids)},
    )
    parents: dict[str, dict[str, Any]] = {}
    for row in rows.mappings().all():
        key = str(row["student_id"])
        parents.setdefault(key, dict(row))
    return parents


async def create_student_portal_account(
    db: AsyncSession,
    student_id: str,
    email: str,
    phone: str,
    full_name: str,
) -> dict[str, Any]:
    """Create a portal.users account for a student + portal.student_links row.

    Credentials: username = email, password = phone (bcrypt-hashed). The phone
    stays the student's contact number; the user can change the password later
    from the portal settings.
    """
    existing = await find_portal_user_by_email(db, email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("student_email_taken", "ar"),
        )
    existing_phone = await find_portal_user_by_phone(db, phone)
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("student_phone_taken", "ar"),
        )

    result = await db.execute(
        text(
            """
            INSERT INTO portal.users (phone, email, password_hash, full_name, locale_pref)
            VALUES (:phone, :email, :password_hash, :full_name, 'ar')
            RETURNING id, phone, email, full_name, locale_pref, is_active
            """
        ),
        {
            "phone": phone,
            "email": email,
            "password_hash": get_password_hash(phone),
            "full_name": full_name,
        },
    )
    user = dict(result.mappings().first())
    await db.execute(
        text(
            """
            INSERT INTO portal.student_links (user_id, student_id)
            VALUES (:user_id, :student_id)
            """
        ),
        {"user_id": user["id"], "student_id": student_id},
    )
    await db.flush()
    return user


async def create_parent_portal_account(
    db: AsyncSession,
    student_id: str,
    *,
    full_name: str,
    email: str,
    phone: str,
    relationship: Optional[str] = None,
) -> dict[str, Any]:
    """Create a portal guardian account for a parent and link them to the student.

    Credentials: username = parent email, password = parent phone. The link is
    auto-verified (verified_at = now()) because the school created it.
    """
    existing = await find_portal_user_by_email(db, email)
    if existing:
        # If the account already exists, (re)link it to this student.
        await _upsert_parent_link(
            db, guardian_id=str(existing["id"]), student_id=student_id, relationship=relationship
        )
        return existing

    existing_phone = await find_portal_user_by_phone(db, phone)
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("parent_phone_taken", "ar"),
        )

    result = await db.execute(
        text(
            """
            INSERT INTO portal.users (phone, email, password_hash, full_name, locale_pref)
            VALUES (:phone, :email, :password_hash, :full_name, 'ar')
            RETURNING id, phone, email, full_name, locale_pref, is_active
            """
        ),
        {
            "phone": phone,
            "email": email,
            "password_hash": get_password_hash(phone),
            "full_name": full_name,
        },
    )
    parent = dict(result.mappings().first())
    await db.execute(
        text(
            """
            INSERT INTO portal.guardians (id, national_id)
            VALUES (:id, NULL)
            """
        ),
        {"id": parent["id"]},
    )
    await _upsert_parent_link(
        db, guardian_id=str(parent["id"]), student_id=student_id, relationship=relationship
    )
    await db.flush()
    return parent


async def upsert_parent_portal_account(
    db: AsyncSession,
    student_id: str,
    *,
    full_name: str,
    email: str,
    phone: str,
    relationship: Optional[str] = None,
) -> dict[str, Any]:
    """Create the parent portal account, or update and (re)link an existing one.

    Used when a parent's details are edited from the ERP: an account that already
    exists for that email has its name (and phone, when free) refreshed instead of
    being left stale.
    """
    existing = await find_portal_user_by_email(db, email)
    if not existing:
        return await create_parent_portal_account(
            db,
            student_id,
            full_name=full_name,
            email=email,
            phone=phone,
            relationship=relationship,
        )

    await _sync_parent_user(db, existing, full_name=full_name, phone=phone)
    await _upsert_parent_link(
        db, guardian_id=str(existing["id"]), student_id=student_id, relationship=relationship
    )
    await db.flush()
    return await find_portal_user_by_email(db, email) or existing


async def _sync_parent_user(
    db: AsyncSession, user: dict[str, Any], *, full_name: str, phone: str
) -> None:
    sets = ["full_name = :full_name", "updated_at = now()"]
    params: dict[str, Any] = {"user_id": user["id"], "full_name": full_name}
    if phone and phone != user.get("phone"):
        holder = await find_portal_user_by_phone(db, phone)
        if holder and str(holder["id"]) != str(user["id"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_error_detail("parent_phone_taken", "ar"),
            )
        # The phone doubles as the initial password, so a change re-seeds the hash.
        sets += ["phone = :phone", "password_hash = :password_hash"]
        params["phone"] = phone
        params["password_hash"] = get_password_hash(phone)
    await db.execute(
        text(f"UPDATE portal.users SET {', '.join(sets)} WHERE id = :user_id"),
        params,
    )


async def _upsert_parent_link(
    db: AsyncSession,
    *,
    guardian_id: str,
    student_id: str,
    relationship: Optional[str],
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO portal.parent_links (guardian_id, student_id, relationship, verified_at)
            VALUES (:guardian_id, :student_id, :relationship, now())
            ON CONFLICT (guardian_id, student_id)
            DO UPDATE SET relationship = EXCLUDED.relationship, verified_at = now()
            """
        ),
        {
            "guardian_id": guardian_id,
            "student_id": student_id,
            "relationship": relationship,
        },
    )


async def sync_student_portal_account(
    db: AsyncSession,
    student_id: str,
    *,
    email: Optional[str],
    phone: Optional[str],
    full_name: Optional[str],
) -> None:
    """Keep an existing student portal account in sync after student edits.

    - email / full_name updates propagate to portal.users.
    - phone updates propagate AND reset the password to the new phone (the
      phone is the initial credential, so changing it re-seeds the password).
    """
    account = await find_portal_user_by_student_id(db, student_id)
    if not account or not account.get("id"):
        return
    sets = []
    params: dict[str, Any] = {"user_id": account["id"]}
    if email is not None:
        sets.append("email = :email")
        params["email"] = email
    if full_name is not None:
        sets.append("full_name = :full_name")
        params["full_name"] = full_name
    if phone is not None:
        sets.append("phone = :phone")
        params["phone"] = phone
        sets.append("password_hash = :password_hash")
        params["password_hash"] = get_password_hash(phone)
    if not sets:
        return
    sets.append("updated_at = now()")
    await db.execute(
        text(f"UPDATE portal.users SET {', '.join(sets)} WHERE id = :user_id"),
        params,
    )
    await db.flush()


# --- Admin management (ERP dashboard) ---
#
# Student vs parent is inferred structurally: a portal.guardians row means a
# parent account, otherwise it is a student account (portal.users has no role).

_LIST_SELECT = """
    SELECT
        u.id, u.email, u.phone, u.full_name, u.locale_pref, u.is_active,
        u.failed_login_attempts, u.locked_until, u.created_at,
        CASE WHEN g.id IS NOT NULL THEN 'parent' ELSE 'student' END AS account_type,
        s.id AS student_id, s.student_code, s.full_name AS student_name,
        (SELECT count(*) FROM portal.parent_links pl WHERE pl.guardian_id = u.id)
            AS linked_students_count
    FROM portal.users u
    LEFT JOIN portal.guardians g ON g.id = u.id
    LEFT JOIN portal.student_links sl ON sl.user_id = u.id
    LEFT JOIN students s ON s.id = sl.student_id
"""

_SORTABLE_COLUMNS = {
    "full_name": "u.full_name",
    "email": "u.email",
    "created_at": "u.created_at",
    "is_active": "u.is_active",
}


def _account_where(
    search: Optional[str], account_type: str, account_status: str
) -> tuple[str, dict[str, Any]]:
    clauses: list[str] = []
    params: dict[str, Any] = {}
    if search:
        clauses.append("(u.full_name ILIKE :q OR u.email ILIKE :q OR u.phone ILIKE :q)")
        params["q"] = f"%{search}%"
    if account_type == "parent":
        clauses.append("g.id IS NOT NULL")
    elif account_type == "student":
        clauses.append("g.id IS NULL")
    if account_status == "active":
        clauses.append("u.is_active = true AND (u.locked_until IS NULL OR u.locked_until < now())")
    elif account_status == "inactive":
        clauses.append("u.is_active = false")
    elif account_status == "locked":
        clauses.append("u.locked_until IS NOT NULL AND u.locked_until > now()")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


async def list_portal_accounts(
    db: AsyncSession,
    *,
    search: Optional[str] = None,
    account_type: str = "all",
    status: str = "all",
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[dict[str, Any]], int]:
    where, params = _account_where(search, account_type, status)

    total = (
        await db.execute(
            text(
                "SELECT count(*) FROM portal.users u "
                "LEFT JOIN portal.guardians g ON g.id = u.id "
                f"{where}"
            ),
            params,
        )
    ).scalar_one()

    column = _SORTABLE_COLUMNS.get(sort_by, "u.created_at")
    direction = "ASC" if str(sort_order).lower() == "asc" else "DESC"
    rows = (
        await db.execute(
            text(
                _LIST_SELECT
                + f" {where} ORDER BY {column} {direction} NULLS LAST LIMIT :limit OFFSET :skip"
            ),
            {**params, "limit": limit, "skip": skip},
        )
    ).mappings().all()
    return [dict(row) for row in rows], int(total)


async def get_portal_account(db: AsyncSession, user_id: Any) -> Optional[dict[str, Any]]:
    """Account header + inferred type (used for 404s and type checks)."""
    row = (
        await db.execute(
            text(
                """
                SELECT u.id, u.email, u.phone, u.full_name, u.is_active,
                       u.failed_login_attempts, u.locked_until,
                       CASE WHEN g.id IS NOT NULL THEN 'parent' ELSE 'student' END AS account_type
                FROM portal.users u
                LEFT JOIN portal.guardians g ON g.id = u.id
                WHERE u.id = :user_id
                """
            ),
            {"user_id": user_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def list_linked_students(db: AsyncSession, guardian_id: Any) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                """
                SELECT s.id AS student_id, s.student_code, s.full_name,
                       pl.relationship, pl.verified_at
                FROM portal.parent_links pl
                JOIN students s ON s.id = pl.student_id
                WHERE pl.guardian_id = :guardian_id
                ORDER BY s.full_name
                """
            ),
            {"guardian_id": guardian_id},
        )
    ).mappings().all()
    return [dict(row) for row in rows]


async def get_portal_account_detail(db: AsyncSession, user_id: Any) -> Optional[dict[str, Any]]:
    row = (
        await db.execute(text(_LIST_SELECT + " WHERE u.id = :user_id"), {"user_id": user_id})
    ).mappings().first()
    if not row:
        return None
    account = dict(row)
    account["linked_students"] = (
        await list_linked_students(db, user_id) if account["account_type"] == "parent" else []
    )
    return account


async def student_exists(db: AsyncSession, student_id: Any) -> bool:
    row = (
        await db.execute(
            text("SELECT 1 FROM students WHERE id = :student_id AND deleted_at IS NULL"),
            {"student_id": student_id},
        )
    ).first()
    return row is not None


async def revoke_portal_refresh_tokens(db: AsyncSession, user_id: Any) -> None:
    """Kill every active session for a portal account (password change / deactivation)."""
    await db.execute(
        text(
            """
            UPDATE portal.refresh_tokens SET revoked = true
            WHERE user_id = :user_id AND revoked = false
            """
        ),
        {"user_id": user_id},
    )


async def set_portal_password(
    db: AsyncSession, user_id: Any, plaintext: str
) -> Optional[dict[str, Any]]:
    row = (
        await db.execute(
            text(
                """
                UPDATE portal.users
                SET password_hash = :password_hash, failed_login_attempts = 0,
                    locked_until = NULL, updated_at = now()
                WHERE id = :user_id
                RETURNING id, is_active, failed_login_attempts, locked_until
                """
            ),
            {"user_id": user_id, "password_hash": get_password_hash(plaintext)},
        )
    ).mappings().first()
    await revoke_portal_refresh_tokens(db, user_id)
    await db.flush()
    return dict(row) if row else None


async def set_portal_active(
    db: AsyncSession, user_id: Any, is_active: bool
) -> Optional[dict[str, Any]]:
    row = (
        await db.execute(
            text(
                """
                UPDATE portal.users SET is_active = :is_active, updated_at = now()
                WHERE id = :user_id
                RETURNING id, is_active, failed_login_attempts, locked_until
                """
            ),
            {"user_id": user_id, "is_active": is_active},
        )
    ).mappings().first()
    if not is_active:
        await revoke_portal_refresh_tokens(db, user_id)
    await db.flush()
    return dict(row) if row else None


async def unlock_portal_account(db: AsyncSession, user_id: Any) -> Optional[dict[str, Any]]:
    row = (
        await db.execute(
            text(
                """
                UPDATE portal.users
                SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
                WHERE id = :user_id
                RETURNING id, is_active, failed_login_attempts, locked_until
                """
            ),
            {"user_id": user_id},
        )
    ).mappings().first()
    await db.flush()
    return dict(row) if row else None


async def link_parent_to_student(
    db: AsyncSession, guardian_id: Any, student_id: Any, relationship: Optional[str] = None
) -> None:
    await db.execute(
        text(
            """
            INSERT INTO portal.guardians (id, national_id) VALUES (:guardian_id, NULL)
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {"guardian_id": guardian_id},
    )
    await _upsert_parent_link(
        db, guardian_id=str(guardian_id), student_id=str(student_id), relationship=relationship
    )
    await db.flush()


async def unlink_parent_from_student(db: AsyncSession, guardian_id: Any, student_id: Any) -> int:
    result = await db.execute(
        text(
            """
            DELETE FROM portal.parent_links
            WHERE guardian_id = :guardian_id AND student_id = :student_id
            """
        ),
        {"guardian_id": guardian_id, "student_id": student_id},
    )
    await db.flush()
    return result.rowcount or 0


async def deactivate_portal_account_for_student(
    db: AsyncSession, student_id: Any
) -> Optional[dict[str, Any]]:
    """Called when a student is deleted so their portal login stops working."""
    account = await find_portal_user_by_student_id(db, str(student_id))
    if not account or not account.get("id"):
        return None
    await set_portal_active(db, str(account["id"]), False)
    return account
