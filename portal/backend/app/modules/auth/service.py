import hashlib
import logging
import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

# OTP storage: Redis when available, else in-memory (MVP console-log OTP).
_memory_otps: dict[str, dict] = {}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _redis():
    if not settings.REDIS_URL:
        return None
    import redis.asyncio as redis

    return redis.from_url(settings.REDIS_URL, decode_responses=True)


async def generate_otp(phone: str) -> str:
    """Generate a 6-digit OTP and store it with a TTL (default 5 min)."""
    code = f"{random.randint(0, 999999):06d}"
    client = await _redis()
    if client is not None:
        try:
            await client.set(f"otp:{phone}", code, ex=settings.OTP_TTL_SECONDS)
        except Exception:
            logger.warning("Redis unavailable — storing OTP in memory", exc_info=True)
            _memory_otps[phone] = {
                "code": code,
                "expires_at": datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_TTL_SECONDS),
            }
    else:
        _memory_otps[phone] = {
            "code": code,
            "expires_at": datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_TTL_SECONDS),
        }
    # MVP: console-log the OTP (swap to SMS gateway in Phase 4).
    logger.info("OTP for %s: %s", phone, code)
    return code


async def _verify_otp_code(phone: str, code: str) -> bool:
    client = await _redis()
    if client is not None:
        try:
            stored = await client.get(f"otp:{phone}")
            if stored is None:
                return False
            if stored != code:
                return False
            await client.delete(f"otp:{phone}")
            return True
        except Exception:
            logger.warning("Redis unavailable — falling back to in-memory OTP check", exc_info=True)

    entry = _memory_otps.get(phone)
    if not entry:
        return False
    if datetime.now(timezone.utc) > entry["expires_at"]:
        _memory_otps.pop(phone, None)
        return False
    if entry["code"] != code:
        return False
    _memory_otps.pop(phone, None)
    return True


async def get_or_create_user_by_phone(db: AsyncSession, phone: str, full_name: Optional[str] = None) -> dict:
    """Look up (or create) a portal user by E.164 phone. Returns dict row."""
    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active,
                       failed_login_attempts, locked_until
                FROM portal.users
                WHERE phone = :phone
                """
            ),
            {"phone": phone},
        )
    ).mappings().first()

    if row:
        return dict(row)

    name = full_name or "Portal User"
    result = await db.execute(
        text(
            """
            INSERT INTO portal.users (full_name, phone, locale_pref, phone_verified_at)
            VALUES (:full_name, :phone, 'ar', now())
            RETURNING id, phone, email, full_name, locale_pref, is_active,
                      failed_login_attempts, locked_until
            """
        ),
        {"full_name": name, "phone": phone},
    )
    return dict(result.mappings().first())


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
