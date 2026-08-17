import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.security import get_password_hash

logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def find_user_by_email(db: AsyncSession, email: str) -> Optional[dict]:
    """Look up a portal user by email (case-insensitive). Returns dict row or None."""
    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active,
                       failed_login_attempts, locked_until, password_hash
                FROM portal.users
                WHERE lower(email) = lower(:email)
                """
            ),
            {"email": email},
        )
    ).mappings().first()
    return dict(row) if row else None


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[dict]:
    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active,
                       failed_login_attempts, locked_until, password_hash
                FROM portal.users
                WHERE id = :uid
                """
            ),
            {"uid": user_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def is_locked(user: dict) -> bool:
    locked_until = user.get("locked_until")
    if not locked_until:
        return False
    if isinstance(locked_until, datetime):
        return locked_until.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)
    return False


async def record_failed_attempt(db: AsyncSession, user_id: str) -> None:
    """Increment failed_login_attempts; lock for 15 min at 5 attempts."""
    await db.execute(
        text(
            """
            UPDATE portal.users
            SET failed_login_attempts = failed_login_attempts + 1,
                locked_until = CASE
                    WHEN failed_login_attempts + 1 >= 5
                    THEN now() + interval '15 minutes'
                    ELSE locked_until
                END,
                updated_at = now()
            WHERE id = :uid
            """
        ),
        {"uid": user_id},
    )
    await db.flush()


async def reset_failed_attempts(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        text(
            """
            UPDATE portal.users
            SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
            WHERE id = :uid
            """
        ),
        {"uid": user_id},
    )
    await db.flush()


async def store_refresh_token(db: AsyncSession, user_id: str, token: str) -> None:
    hashed = _hash_token(token)
    await db.execute(
        text(
            """
            INSERT INTO portal.refresh_tokens (user_id, token_hash, expires_at)
            VALUES (:uid, :token_hash, now() + interval '30 days')
            """
        ),
        {"uid": user_id, "token_hash": hashed},
    )
    await db.flush()


async def revoke_refresh_token(db: AsyncSession, token: str) -> bool:
    hashed = _hash_token(token)
    result = await db.execute(
        text(
            """
            UPDATE portal.refresh_tokens
            SET revoked = true
            WHERE token_hash = :token_hash AND revoked = false
            """
        ),
        {"token_hash": hashed},
    )
    await db.flush()
    return result.rowcount > 0


async def refresh_token_is_valid(db: AsyncSession, token: str) -> Optional[dict]:
    """Look up an un-revoked, un-expired refresh token + its user."""
    hashed = _hash_token(token)
    row = (
        await db.execute(
            text(
                """
                SELECT rt.id AS refresh_id, u.id, u.phone, u.email, u.full_name,
                       u.locale_pref, u.is_active
                FROM portal.refresh_tokens rt
                JOIN portal.users u ON u.id = rt.user_id
                WHERE rt.token_hash = :token_hash
                  AND rt.revoked = false
                  AND rt.expires_at > now()
                """
            ),
            {"token_hash": hashed},
        )
    ).mappings().first()
    return dict(row) if row else None


async def rotate_refresh_token(db: AsyncSession, token: str) -> None:
    """Revoke the old refresh token (rotation on every refresh)."""
    await revoke_refresh_token(db, token)


async def mark_sso_ticket_consumed(db: AsyncSession, jti: str) -> bool:
    """Atomically mark an SSO ticket consumed. Returns False if already used."""
    result = await db.execute(
        text(
            """
            INSERT INTO portal.sso_tickets (jti, consumed_at)
            VALUES (:jti, now())
            ON CONFLICT (jti) DO NOTHING
            """
        ),
        {"jti": jti},
    )
    await db.flush()
    return result.rowcount > 0


async def change_password(db: AsyncSession, user_id: str, new_password: str) -> None:
    await db.execute(
        text(
            """
            UPDATE portal.users
            SET password_hash = :password_hash, updated_at = now()
            WHERE id = :uid
            """
        ),
        {"uid": user_id, "password_hash": get_password_hash(new_password)},
    )
    await db.flush()
