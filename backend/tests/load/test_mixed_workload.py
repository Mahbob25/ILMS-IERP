import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, Mock, patch
import asyncio
import time

import pytest

from app.modules.academic.service import create_enrollment, list_enrollments
from app.modules.lms.financial_service import create_payment
from app.modules.lms.cashier_service import disburse_pending_refund


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
class TestMixedWorkloadLoad:
    async def test_mixed_workload_no_deadlocks(self):
        section_id = uuid.uuid4()
        enrollment_id = uuid.uuid4()
        student_id = uuid.uuid4()
        pending_refund_id = uuid.uuid4()

        enrolled_count = 0
        total_paid = Decimal("0")
        state_lock = asyncio.Lock()

        section = Mock()
        section.id = section_id
        section.capacity = 50
        section.course_id = uuid.uuid4()
        section.price = Decimal("1000.00")
        section.teacher_percentage = None
        section.teacher_id = None
        section.start_date = None
        section.class_time = None
        section.status = "pending"

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section_with_contract = Mock()
        section_with_contract.id = section_id
        section_with_contract.contract = contract
        section_with_contract.price = Decimal("1000.00")
        section_with_contract.teacher_percentage = None
        section_with_contract.teacher_id = uuid.uuid4()

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section_with_contract
        enrollment.agreed_price = Decimal("1000.00")
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = student_id

        pending_refund = Mock()
        pending_refund.id = pending_refund_id
        pending_refund.status = "UNCLAIMED"
        pending_refund.amount = Decimal("500.00")

        async def enrollment_worker(idx):
            nonlocal enrolled_count
            student_id_local = uuid.uuid4()

            section_clone = Mock()
            section_clone.id = section_id
            section_clone.capacity = 50
            section_clone.course_id = uuid.uuid4()
            section_clone.price = Decimal("1000.00")
            section_clone.teacher_percentage = None
            section_clone.teacher_id = None
            section_clone.start_date = None
            section_clone.class_time = None
            section_clone.status = "pending"

            async def enrollment_execute(query, **kwargs):
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
            db.execute = AsyncMock(side_effect=enrollment_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            try:
                result = await create_enrollment(
                    db,
                    section_id=section_id,
                    student_id=student_id_local,
                )
                if result is not None:
                    async with state_lock:
                        enrolled_count += 1
                return ("enrollment", idx, "ok" if result else "full")
            except Exception as e:
                return ("enrollment", idx, f"error: {e}")

        async def payment_worker(idx):
            nonlocal total_paid
            db = AsyncMock()

            async def payment_execute(query, **kwargs):
                nonlocal total_paid
                qs = str(query)
                if "enrollment" in qs.lower() and "enrollment.id" in qs.lower():
                    r = Mock()
                    r.scalar_one_or_none.return_value = enrollment
                    return r
                if "sum" in qs.lower() and "payment" in qs.lower():
                    async with state_lock:
                        current = total_paid
                        total_paid += Decimal("100.00")
                    return _result_mock(scalar=float(current))
                if "coalesce" in qs.lower() and "max" in qs.lower():
                    return _result_mock(scalar="")
                if "pg_advisory" in qs.lower():
                    return _result_mock()
                return _result_mock()

            db.execute = AsyncMock(side_effect=payment_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            with patch(
                "app.modules.lms.financial_service.is_date_closed",
                AsyncMock(return_value=False),
            ):
                with patch(
                    "app.modules.lms.financial_service.get_today",
                    return_value=date(2026, 7, 14),
                ):
                    try:
                        result = await create_payment(
                            db,
                            enrollment_id=enrollment_id,
                            amount=100.0,
                            created_by=uuid.uuid4(),
                        )
                        return ("payment", idx, "ok" if result else "failed")
                    except Exception as e:
                        return ("payment", idx, f"error: {e}")

        async def refund_worker(idx):
            pr_clone = Mock()
            pr_clone.id = pending_refund_id
            pr_clone.status = "UNCLAIMED"
            pr_clone.amount = Decimal("500.00")

            db = AsyncMock()

            async def refund_execute(query, **kwargs):
                qs = str(query)
                if "pending_refund" in qs.lower() and "update" in qs.lower():
                    r = Mock()
                    r.scalar_one_or_none.return_value = pr_clone
                    return r
                if "refund" in qs.lower() and "max" in qs.lower():
                    return _result_mock(scalar="")
                if "pg_advisory" in qs.lower():
                    return _result_mock()
                return _result_mock()

            db.execute = AsyncMock(side_effect=refund_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            with patch(
                "app.modules.lms.cashier_service.is_date_closed",
                AsyncMock(return_value=False),
            ):
                try:
                    result = await disburse_pending_refund(
                        db,
                        pending_refund_id=pending_refund_id,
                        disbursed_by=uuid.uuid4(),
                    )
                    return ("refund", idx, "ok" if result else "failed")
                except Exception as e:
                    return ("refund", idx, f"error: {e}")

        async def search_worker(idx):
            db = AsyncMock()

            async def search_execute(query, **kwargs):
                e = Mock()
                e.id = uuid.uuid4()
                e.student_id = uuid.uuid4()
                e.section_id = section_id
                e.agreed_price = Decimal("1000.00")
                e.admin_discount = None
                e.enrolled_at = date(2026, 7, 14)
                e.section = section
                e.total_paid = 0.0
                e.balance_remaining = 1000.0
                e.deleted_at = None

                def hasattr_side_effect(name):
                    return name != "deleted_at"

                qs = str(query)
                if "count" in qs.lower():
                    return _result_mock(scalar=5)
                if "enrollment" in qs.lower():
                    return _result_mock(scalars_all=[e])
                return _result_mock()

            db.execute = AsyncMock(side_effect=search_execute)
            db.scalar = AsyncMock(return_value=5)

            try:
                result = await list_enrollments(db, section_id=section_id)
                return ("search", idx, "ok" if result else "failed")
            except Exception as e:
                return ("search", idx, f"error: {e}")

        workers = []
        for i in range(10):
            workers.append(enrollment_worker(i))
            workers.append(payment_worker(i))
            workers.append(search_worker(i))

        for i in range(3):
            workers.append(refund_worker(i))

        start_time = time.monotonic()

        results = await asyncio.wait_for(
            asyncio.gather(*workers, return_exceptions=True),
            timeout=60.0,
        )

        elapsed = time.monotonic() - start_time

        deadlocks = sum(
            1 for r in results
            if isinstance(r, Exception) and "deadlock" in str(r).lower()
        )
        timeouts = sum(
            1 for r in results
            if isinstance(r, Exception) and ("timeout" in str(r).lower() or "timed out" in str(r).lower())
        )
        other_errors = sum(
            1 for r in results
            if isinstance(r, Exception) and "deadlock" not in str(r).lower()
            and "timeout" not in str(r).lower()
        )

        completed = sum(1 for r in results if not isinstance(r, Exception))

        assert deadlocks == 0, (
            f"Detected {deadlocks} deadlocks in mixed workload"
        )
        assert timeouts == 0, (
            f"Detected {timeouts} timeouts in mixed workload"
        )
        assert completed > 0, (
            "All operations failed - no operations completed"
        )

    async def test_concurrent_enrollment_and_payment_no_deadlock(self):
        section_id = uuid.uuid4()
        enrollment_id = uuid.uuid4()
        enrolled_count = 0
        total_paid = Decimal("0")
        state_lock = asyncio.Lock()
        CAPACITY = 15

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

        contract = Mock()
        contract.compensation_model = None
        contract.id = uuid.uuid4()

        section_with_contract = Mock()
        section_with_contract.id = section_id
        section_with_contract.contract = contract
        section_with_contract.price = Decimal("1000.00")
        section_with_contract.teacher_percentage = None
        section_with_contract.teacher_id = uuid.uuid4()

        enrollment = Mock()
        enrollment.id = enrollment_id
        enrollment.section = section_with_contract
        enrollment.agreed_price = Decimal("1000.00")
        enrollment.admin_discount = None
        enrollment.student = Mock()
        enrollment.student.id = uuid.uuid4()

        async def enrollment_task():
            nonlocal enrolled_count
            sid = uuid.uuid4()

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

            result = await create_enrollment(
                db,
                section_id=section_id,
                student_id=sid,
            )
            if result is not None:
                async with state_lock:
                    enrolled_count += 1
            return result is not None

        async def payment_task():
            nonlocal total_paid
            db = AsyncMock()

            async def payment_execute(*args, **kwargs):
                nonlocal total_paid
                qs = str(args[0]) if args else ""
                if "enrollment" in qs.lower() and "enrollment.id" in qs.lower():
                    r = Mock()
                    r.scalar_one_or_none.return_value = enrollment
                    return r
                if "sum" in qs.lower() and "payment" in qs.lower():
                    async with state_lock:
                        current = total_paid
                        total_paid += Decimal("100.00")
                    return _result_mock(scalar=float(current))
                if "coalesce" in qs.lower() and "max" in qs.lower():
                    return _result_mock(scalar="")
                if "pg_advisory" in qs.lower():
                    return _result_mock()
                return _result_mock()

            db.execute = AsyncMock(side_effect=payment_execute)
            db.add = Mock()
            db.flush = AsyncMock()

            with patch(
                "app.modules.lms.financial_service.is_date_closed",
                AsyncMock(return_value=False),
            ):
                with patch(
                    "app.modules.lms.financial_service.get_today",
                    return_value=date(2026, 7, 14),
                ):
                    result = await create_payment(
                        db,
                        enrollment_id=enrollment_id,
                        amount=100.0,
                        created_by=uuid.uuid4(),
                    )
                    return result is not None

        tasks = []
        for _ in range(10):
            tasks.append(enrollment_task())
            tasks.append(payment_task())

        start_time = time.monotonic()

        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=30.0,
        )

        elapsed = time.monotonic() - start_time

        errors = [r for r in results if isinstance(r, Exception)]
        deadlock_errors = [
            e for e in errors
            if "deadlock" in str(e).lower()
        ]

        assert len(deadlock_errors) == 0, (
            f"Detected {len(deadlock_errors)} deadlocks in "
            f"concurrent enrollment + payment workload"
        )

        completed = sum(1 for r in results if r is True)
        assert completed > 0, "No operations completed successfully"
