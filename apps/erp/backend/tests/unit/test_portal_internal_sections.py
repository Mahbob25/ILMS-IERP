"""Portal course history.

get_sections must return every section the student enrolled in, INCLUDING
withdrawn ones (the enrollment is soft-deleted but the academic record must stay
complete) — unlike the ERP enrolment views, which filter deleted enrollments out.
It also now projects teacher, schedule and the withdrawal detail.
"""

import asyncio
import uuid
from datetime import date, time
from unittest.mock import AsyncMock, patch

from app.modules.portal_internal import service


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


def _db(*results) -> AsyncMock:
    db = AsyncMock()
    db.sqls: list[str] = []
    queue = list(results)

    async def execute(statement, params=None):
        db.sqls.append(str(statement))
        return queue.pop(0)

    db.execute = AsyncMock(side_effect=execute)
    return db


def _section_row(**overrides):
    row = {
        "id": uuid.uuid4(),
        "course_name": "Math",
        "status": "completed",
        "start_date": date(2026, 1, 10),
        "end_date": date(2026, 4, 20),
        "class_time": None,
        "class_duration_minutes": None,
        "classroom": None,
        "teacher_name": None,
        "withdrawn": False,
        "withdrawn_at": None,
        "withdrawal_reason": None,
    }
    row.update(overrides)
    return row


def test_sections_sql_does_not_filter_deleted_enrollments():
    """Regression: withdrawn courses used to vanish from the student's history."""
    db = _db(_Result([]))

    asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    sql = db.sqls[0]
    assert "e.deleted_at IS NULL" not in sql
    assert "unenrollment_records" in sql


def test_sections_excludes_only_deleted_sections_and_courses():
    db = _db(_Result([]))

    asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    sql = db.sqls[0]
    assert "cs.deleted_at IS NULL" in sql
    assert "c.deleted_at IS NULL" in sql


def test_sections_prefers_live_enrollment_over_withdrawn_duplicate():
    """Withdraw-then-re-enroll must collapse to one row, preferring the live one."""
    db = _db(_Result([]))

    asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    sql = db.sqls[0]
    assert "DISTINCT ON (cs.id)" in sql
    # False sorts before True, so the live (deleted_at IS NULL) row wins.
    assert "(e.deleted_at IS NOT NULL) ASC" in sql


def test_withdrawn_section_is_flagged_with_its_reason():
    section_id = uuid.uuid4()
    db = _db(
        _Result(
            [
                _section_row(
                    id=section_id,
                    status="active",
                    withdrawn=True,
                    withdrawn_at=None,
                    withdrawal_reason="schedule conflict",
                )
            ]
        )
    )

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert len(sections) == 1
    assert sections[0]["withdrawn"] is True
    assert sections[0]["withdrawal_reason"] == "schedule conflict"


def test_live_section_is_not_flagged_as_withdrawn():
    db = _db(_Result([_section_row(status="active", withdrawn=False)]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert sections[0]["withdrawn"] is False
    assert sections[0]["withdrawn_at"] is None


def test_teacher_and_schedule_are_projected():
    db = _db(_Result([_section_row(teacher_name="Mr Ali", classroom="B12")]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert sections[0]["teacher_name"] == "Mr Ali"
    assert sections[0]["classroom"] == "B12"


def test_section_without_a_teacher_is_still_returned():
    """LEFT JOIN: an unassigned section must not drop out of the history."""
    db = _db(_Result([_section_row(teacher_name=None)]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert len(sections) == 1
    assert sections[0]["teacher_name"] is None
    assert "LEFT JOIN employees" in db.sqls[0]


def test_class_time_is_formatted_as_hh_mm():
    db = _db(_Result([_section_row(class_time=time(14, 30))]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert sections[0]["class_time"] == "14:30"


def test_class_time_none_is_preserved():
    db = _db(_Result([_section_row(class_time=None)]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert sections[0]["class_time"] is None


def test_class_time_string_value_is_normalized():
    """Defensive: a driver returning a string must not crash the formatting."""
    db = _db(_Result([_section_row(class_time="08:05:00")]))

    sections = asyncio.run(service.get_sections(db, str(uuid.uuid4())))

    assert sections[0]["class_time"] == "08:05"


# --- Attendance gains section_id ----------------------------------------

def test_attendance_projects_section_id():
    db = _db(_Result([]))

    asyncio.run(service.get_attendance(db, str(uuid.uuid4())))

    assert "asn.section_id" in db.sqls[0]


# --- Grades gain grade_label ---------------------------------------------

def test_grade_label_is_computed_from_the_score():
    db = _db(_Result([{"section_id": uuid.uuid4(), "course_name": "Math", "final_score": 87.5, "graded_at": None}]))

    grades = asyncio.run(service.get_grades(db, str(uuid.uuid4())))

    # Same bands the ERP certificate uses (>=80 -> Very Good).
    assert grades[0]["grade_label"] == "Very Good"


def test_grade_label_is_none_when_ungraded():
    db = _db(_Result([{"section_id": uuid.uuid4(), "course_name": "Math", "final_score": None, "graded_at": None}]))

    grades = asyncio.run(service.get_grades(db, str(uuid.uuid4())))

    assert grades[0]["grade_label"] is None


def test_grade_label_uses_the_erp_bands():
    """Guards against reimplementing the thresholds differently in the portal."""
    from app.modules.academic.certificate_service import get_grade_label

    for score, expected in [(95, "Excellent"), (85, "Very Good"), (75, "Good"), (65, "Pass"), (40, "Fail")]:
        db = _db(_Result([{"section_id": uuid.uuid4(), "course_name": "X", "final_score": score, "graded_at": None}]))
        grades = asyncio.run(service.get_grades(db, str(uuid.uuid4())))
        assert grades[0]["grade_label"] == expected == get_grade_label(score)
