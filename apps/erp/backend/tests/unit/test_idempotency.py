import uuid
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.fixture
def idempotency_key():
    return str(uuid.uuid4())


@pytest.mark.asyncio
async def test_check_idempotency_key_returns_record_when_found(mock_db, idempotency_key):
    from app.modules.lms.idempotency_service import check_idempotency_key

    fake_record = MagicMock()
    fake_record.idempotency_key = idempotency_key
    fake_record.endpoint = "/api/test"
    fake_record.response_status = 200
    fake_record.response_body = {"success": True}

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=fake_record))

    result = await check_idempotency_key(mock_db, idempotency_key, "/api/test")
    assert result is not None
    assert result.idempotency_key == idempotency_key


@pytest.mark.asyncio
async def test_check_idempotency_key_returns_none_when_not_found(mock_db, idempotency_key):
    from app.modules.lms.idempotency_service import check_idempotency_key

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(scalar_one_or_none=MagicMock(return_value=None))

    result = await check_idempotency_key(mock_db, idempotency_key, "/api/other")
    assert result is None


@pytest.mark.asyncio
async def test_store_idempotency_key_creates_record(mock_db, idempotency_key):
    from app.modules.lms.idempotency_service import store_idempotency_key

    mock_db.add = AsyncMock()
    mock_db.commit = AsyncMock()

    body = json.dumps({"success": True}).encode("utf-8")
    record = await store_idempotency_key(
        mock_db, idempotency_key=idempotency_key, endpoint="/api/test",
        response_status=201, response_body=body,
    )
    assert record.idempotency_key == idempotency_key
    assert record.response_status == 201


@pytest.mark.asyncio
async def test_cleanup_expired_keys_removes_old_records(mock_db):
    from app.modules.lms.idempotency_service import cleanup_expired_keys

    mock_db.execute = AsyncMock()
    mock_db.execute.return_value = MagicMock(rowcount=5)
    mock_db.commit = AsyncMock()

    result = await cleanup_expired_keys(mock_db)
    assert result == 5
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_idempotency_middleware_rejects_duplicate():
    from app.middleware.idempotency import IdempotencyMiddleware

    request = MagicMock()
    request.method = "POST"
    request.headers = {"Idempotency-Key": "dup-key"}
    request.url.path = "/api/test"

    fake_record = MagicMock()
    fake_record.response_status = 200
    fake_record.response_body = '{"success": true, "id": "abc"}'

    with patch("app.middleware.idempotency.async_session_maker") as mock_session_maker:
        mock_db = AsyncMock()
        mock_db.__aenter__.return_value = mock_db
        mock_db.__aexit__ = AsyncMock(return_value=None)
        mock_session_maker.return_value = mock_db

        with patch("app.middleware.idempotency.check_idempotency_key", AsyncMock(return_value=fake_record)):
            middleware = IdempotencyMiddleware(lambda r: None)
            response = await middleware.dispatch(request, lambda r: None)
            assert response.status_code == 200
            assert response.headers.get("X-Idempotency-Replayed") == "true"


@pytest.mark.asyncio
async def test_idempotency_middleware_passes_through_without_key():
    from app.middleware.idempotency import IdempotencyMiddleware

    request = MagicMock()
    request.method = "POST"
    request.headers = {}
    request.url.path = "/api/test"

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = IdempotencyMiddleware(lambda r: None)
    response = await middleware.dispatch(request, call_next)
    assert response is not None
    call_next.assert_called_once_with(request)


@pytest.mark.asyncio
async def test_idempotency_middleware_skips_get_requests():
    from app.middleware.idempotency import IdempotencyMiddleware

    request = MagicMock()
    request.method = "GET"
    request.headers = {"Idempotency-Key": "some-key"}

    call_next = AsyncMock()
    call_next.return_value = MagicMock(status_code=200)

    middleware = IdempotencyMiddleware(lambda r: None)
    response = await middleware.dispatch(request, call_next)
    assert response is not None
    call_next.assert_called_once_with(request)
