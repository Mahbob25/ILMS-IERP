"""Global database error handling."""

import logging

from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.core.error_messages import get_error_detail

logger = logging.getLogger(__name__)


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Map an unhandled constraint violation to a 409 with a readable detail.

    Without this, a unique / foreign-key violation escapes as a bare ASGI 500
    with an empty body, which the frontends surface as a generic server error.
    """
    logger.warning(
        "IntegrityError on %s %s: %s", request.method, request.url.path, exc.orig
    )
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": get_error_detail("duplicate_record", "ar")},
    )
