import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_certificate_number_format():
    from app.modules.academic.certificate_service import _next_certificate_number

    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar.return_value = 0
    db.execute = AsyncMock(return_value=count_result)

    with patch("app.modules.academic.certificate_service.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 7, 14, tzinfo=timezone.utc)
        mock_dt.timezone = timezone

        cert_number = await _next_certificate_number(db)

    parts = cert_number.split("-")
    assert len(parts) == 3
    assert parts[0] == "CERT"
    assert parts[1] == "2026"
    assert len(parts[2]) == 6
    assert parts[2].isdigit()


@pytest.mark.asyncio
async def test_certificate_number_increments():
    from app.modules.academic.certificate_service import _next_certificate_number

    calls = []

    async def mock_execute(stmt):
        for c in calls:
            pass
        result = MagicMock()
        result.scalar.return_value = len(calls)
        calls.append(1)
        return result

    db = AsyncMock()
    db.execute = mock_execute

    with patch("app.modules.academic.certificate_service.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 7, 14, tzinfo=timezone.utc)
        mock_dt.timezone = timezone

        n1 = await _next_certificate_number(db)
        n2 = await _next_certificate_number(db)

    assert n1 == "CERT-2026-000001"
    assert n2 == "CERT-2026-000002"


@pytest.mark.asyncio
async def test_certificate_number_yearly_reset():
    from app.modules.academic.certificate_service import _next_certificate_number

    count_result = MagicMock()
    count_result.scalar.return_value = 0

    db = AsyncMock()
    db.execute = AsyncMock(return_value=count_result)

    with patch("app.modules.academic.certificate_service.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2027, 1, 15, tzinfo=timezone.utc)
        mock_dt.timezone = timezone

        cert_number = await _next_certificate_number(db)

    assert cert_number.startswith("CERT-2027-")
    assert cert_number == "CERT-2027-000001"


@pytest.mark.asyncio
async def test_certificate_number_with_existing_count():
    from app.modules.academic.certificate_service import _next_certificate_number

    count_result = MagicMock()
    count_result.scalar.return_value = 42

    db = AsyncMock()
    db.execute = AsyncMock(return_value=count_result)

    with patch("app.modules.academic.certificate_service.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 7, 14, tzinfo=timezone.utc)
        mock_dt.timezone = timezone

        cert_number = await _next_certificate_number(db)

    assert cert_number == "CERT-2026-000043"
