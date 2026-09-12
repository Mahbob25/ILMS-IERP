from slowapi import Limiter
from slowapi.util import get_remote_address


def get_client_ip(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Stricter than ERP: portal is public-facing (parents), so default is tighter.
# Per-endpoint overrides (auth 5–10/min, photo 5/min, AI 10/min, force-refresh
# 1/s) live on the routers. This is the defense-in-depth app layer — Caddy also
# caps the request body at the edge (6MB, just above the 5MB photo limit).
limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["30/minute"],
)
