import logging
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import get_db

from . import service as auth_service
from .dependencies import get_current_portal_user
from .schemas import (
    EmailLoginRequest,
    SSOLoginRequest,
    ChangePasswordRequest,
    PortalUserResponse,
    ProfileUpdateRequest,
)
from .security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    decode_sso_ticket,
    verify_password,
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


async def _issue_portal_session(db: AsyncSession, response: Response, user: dict) -> dict:
    """Issue portal access/refresh cookies for an authenticated portal user."""
    payload = {"sub": str(user["id"]), "email": user.get("email")}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    await auth_service.store_refresh_token(db, str(user["id"]), refresh_token)
    _set_auth_cookies(response, access_token, refresh_token)
    return {
        "id": str(user["id"]),
        "phone": user.get("phone"),
        "email": user.get("email"),
        "full_name": user["full_name"],
        "locale_pref": user["locale_pref"],
        "is_active": user["is_active"],
    }


@auth_router.post("/login")
@limiter.limit("10/minute")
async def login(
    body: EmailLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Email + password login (fallback / direct portal login). Primary path is SSO."""
    user = await auth_service.find_user_by_email(db, body.email.strip().lower())
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if await auth_service.is_locked(user):
        raise HTTPException(status_code=401, detail="Account temporarily locked — try again later")
    if not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        await auth_service.record_failed_attempt(db, str(user["id"]))
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await auth_service.reset_failed_attempts(db, str(user["id"]))
    return await _issue_portal_session(db, response, user)


@auth_router.post("/sso")
@limiter.limit("20/minute")
async def sso_login(
    body: SSOLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Validate a one-time SSO ticket issued by the ERP login, then start a portal session."""
    try:
        payload = decode_sso_ticket(body.ticket)
        if payload.get("type") != "sso" or payload.get("aud") != "portal":
            raise HTTPException(status_code=401, detail="Invalid ticket")
    except (ExpiredSignatureError, InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid or expired ticket")

    jti = payload.get("jti")
    user_id = payload.get("sub")
    if not jti or not user_id:
        raise HTTPException(status_code=401, detail="Invalid ticket payload")

    if not await auth_service.mark_sso_ticket_consumed(db, jti):
        raise HTTPException(status_code=401, detail="Ticket already used")

    user = await auth_service.get_user_by_id(db, str(user_id))
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return await _issue_portal_session(db, response, user)


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
    return await _issue_portal_session(db, response, user)


@auth_router.post("/change-password")
@limiter.limit("5/minute")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password (requires the current password)."""
    user = await auth_service.get_user_by_id(db, str(current_user["id"]))
    if not user or not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await auth_service.change_password(db, str(current_user["id"]), body.new_password)
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
