"""Portal account provisioning must reject duplicate email/phone with a 409.

Regression: portal.users.phone is UNIQUE, but create_student_portal_account only
checked the email. A student registering with an already-used phone blew up as a
raw IntegrityError -> bare ASGI 500 -> "فشل إنشاء الطالب" / "Server error".
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.error_messages import get_error_detail
from app.modules.portal_accounts import service as portal_accounts_service


class _FakeResult:
    """Mimics the sync ``.mappings().first()`` chain of an awaited execute()."""

    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row

    def scalar_one_or_none(self):
        return None


def _db(*, email_row=None, phone_row=None, inserted_row=None) -> AsyncMock:
    db = AsyncMock()
    db.flush = AsyncMock()

    async def execute(statement, params=None):
        sql = str(statement)
        if "INSERT INTO portal.users" in sql:
            return _FakeResult(inserted_row)
        if "lower(email)" in sql:
            return _FakeResult(email_row)
        if "WHERE phone = :phone" in sql:
            return _FakeResult(phone_row)
        return _FakeResult(None)

    db.execute = AsyncMock(side_effect=execute)
    return db


def _executed_sql(db: AsyncMock) -> str:
    return " ".join(str(call.args[0]) for call in db.execute.await_args_list)


@pytest.mark.asyncio
async def test_create_student_portal_account_rejects_taken_email():
    db = _db(email_row={"id": uuid.uuid4(), "email": "ali@gmail.com"})

    with pytest.raises(HTTPException) as exc:
        await portal_accounts_service.create_student_portal_account(
            db,
            student_id=str(uuid.uuid4()),
            email="ali@gmail.com",
            phone="774257025",
            full_name="علي قاسم",
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == get_error_detail("student_email_taken", "ar")


@pytest.mark.asyncio
async def test_create_student_portal_account_rejects_taken_phone():
    db = _db(email_row=None, phone_row={"id": uuid.uuid4(), "phone": "774257025"})

    with pytest.raises(HTTPException) as exc:
        await portal_accounts_service.create_student_portal_account(
            db,
            student_id=str(uuid.uuid4()),
            email="ali@gmail.com",
            phone="774257025",
            full_name="علي قاسم",
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == get_error_detail("student_phone_taken", "ar")
    assert "INSERT INTO portal.users" not in _executed_sql(db)


@pytest.mark.asyncio
async def test_create_student_portal_account_creates_when_free():
    user_id = uuid.uuid4()
    db = _db(
        email_row=None,
        phone_row=None,
        inserted_row={
            "id": user_id,
            "phone": "774257025",
            "email": "new@gmail.com",
            "full_name": "طالب جديد",
            "locale_pref": "ar",
            "is_active": True,
        },
    )

    user = await portal_accounts_service.create_student_portal_account(
        db,
        student_id=str(uuid.uuid4()),
        email="new@gmail.com",
        phone="774257025",
        full_name="طالب جديد",
    )

    assert user["id"] == user_id
    sql = _executed_sql(db)
    assert "INSERT INTO portal.users" in sql
    assert "INSERT INTO portal.student_links" in sql


@pytest.mark.asyncio
async def test_create_student_with_already_used_phone_returns_409_not_500():
    """The exact reported failure: creating a student whose phone is taken."""
    from app.modules.academic import service as academic_service

    db = _db(email_row=None, phone_row={"id": uuid.uuid4(), "phone": "774257025"})
    db.add = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await academic_service.create_student(
            db,
            {
                "student_code": "11",
                "full_name": "علي قاسم",
                "email": "ali@gmail.com",
                "phone": "774257025",
            },
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == get_error_detail("student_phone_taken", "ar")


@pytest.mark.asyncio
async def test_create_parent_portal_account_rejects_taken_phone():
    db = _db(email_row=None, phone_row={"id": uuid.uuid4(), "phone": "774257025"})

    with pytest.raises(HTTPException) as exc:
        await portal_accounts_service.create_parent_portal_account(
            db,
            student_id=str(uuid.uuid4()),
            full_name="ولي الأمر",
            email="parent@example.com",
            phone="774257025",
            relationship="father",
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == get_error_detail("parent_phone_taken", "ar")
    assert "INSERT INTO portal.users" not in _executed_sql(db)


@pytest.mark.asyncio
async def test_create_parent_portal_account_relinks_when_email_exists():
    existing_id = uuid.uuid4()
    db = _db(email_row={"id": existing_id, "email": "parent@example.com"})

    parent = await portal_accounts_service.create_parent_portal_account(
        db,
        student_id=str(uuid.uuid4()),
        full_name="ولي الأمر",
        email="parent@example.com",
        phone="779999999",
        relationship="father",
    )

    assert parent["id"] == existing_id
    sql = _executed_sql(db)
    assert "INSERT INTO portal.users" not in sql
    assert "INSERT INTO portal.parent_links" in sql
