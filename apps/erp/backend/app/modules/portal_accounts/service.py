"""Portal account provisioning — creates/syncs portal.users rows for students
and their parents from inside ERP transactions.

All functions are called with the SAME AsyncSession as the caller so they join
the caller's transaction (rollback together on failure). They only touch the
`portal.*` schema and `students`.
"""

import logging
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
        raise ValueError(f"Email already registered in the portal: {email}")

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
