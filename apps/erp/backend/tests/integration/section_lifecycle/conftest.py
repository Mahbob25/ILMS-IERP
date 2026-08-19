from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
import uuid
from unittest.mock import AsyncMock, Mock
import pytest


@pytest.fixture
def today():
    return date(2026, 7, 10)


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = AsyncMock()
    db.add_all = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.get = AsyncMock()
    return db


@pytest.fixture
def mock_user():
    return Mock(
        id=uuid.uuid4(),
        email="manager@test.com",
        is_superadmin=False,
    )


@pytest.fixture
def mock_course():
    return Mock(
        id=uuid.uuid4(),
        name="Test Course",
        code="TC101",
    )


@pytest.fixture
def mock_teacher_employee():
    return Mock(
        id=uuid.uuid4(),
        full_name="Teacher One",
    )


@pytest.fixture
def mock_student():
    return Mock(
        id=uuid.uuid4(),
        full_name="Test Student",
        student_code="STU001",
    )


@pytest.fixture
def mock_contract():
    c = Mock()
    c.id = uuid.uuid4()
    c.section_id = uuid.uuid4()
    c.teacher_id = uuid.uuid4()
    c.status = "active"
    return c
