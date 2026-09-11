"""Editing a student must persist parent info.

Regression: StudentUpdate had no parent_* fields, so Pydantic dropped them and
the students-page edit form silently discarded "parent information" on save.
Parents live in portal.guardians / portal.parent_links, not on students.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.modules.academic.models import Student
from app.modules.academic.schemas import StudentResponse, StudentUpdate

PARENT = {
    "full_name": "أب الطالب",
    "email": "parent@example.com",
    "phone": "7700000000",
    "relationship": "father",
}


def _student() -> Student:
    return Student(id=uuid.uuid4(), student_code="11", full_name="علي قاسم")


def _list_db(items):
    count_res = MagicMock()
    count_res.scalar = MagicMock(return_value=len(items))
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=list(items))
    list_res = MagicMock()
    list_res.scalars = MagicMock(return_value=scalars)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[count_res, list_res])
    return db


def test_student_update_accepts_parent_fields():
    data = StudentUpdate(
        parent_full_name="أب الطالب",
        parent_phone="7700000000",
        parent_email="Parent@Example.com",
        parent_relationship="father",
    )
    assert data.parent_email == "parent@example.com"
    assert data.parent_phone == "7700000000"
    assert data.parent_relationship == "father"


def test_student_update_rejects_partial_parent_group():
    with pytest.raises(ValidationError, match="must be provided together"):
        StudentUpdate(parent_full_name="أب الطالب")


def test_student_update_allows_no_parent_fields():
    data = StudentUpdate(full_name="علي قاسم")
    assert data.parent_full_name is None


def test_student_response_exposes_parent_fields():
    payload = StudentResponse(
        id=uuid.uuid4(), student_code="11", full_name="علي",
        parent_full_name="أب الطالب", parent_phone="7700000000",
        parent_email="parent@example.com", parent_relationship="father",
    ).model_dump()
    assert payload["parent_full_name"] == "أب الطالب"
    assert payload["parent_relationship"] == "father"


@pytest.mark.asyncio
async def test_update_student_persists_parent_info():
    from app.modules.academic import service as academic_service

    student = _student()
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=student))
    )

    service = academic_service.portal_accounts_service
    with patch.object(service, "sync_student_portal_account", AsyncMock()), patch.object(
        service, "upsert_parent_portal_account", AsyncMock()
    ) as upsert, patch.object(
        service, "get_parent_for_student", AsyncMock(return_value=PARENT)
    ):
        result = await academic_service.update_student(
            db,
            student.id,
            {
                "full_name": "علي قاسم",
                "parent_full_name": PARENT["full_name"],
                "parent_email": PARENT["email"],
                "parent_phone": PARENT["phone"],
                "parent_relationship": PARENT["relationship"],
            },
        )

    upsert.assert_awaited_once()
    assert upsert.await_args.kwargs["email"] == PARENT["email"]
    assert upsert.await_args.kwargs["relationship"] == "father"
    assert result.parent_full_name == PARENT["full_name"]
    assert result.parent_relationship == "father"


@pytest.mark.asyncio
async def test_update_student_without_parent_fields_leaves_parents_alone():
    from app.modules.academic import service as academic_service

    student = _student()
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=student))
    )

    service = academic_service.portal_accounts_service
    with patch.object(service, "upsert_parent_portal_account", AsyncMock()) as upsert, patch.object(
        service, "get_parent_for_student", AsyncMock(return_value=None)
    ):
        result = await academic_service.update_student(db, student.id, {"full_name": "اسم جديد"})

    upsert.assert_not_awaited()
    assert result.full_name == "اسم جديد"
    assert result.parent_full_name is None


@pytest.mark.asyncio
async def test_list_students_attaches_parent_info():
    from app.modules.academic import service as academic_service

    student = _student()
    db = _list_db([student])

    service = academic_service.portal_accounts_service
    with patch.object(
        service, "get_parents_for_students", AsyncMock(return_value={str(student.id): PARENT})
    ):
        result = await academic_service.list_students(db)

    assert result["items"][0].parent_full_name == PARENT["full_name"]
    assert result["items"][0].parent_phone == PARENT["phone"]
