import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, Mock
import asyncio
import time

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


@pytest.mark.load
@pytest.mark.asyncio
class TestEnrollmentLoad:
    async def test_50_concurrent_enrollments_capacity_20(self):
        CAPACITY = 20
        CONCURRENT = 50
        section_id = uuid.uuid4()
        enrolled_count = 0
        enrolled_count_lock = asyncio.Lock()

        section = Mock()
        section.id = section_id
        section.capacity = CAPACITY
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        async def try_enroll(student_id):
            nonlocal enrolled_count

            section_clone = Mock()
            section_clone.id = section_id
            section_clone.capacity = CAPACITY
            section_clone.course_id = uuid.uuid4()
            section_clone.price = Decimal("1000.00")
            section_clone.teacher_percentage = None
            section_clone.teacher_id = None
            section_clone.start_date = None
            section_clone.class_time = None
            section_clone.status = "pending"

            async def inner_execute(query, **kwargs):
                nonlocal enrolled_count
                qs = str(query)
                if "course_section" in qs.lower() or "from course_sections" in qs.lower():
                    s = Mock()
                    section_clone.enrolled_count = enrolled_count
                    s.scalar_one_or_none.return_value = section_clone
                    return s
                if "student" in qs.lower() and "student_code" in qs.lower():
                    return _result_mock(scalar_one_or_none=None)
                return _result_mock()

            db = AsyncMock()
            db.execute = AsyncMock(side_effect=inner_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            async with enrolled_count_lock:
                if enrolled_count >= CAPACITY:
                    db.flush.side_effect = Exception("Capacity exceeded")

            result = await create_enrollment(
                db,
                section_id=section_id,
                student_id=student_id,
            )

            if result is not None:
                async with enrolled_count_lock:
                    enrolled_count += 1
                return True
            return False

        student_ids = [uuid.uuid4() for _ in range(CONCURRENT)]
        start_time = time.monotonic()

        tasks = [try_enroll(sid) for sid in student_ids]
        results = await asyncio.wait_for(
            asyncio.gather(*tasks),
            timeout=30.0,
        )

        elapsed = time.monotonic() - start_time
        success_count = sum(1 for r in results if r)

        assert success_count == CAPACITY, (
            f"Expected {CAPACITY} successful enrollments, got {success_count} "
            f"(capacity should never be exceeded)"
        )
        assert enrolled_count == CAPACITY, (
            f"enrolled_count {enrolled_count} should equal capacity {CAPACITY}"
        )

    async def test_enrolled_count_never_exceeds_capacity(self):
        CAPACITY = 10
        CONCURRENT = 30
        section_id = uuid.uuid4()
        enrolled_count = 0
        enrolled_count_lock = asyncio.Lock()

        section = Mock()
        section.id = section_id
        section.capacity = CAPACITY
        section.course_id = uuid.uuid4()
        section.price = Decimal("500.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        max_observed = 0

        async def try_enroll(student_id):
            nonlocal enrolled_count, max_observed

            section_clone = Mock()
            section_clone.id = section_id
            section_clone.capacity = CAPACITY
            section_clone.course_id = uuid.uuid4()
            section_clone.price = Decimal("500.00")
            section_clone.teacher_percentage = None
            section_clone.teacher_id = None
            section_clone.start_date = None
            section_clone.class_time = None
            section_clone.status = "pending"

            async def inner_execute(query, **kwargs):
                nonlocal enrolled_count
                qs = str(query)
                if "course_section" in qs.lower() or "from course_sections" in qs.lower():
                    s = Mock()
                    section_clone.enrolled_count = enrolled_count
                    s.scalar_one_or_none.return_value = section_clone
                    return s
                if "student" in qs.lower() and "student_code" in qs.lower():
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

            if result is not None:
                async with enrolled_count_lock:
                    enrolled_count += 1
                    max_observed = max(max_observed, enrolled_count)
                return True
            return False

        student_ids = [uuid.uuid4() for _ in range(CONCURRENT)]
        tasks = [try_enroll(sid) for sid in student_ids]
        results = await asyncio.gather(*tasks)

        success_count = sum(1 for r in results if r)

        assert success_count <= CAPACITY, (
            f"enrolled_count {success_count} exceeded capacity {CAPACITY}"
        )
        assert enrolled_count <= CAPACITY, (
            f"Final enrolled_count {enrolled_count} exceeds capacity {CAPACITY}"
        )
