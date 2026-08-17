import secrets

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import settings


class CSRFMiddleware(BaseHTTPMiddleware):
    """Mirror of the ERP CSRF middleware, but cookie is portal-scoped.

    The cookie name stays ``csrf_token`` (same-origin CSRF defense on the
    portal subdomain only). Mutating requests require an ``X-CSRF-Token``
    header matching the cookie — same pattern the ERP frontend already uses.
    """

    SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
    COOKIE_NAME = "csrf_token"

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        if not request.cookies.get(self.COOKIE_NAME):
            token = secrets.token_hex(32)
            secure = settings.ENVIRONMENT != "development"
            response.set_cookie(
                key=self.COOKIE_NAME,
                value=token,
                secure=secure,
                samesite="lax",
                httponly=False,
            )

        if request.method in self.SAFE_METHODS:
            return response

        has_auth = request.cookies.get("portal_access_token") or request.cookies.get("portal_refresh_token")
        if not has_auth:
            return response

        csrf_header = request.headers.get("X-CSRF-Token")
        csrf_cookie = request.cookies.get(self.COOKIE_NAME)

        if not csrf_header or not csrf_cookie or csrf_header != csrf_cookie:
            error_response = JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"},
            )
            token = secrets.token_hex(32)
            secure = settings.ENVIRONMENT != "development"
            error_response.set_cookie(
                key=self.COOKIE_NAME,
                value=token,
                secure=secure,
                samesite="lax",
                httponly=False,
            )
            return error_response

        return response
