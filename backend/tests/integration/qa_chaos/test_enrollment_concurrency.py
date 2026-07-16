import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, Mock
import asyncio
import pytest

from app.modules.academic.service import create_enrollment


def _result_mock(scalar_one_or_none=None, scalars_all=None, scalar=0):
    m = Mock()
    m.scalar_one_or_none.return_value = scalar_one_or_none
    s = Mock()
    s.all.return_value = scalars_all if scalars_all is not None else []
    m.scalars.return_value = s
    m.scalar.return_value = scalar
    m.unique.return_value = m
    m.one.return_value = (Decimal("0"), Decimal("0"))
    return m


class TestEnrollmentConcurrency:

    async def test_concurrent_enrollments_capacity_limit(self, mock_db, mock_student):
        CAPACITY = 5
        student_ids = [uuid.uuid4() for _ in range(10)]
        section_id = uuid.uuid4()

        enrolled_count = 0
        enrolled_lock = asyncio.Lock()

        section = Mock()
        section.id = section_id
        section.capacity = CAPACITY
        section.enrolled_count = 0
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        async def try_enroll(student_id):
            nonlocal enrolled_count

            async def inner_execute(query, **kwargs):
                nonlocal enrolled_count
                qs = str(query).lower()
                if "course_section" in qs:
                    async with enrolled_lock:
                        if enrolled_count >= CAPACITY:
                            section.enrolled_count = CAPACITY
                        else:
                            section.enrolled_count = enrolled_count
                            enrolled_count += 1
                    s = Mock()
                    s.scalar_one_or_none.return_value = section
                    return s
                if "student" in qs and "student_code" in qs:
                    return _result_mock(scalar_one_or_none=None)
                return _result_mock()

            db = AsyncMock()
            db.execute = AsyncMock(side_effect=inner_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            result = await create_enrollment(
                db,
                section_id=section_id,
                student_id=student_id,
            )
            return result is not None

        tasks = [try_enroll(sid) for sid in student_ids]
        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r)
        assert success_count == CAPACITY, (
            f"Expected {CAPACITY} successful enrollments, got {success_count}"
        )

    async def test_with_for_update_lock_on_section(self, mock_db, mock_student):
        section_id = uuid.uuid4()
        section = Mock()
        section.id = section_id
        section.capacity = 1
        section.enrolled_count = 0
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        executed_with_for_update = False

        async def execute_side_effect(query, **kwargs):
            nonlocal executed_with_for_update
            qs = str(query)
            if "FOR UPDATE" in qs or "with_for_update" in str(query):
                executed_with_for_update = True
            if "course_section" in qs.lower():
                s = Mock()
                s.scalar_one_or_none.return_value = section
                return s
            if "student" in qs.lower() and "student_code" in qs.lower():
                return _result_mock(scalar_one_or_none=None)
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        result = await create_enrollment(
            mock_db,
            section_id=section_id,
            student_id=mock_student.id,
        )

        assert result is not None
        assert executed_with_for_update, (
            "create_enrollment should use SELECT ... FOR UPDATE on the section row"
        )

    async def test_full_section_returns_none(self, mock_db):
        section_id = uuid.uuid4()
        section = Mock()
        section.id = section_id
        section.capacity = 30
        section.enrolled_count = 30
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        async def execute_side_effect(query, **kwargs):
            qs = str(query)
            if "course_section" in qs.lower():
                s = Mock()
                s.scalar_one_or_none.return_value = section
                return s
            return _result_mock()

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)
        mock_db.add = Mock()
        mock_db.flush = AsyncMock()

        result = await create_enrollment(
            mock_db,
            section_id=section_id,
            student_id=uuid.uuid4(),
        )

        assert result is None, "Should return None when section is full"
