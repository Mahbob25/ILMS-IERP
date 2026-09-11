"""A DB constraint violation must surface as a readable 409, never a bare 500."""

import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import IntegrityError

from app.core.error_handlers import integrity_error_handler
from app.core.error_messages import get_error_detail


def test_integrity_error_handler_returns_409_with_detail():
    app = FastAPI()
    app.add_exception_handler(IntegrityError, integrity_error_handler)

    @app.post("/boom")
    async def boom():
        raise IntegrityError(
            "INSERT INTO portal.users ...",
            {},
            Exception(
                'duplicate key value violates unique constraint "uq_users_phone"'
            ),
        )

    async def run():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/boom")

    response = asyncio.run(run())

    assert response.status_code == 409
    assert response.json()["detail"] == get_error_detail("duplicate_record", "ar")


def test_app_registers_integrity_error_handler():
    from app.main import app

    assert IntegrityError in app.exception_handlers
