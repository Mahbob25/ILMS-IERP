from typing import Optional

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db.session import get_db
from app.modules.auth.security import decode_token, ExpiredSignatureError, InvalidTokenError


async def get_current_portal_user(
    portal_access_token: Optional[str] = Cookie(None, alias="portal_access_token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Validate the portal access JWT cookie and load the portal user row.

    Returns a dict {id, phone, email, full_name, locale_pref, is_active}.
    Uses portal.* only — never touches the ERP users table.
    """
    if not portal_access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = decode_token(portal_access_token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    row = (
        await db.execute(
            text(
                """
                SELECT id, phone, email, full_name, locale_pref, is_active
                FROM portal.users
                WHERE id = :uid
                """
            ),
            {"uid": user_id},
        )
    ).mappings().first()

    if not row or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )
    return dict(row)
