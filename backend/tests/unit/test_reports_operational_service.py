"""Unit tests for the operational report service functions (Phase 3, group B).

Covers B1 (Student Register), B2 (Enrollment Summary), B3 (Section Occupancy)
and B4 (Attendance Summary) aggregations. Uses a mocked db session.
"""

import uuid
from datetime import date
from unittest.mock import AsyncMock, Mock

from app.modules.reports import service as reports_service


def _scalars_result(items):
    r = Mock()
    r.unique.return_value = r
    r.scalars.return_value.all.return_value = items
    return r


def _rows_result(rows):
    r = Mock()
    r.fetchall.return_value = rows
    return r


def _scalar_result(value):
    r = Mock()
    r.scalar.return_value = value
    return r


def _student(sid, code="S1", name="Student", email=None):
    s = Mock()
    s.id = sid
    s.student_code = code
    s.full_name = name
    s.email = email
    return s


def _section(section_id, course="Math", teacher="Teacher A", capacity=30,
             enrolled=10, status="active"):
    s = Mock()
    s.id = section_id
    s.status = status
    s.enrolled_count = enrolled
    s.capacity = capacity
    s.course = Mock(name="course")
    s.course.name = course
    s.teacher_employee = Mock(name="teacher")
    s.teacher_employee.full_name = teacher
    return s


class TestStudentRegister:
    async def test_builds_register_with_counts(self, mock_db):
        sid1, sid2 = uuid.uuid4(), uuid.uuid4()
        s1 = _student(sid1, "S1", "Alice", "a@x.com")
        s2 = _student(sid2, "S2", "Bob", None)
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([s1, s2]),
                _rows_result([(sid1,)]),
            ]
        )

        report = await reports_service.get_student_register(mock_db)

        assert report["total_students"] == 2
        assert report["active_count"] == 1
        assert report["unenrolled_count"] == 1
        assert report["status"] == "all"
        assert len(report["students"]) == 2
        assert report["students"][0]["full_name"] == "Alice"
        assert report["students"][0]["is_enrolled"] is True
        assert report["students"][1]["is_enrolled"] is False

    async def test_status_enrolled_filters_rows(self, mock_db):
        sid = uuid.uuid4()
        s = _student(sid, "S1", "Alice", None)
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([s]),
                _rows_result([(sid,)]),
            ]
        )

        report = await reports_service.get_student_register(mock_db, status="enrolled")

        assert report["status"] == "enrolled"
        assert len(report["students"]) == 1
        assert report["students"][0]["is_enrolled"] is True
        assert report["active_count"] == 1
        assert report["unenrolled_count"] == 0

    async def test_status_unenrolled_returns_row(self, mock_db):
        sid = uuid.uuid4()
        s = _student(sid, "S2", "Bob", None)
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([s]),
                _rows_result([]),
            ]
        )

        report = await reports_service.get_student_register(mock_db, status="unenrolled")

        assert report["status"] == "unenrolled"
        assert len(report["students"]) == 1
        assert report["students"][0]["is_enrolled"] is False
        assert report["active_count"] == 0
        assert report["unenrolled_count"] == 1

    async def test_empty_register(self, mock_db):
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalars_result([]),
                _rows_result([]),
            ]
        )

        report = await reports_service.get_student_register(mock_db)

        assert report["total_students"] == 0
        assert report["students"] == []


class TestEnrollmentSummary:
    async def test_aggregates_by_course_and_section(self, mock_db):
        sid1, sid2 = uuid.uuid4(), uuid.uuid4()
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalar_result(5),
                _rows_result([("Math", 3), ("Science", 2)]),
                _rows_result([(sid1, "Math", 3), (sid2, "Science", 2)]),
            ]
        )

        report = await reports_service.get_enrollment_summary(
            mock_db, date(2026, 7, 1), date(2026, 7, 31)
        )

        assert report["start_date"] == "2026-07-01"
        assert report["end_date"] == "2026-07-31"
        assert report["total_enrollments"] == 5
        assert report["by_course"][0]["course_name"] == "Math"
        assert report["by_course"][0]["enrollments"] == 3
        assert report["by_section"][0]["section_id"] == str(sid1)
        assert report["by_section"][1]["enrollments"] == 2

    async def test_empty_period(self, mock_db):
        mock_db.execute = AsyncMock(
            side_effect=[
                _scalar_result(0),
                _rows_result([]),
                _rows_result([]),
            ]
        )

        report = await reports_service.get_enrollment_summary(mock_db)

        assert report["total_enrollments"] == 0
        assert report["by_course"] == []
        assert report["by_section"] == []
        assert report["start_date"] is None
        assert report["end_date"] is None


