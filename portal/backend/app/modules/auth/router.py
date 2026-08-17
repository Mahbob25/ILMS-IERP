import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import get_db

from . import service as auth_service
from .dependencies import get_current_portal_user
from .schemas import OTPRequest, OTPVerifyRequest, PortalUserResponse, ProfileUpdateRequest
from .security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    ExpiredSignatureError,
    InvalidTokenError,
)

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE = "portal_access_token"
REFRESH_COOKIE = "portal_refresh_token"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.ENVIRONMENT != "development"
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    secure = settings.ENVIRONMENT != "development"
    response.delete_cookie(key=ACCESS_COOKIE, path="/", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(key=REFRESH_COOKIE, path="/", secure=secure, httponly=True, samesite="lax")


@auth_router.post("/request-otp")
@limiter.limit("5/minute")
async def request_otp(
    body: OTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Send an OTP to the phone. MVP: console-log only (swap to SMS in Phase 4)."""
    user = await auth_service.get_or_create_user_by_phone(db, body.phone)
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    await auth_service.generate_otp(body.phone)
    # Rate limiting: one OTP per phone per minute (Redis sliding window).
    return {"detail": "OTP sent (console-logged for MVP)", "ttl_seconds": settings.OTP_TTL_SECONDS}


@auth_router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(
    body: OTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Verify OTP → set portal HttpOnly cookies (10m access / 30d refresh)."""
    user = await auth_service.get_or_create_user_by_phone(db, body.phone)
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if await auth_service.is_locked(user):
        raise HTTPException(status_code=401, detail="Account temporarily locked — try again later")

    if not await auth_service._verify_otp_code(body.phone, body.code):
        await auth_service.record_failed_attempt(db, str(user["id"]))
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")

    await auth_service.reset_failed_attempts(db, str(user["id"]))

    payload = {"sub": str(user["id"]), "phone": body.phone}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    await auth_service.store_refresh_token(db, str(user["id"]), refresh_token)

    _set_auth_cookies(response, access_token, refresh_token)
    return {
        "id": str(user["id"]),
        "full_name": user["full_name"],
        "locale_pref": user["locale_pref"],
    }


@auth_router.post("/refresh")
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    response: Response,
    portal_refresh_token: Optional[str] = Cookie(None, alias="portal_refresh_token"),
    db: AsyncSession = Depends(get_db),
):
    """Rotate the refresh token; set fresh portal cookies."""
    if not portal_refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = decode_token(portal_refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except (ExpiredSignatureError, InvalidTokenError):
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = await auth_service.refresh_token_is_valid(db, portal_refresh_token)
    if not user or not user["is_active"]:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token revoked or expired")

    await auth_service.rotate_refresh_token(db, portal_refresh_token)

    new_payload = {"sub": str(user["id"]), "phone": user.get("phone")}
    new_access = create_access_token(new_payload)
    new_refresh = create_refresh_token(new_payload)
    await auth_service.store_refresh_token(db, str(user["id"]), new_refresh)

    _set_auth_cookies(response, new_access, new_refresh)
    return {"status": "success"}


@auth_router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    portal_refresh_token: Optional[str] = Cookie(None, alias="portal_refresh_token"),
    db: AsyncSession = Depends(get_db),
):
    if portal_refresh_token:
        await auth_service.revoke_refresh_token(db, portal_refresh_token)
    _clear_auth_cookies(response)
    return {"status": "success"}


@auth_router.get("/csrf")
async def csrf_token():
    return {"status": "ok"}


@auth_router.get("/me", response_model=PortalUserResponse)
async def auth_me(current_user: dict = Depends(get_current_portal_user)):
    return PortalUserResponse(**current_user)
