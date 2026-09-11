"""Portal /me must resolve a *student's own* record, not only parent links.

Regression: get_linked_students queried portal.parent_links exclusively, so a
student account got linked_students: [] and the whole portal dashboard rendered
its empty state. student_is_linked had the same gap, which would 403 every
student-scoped route even after /me returned the student.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock

from app.modules.portal_internal import service


class _Result:
    """Mimics the awaited execute() result: .mappings().all() and .first()."""

    def __init__(self, rows=None):
        self._rows = rows or []

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


def _db(*results) -> AsyncMock:
    """AsyncSession stub returning the given results in call order."""
    db = AsyncMock()
    db.sqls: list[str] = []
    queue = list(results)

    async def execute(statement, params=None):
        db.sqls.append(str(statement))
        return queue.pop(0)

    db.execute = AsyncMock(side_effect=execute)
    return db


def test_student_account_sees_its_own_record():
    own = {"student_id": uuid.uuid4(), "full_name": "طالب", "student_code": "STU001"}
    db = _db(_Result([own]))

    rows = asyncio.run(
        service.get_linked_students(db, "11111111-1111-1111-1111-111111111111")
    )

    assert rows == [own]
    # Own-record branch short-circuits: parent links are never queried.
    assert len(db.sqls) == 1
    assert "portal.student_links" in db.sqls[0]


def test_guardian_falls_back_to_parent_links():
    child = {"student_id": uuid.uuid4(), "full_name": "ولد", "student_code": "STU002"}
    db = _db(_Result([]), _Result([child]))

    rows = asyncio.run(
        service.get_linked_students(db, "22222222-2222-2222-2222-222222222222")
    )

    assert rows == [child]
    assert "portal.student_links" in db.sqls[0]
    assert "portal.parent_links" in db.sqls[1]
    # Only verified links count.
    assert "verified_at IS NOT NULL" in db.sqls[1]


def test_guardian_with_no_links_gets_nothing():
    db = _db(_Result([]), _Result([]))

    rows = asyncio.run(
        service.get_linked_students(db, "33333333-3333-3333-3333-333333333333")
    )

    assert rows == []


def test_student_is_linked_accepts_own_record_and_verified_parent_link():
    db = _db(_Result([(1,)]))

    linked = asyncio.run(
        service.student_is_linked(db, "actor-id", "student-id")
    )

    assert linked is True
    sql = db.sqls[0]
    # Both account shapes are accepted by one query.
    assert "portal.student_links" in sql
    assert "portal.parent_links" in sql
    assert "verified_at IS NOT NULL" in sql
    assert "s.deleted_at IS NULL" in sql


def test_student_is_linked_false_when_no_link_row():
    db = _db(_Result([]))

    assert asyncio.run(service.student_is_linked(db, "actor-id", "student-id")) is False
