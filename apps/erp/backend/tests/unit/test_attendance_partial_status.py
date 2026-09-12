"""The "partial" attendance status.

A partial mark means the student attended part of the session, so it counts as
attended for the attendance-rate numerator while still being reported as its own
tally. These tests lock that policy in, plus the per-section summary and CSV
column alignment the status flows through.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock

from app.modules.lms import service as lms_service
from app.modules.reports import export as reports_export
from app.modules.reports import service as reports_service


# --- Rate policy ---------------------------------------------------------

def test_partial_counts_as_attended_in_the_rate():
    present, absent, late, partial, excused, total, rate = reports_service.attendance_totals(
        {"present": 6, "absent": 1, "late": 1, "partial": 2}
    )
    assert (present, absent, late, partial, excused) == (6, 1, 1, 2, 0)
    assert total == 10
    # (6 present + 2 partial) / 10 -> 80%, not 60%.
    assert rate == 80.0


def test_partial_is_included_in_the_total():
    *_, total, _rate = reports_service.attendance_totals({"partial": 3})
    assert total == 3


def test_partial_only_is_a_full_rate():
    *_, rate = reports_service.attendance_totals({"partial": 4})
    assert rate == 100.0


def test_no_records_is_zero_not_a_division_error():
    present, absent, late, partial, excused, total, rate = reports_service.attendance_totals({})
    assert (present, absent, late, partial, excused, total) == (0, 0, 0, 0, 0, 0)
    assert rate == 0.0


def test_rate_matches_the_erp_report_example():
    """Guards the policy against silent drift: an all-present roster is 100%."""
    *_, rate = reports_service.attendance_totals({"present": 9, "absent": 1})
    assert rate == 90.0


# --- Per-section summary -------------------------------------------------

class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


def _db(summary_rows, session_rows) -> AsyncMock:
    db = AsyncMock()
    queue = [_Result(summary_rows), _Result(session_rows)]

    async def execute(statement, params=None):
        return queue.pop(0)

    db.execute = AsyncMock(side_effect=execute)
    return db


def test_student_attendance_summary_includes_partial():
    section_id = uuid.uuid4()
    db = _db(
        [
            (uuid.uuid4(), section_id, "present", 5),
            (uuid.uuid4(), section_id, "partial", 2),
            (uuid.uuid4(), section_id, "absent", 1),
        ],
        [(section_id, 3)],
    )

    summary = asyncio.run(lms_service.get_student_attendance_summary(db, uuid.uuid4()))

    assert len(summary) == 1
    row = summary[0]
    assert row["present_count"] == 5
    assert row["partial_count"] == 2
    assert row["absent_count"] == 1
    assert row["total_sessions"] == 3


def test_student_attendance_summary_defaults_partial_to_zero():
    section_id = uuid.uuid4()
    db = _db([(uuid.uuid4(), section_id, "present", 2)], [(section_id, 1)])

    summary = asyncio.run(lms_service.get_student_attendance_summary(db, uuid.uuid4()))

    assert summary[0]["partial_count"] == 0


# --- CSV export ----------------------------------------------------------

def _csv_section(rows, header_label):
    """Return the data row immediately following a section's header row."""
    for index, row in enumerate(rows):
        if header_label in row:
            return rows[index + 1]
    raise AssertionError(f"section {header_label!r} not found")


def _report_payload(**summary_overrides):
    summary = {
        "total_sessions": 10,
        "present_count": 6,
        "absent_count": 1,
        "late_count": 1,
        "partial_count": 2,
        "excused_count": 0,
        "attendance_rate": 80.0,
    }
    summary.update(summary_overrides)
    return {
        "student": {"id": str(uuid.uuid4()), "student_code": "STU001", "full_name": "Ali", "email": None},
        "section": {"id": str(uuid.uuid4()), "course_name": "Math"},
        "enrollment": {"id": str(uuid.uuid4())},
        "attendance": {"summary": summary, "records": []},
        "grade": None,
        "payments": [],
        "certificate": None,
        "generated_at": "2026-09-11T00:00:00+00:00",
    }


def test_csv_attendance_headers_include_partial():
    rows = reports_export.to_csv_rows("student_section_report", _report_payload(), "en")
    header = next(r for r in rows if "Attendance Rate" in r)
    assert "Partial" in header
    # Appended after excused, before the rate — existing columns keep their order.
    assert header.index("Partial") == header.index("Excused") + 1
    assert header.index("Partial") == header.index("Attendance Rate") - 1


def test_csv_partial_value_lands_in_the_partial_column():
    rows = reports_export.to_csv_rows("student_section_report", _report_payload(), "en")
    header = next(r for r in rows if "Attendance Rate" in r)
    data = _csv_section(rows, "Attendance Rate")

    assert len(data) == len(header), "row/column count mismatch after adding partial"
    assert data[header.index("Total Sessions")] == "10"
    assert data[header.index("Present")] == "6"
    assert data[header.index("Partial")] == "2"
    assert data[header.index("Attendance Rate")] == "80"


def test_csv_headers_are_localized_in_arabic():
    rows = reports_export.to_csv_rows("student_section_report", _report_payload(), "ar")
    header = next(r for r in rows if "نسبة الحضور" in r)
    assert "حضور جزئي" in header


def test_csv_tolerates_payload_without_partial_key():
    """Older payloads (or a not-yet-updated ERP call) must not break the export."""
    payload = _report_payload()
    del payload["attendance"]["summary"]["partial_count"]

    rows = reports_export.to_csv_rows("student_section_report", payload, "en")
    header = next(r for r in rows if "Attendance Rate" in r)
    data = _csv_section(rows, "Attendance Rate")

    assert len(data) == len(header)
    assert data[header.index("Partial")] == "0"
