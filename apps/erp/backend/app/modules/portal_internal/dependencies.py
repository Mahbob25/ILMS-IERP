import logging
from typing import Optional

from fastapi import Header, HTTPException, Request

from app.core.config import settings

logger = logging.getLogger(__name__)


async def verify_service_key(
    request: Request,
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
) -> str:
    """Gate /internal/portal/* behind the shared service key.

    Returns the actor (portal.users.id UUID) forwarded by the portal BFF,
    or "" when absent (allowed for health probes, required by handlers that
    need an actor). Header-key auth only — never reuse the cookie JWT flow.
    """
    expected = settings.ERP_SERVICE_KEY
    if not expected:
        logger.error("ERP_SERVICE_KEY not configured — refusing internal portal access")
        raise HTTPException(status_code=500, detail="ERP_SERVICE_KEY not configured")
    if x_service_key != expected:
        logger.warning(
            "INTERNAL_PORTAL_ACCESS denied — bad service key, path=%s actor=%s",
            request.url.path,
            x_actor_id or "",
        )
        raise HTTPException(status_code=401, detail="Invalid service key")
    return x_actor_id or ""