class TestSectionOccupancy:
    async def test_computes_occupancy_rates(self, mock_db):
        sid1, sid2 = uuid.uuid4(), uuid.uuid4()
        sec1 = _section(sid1, "Math", "Teacher A", capacity=30, enrolled=15)
        sec2 = _section(sid2, "Science", "Teacher B", capacity=20, enrolled=20)
        mock_db.execute = AsyncMock(return_value=_scalars_result([sec1, sec2]))

        report = await reports_service.get_section_occupancy(mock_db)

        assert report["total_sections"] == 2
        assert report["total_capacity"] == 50
        assert report["total_enrolled"] == 35
        assert report["overall_occupancy_rate"] == 70.0
        assert report["sections"][0]["occupancy_rate"] == 50.0
        assert report["sections"][1]["occupancy_rate"] == 100.0
        assert report["sections"][0]["course_name"] == "Math"

    async def test_zero_capacity_section_safely_rate(self, mock_db):
        sid = uuid.uuid4()
        sec = _section(sid, "Physics", "Teacher A", capacity=0, enrolled=0, status="pending")
        mock_db.execute = AsyncMock(return_value=_scalars_result([sec]))

        report = await reports_service.get_section_occupancy(mock_db)

        assert report["sections"][0]["occupancy_rate"] == 0.0
        assert report["overall_occupancy_rate"] == 0.0
        assert report["sections"][0]["status"] == "pending"


class TestAttendanceSummary:
    async def test_aggregates_sessions_records_and_coverage(self, mock_db):
        sid1, sid2 = uuid.uuid4(), uuid.uuid4()
        sec1 = _section(sid1, "Math", "Teacher A", capacity=10, enrolled=10)
        sec2 = _section(sid2, "Science", "Teacher B", capacity=10, enrolled=10)
        mock_db.execute = AsyncMock(
            side_effect=[
                _rows_result([(sid1, 5), (sid2, 5)]),   # sessions per section
                _rows_result([(sid1, 50), (sid2, 25)]),  # records per section
                _scalars_result([sec1, sec2]),          # section details
            ]
        )

        report = await reports_service.get_attendance_summary(
            mock_db, date(2026, 7, 1), date(2026, 7, 31)
        )

        assert report["total_sections"] == 2
        assert report["total_sessions"] == 10
        assert report["total_records"] == 75
        assert report["sections"][0]["coverage_rate"] == 100.0
        assert report["sections"][1]["coverage_rate"] == 50.0
        assert report["sections"][0]["course_name"] == "Math"

    async def test_no_sessions_returns_empty(self, mock_db):
        mock_db.execute = AsyncMock(side_effect=[_rows_result([])])

        report = await reports_service.get_attendance_summary(mock_db)

        assert report["total_sections"] == 0
        assert report["total_sessions"] == 0
        assert report["total_records"] == 0
        assert report["sections"] == []

    async def test_zero_enrolled_sections_safe(self, mock_db):
        sid = uuid.uuid4()
        sec = _section(sid, "Physics", "Teacher A", capacity=10, enrolled=0)
        mock_db.execute = AsyncMock(
            side_effect=[
                _rows_result([(sid, 2)]),   # sessions
                _rows_result([(sid, 0)]),   # records
                _scalars_result([sec]),     # sections details
            ]
        )

        report = await reports_service.get_attendance_summary(mock_db)

        assert report["sections"][0]["coverage_rate"] == 0.0
        assert report["sections"][0]["sessions_count"] == 2
        assert report["sections"][0]["records_count"] == 0