from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.session import async_session_maker
from app.modules.lms.idempotency_service import check_idempotency_key, store_idempotency_key


class IdempotencyMiddleware(BaseHTTPMiddleware):
    IDEMPOTENT_METHODS = {"POST", "PATCH", "PUT"}

    async def dispatch(self, request: Request, call_next):
        if request.method not in self.IDEMPOTENT_METHODS:
            return await call_next(request)

        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            return await call_next(request)

        endpoint = request.url.path

        async with async_session_maker() as db:
            existing = await check_idempotency_key(db, idempotency_key, endpoint)
            if existing:
                return Response(
                    content=existing.response_body,
                    status_code=existing.response_status,
                    media_type="application/json",
                    headers={"X-Idempotency-Replayed": "true"},
                )

        response = await call_next(request)

        if response.status_code < 500 and hasattr(response, "body"):
            body = await response.body()
            async with async_session_maker() as db:
                await store_idempotency_key(
                    db,
                    idempotency_key=idempotency_key,
                    endpoint=endpoint,
                    response_status=response.status_code,
                    response_body=body,
                )

        return response
