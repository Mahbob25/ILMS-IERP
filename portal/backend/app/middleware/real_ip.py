from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class RealIPMiddleware(BaseHTTPMiddleware):
    """Parse X-Forwarded-For (Caddy/Cloudflare) to get the real client IP."""

    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
            port = request.scope.get("client", (None, None))[1] or 0
            request.scope["client"] = (client_ip, port)
        return await call_next(request)
