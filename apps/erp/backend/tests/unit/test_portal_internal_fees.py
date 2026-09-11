"""Fee balance derivation for the portal fees endpoint.

get_fees_summary must mirror the ERP student report: net_price comes from the
canonical academic.pricing helper (never re-derived in SQL), payments are summed
per enrollment, and balance is net - paid. Enrollments with no derivable price
report balance None rather than a misleading zero.
"""

import asyncio
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.modules.portal_internal import service


class _OrmRows:
    """Mimics the .unique().scalars().all() chain of select(Enrollment)."""

    def __init__(self, items):
        self._items = items

    def unique(self):
        return self

    def scalars(self):
        return self

    def all(self):
        return self._items


class _Rows:
    """Mimics .all() for the grouped payments query."""

    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


def _section(name: str = "Math", deleted_at=None, course_deleted_at=None):
    course = SimpleNamespace(name=name, deleted_at=course_deleted_at)
    return SimpleNamespace(id=uuid.uuid4(), deleted_at=deleted_at, course=course)


def _enrollment(section):
    return SimpleNamespace(id=uuid.uuid4(), section_id=section.id, section=section)


def _db(enrollments, paid_rows) -> AsyncMock:
    """AsyncSession stub: enrollment query first, payments query second."""
    db = AsyncMock()
    db.sqls: list[str] = []
    queue = [_OrmRows(enrollments), _Rows(paid_rows)]

    async def execute(statement, params=None):
        db.sqls.append(str(statement))
        return queue.pop(0)

    db.execute = AsyncMock(side_effect=execute)
    return db


def _components(mapping):
    return patch.object(
        service, "get_enrollment_price_components_batch", AsyncMock(return_value=mapping)
    )


def test_balance_is_net_minus_paid():
    section = _section()
    enrollment = _enrollment(section)
    db = _db([enrollment], [(enrollment.id, Decimal("300"))])

    with _components({enrollment.id: {"net_price": Decimal("1000")}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["total_net_price"] == 1000.0
    assert summary["total_paid"] == 300.0
    assert summary["balance"] == 700.0
    row = summary["sections"][0]
    assert row["course_name"] == "Math"
    assert row["net_price"] == 1000.0
    assert row["total_paid"] == 300.0
    assert row["balance"] == 700.0


def test_fully_paid_enrollment_has_zero_balance():
    section = _section()
    enrollment = _enrollment(section)
    db = _db([enrollment], [(enrollment.id, Decimal("450.50"))])

    with _components({enrollment.id: {"net_price": Decimal("450.50")}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["balance"] == 0.0


def test_deleted_section_is_skipped():
    section = _section(deleted_at=object())
    enrollment = _enrollment(section)
    db = _db([enrollment], [])

    with _components({enrollment.id: {"net_price": Decimal("1000")}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["sections"] == []
    assert summary["balance"] == 0.0
    assert summary["total_paid"] == 0.0


def test_deleted_course_is_skipped():
    section = _section(course_deleted_at=object())
    enrollment = _enrollment(section)
    db = _db([enrollment], [])

    with _components({enrollment.id: {"net_price": Decimal("1000")}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["sections"] == []


def test_unpriced_enrollment_reports_none_balance():
    """No derivable price → balance unknown, and it is excluded from the totals
    (so a partially-priced student never shows a falsely-low balance)."""
    section = _section()
    enrollment = _enrollment(section)
    db = _db([enrollment], [(enrollment.id, Decimal("150"))])

    with _components({enrollment.id: {"net_price": None}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    row = summary["sections"][0]
    assert row["net_price"] is None
    assert row["balance"] is None
    # The row still shows what was actually paid...
    assert row["total_paid"] == 150.0
    # ...but the aggregate stays consistent (nothing priced).
    assert summary["total_paid"] == 0.0
    assert summary["balance"] == 0.0


def test_no_payments_yields_full_balance():
    section = _section()
    enrollment = _enrollment(section)
    db = _db([enrollment], [])

    with _components({enrollment.id: {"net_price": Decimal("600")}}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["total_paid"] == 0.0
    assert summary["balance"] == 600.0


def test_totals_aggregate_across_enrollments():
    s1, s2 = _section("Math"), _section("Physics")
    e1, e2 = _enrollment(s1), _enrollment(s2)
    db = _db([e1, e2], [(e1.id, Decimal("100")), (e2.id, Decimal("50"))])

    with _components(
        {e1.id: {"net_price": Decimal("800")}, e2.id: {"net_price": Decimal("200")}}
    ):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary["total_net_price"] == 1000.0
    assert summary["total_paid"] == 150.0
    assert summary["balance"] == 850.0
    assert len(summary["sections"]) == 2


def test_no_enrollments_returns_empty_summary():
    db = _db([], [])

    with _components({}):
        summary = asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    assert summary == {
        "total_net_price": 0.0,
        "total_paid": 0.0,
        "balance": 0.0,
        "sections": [],
    }


def test_payments_query_is_scoped_and_grouped():
    """Payments are summed per enrollment and — like the ERP report — are not
    filtered by a deletion column."""
    section = _section()
    enrollment = _enrollment(section)
    db = _db([enrollment], [(enrollment.id, Decimal("10"))])

    with _components({enrollment.id: {"net_price": Decimal("100")}}):
        asyncio.run(service.get_fees_summary(db, str(uuid.uuid4())))

    payments_sql = db.sqls[-1]
    assert "payments" in payments_sql
    assert "enrollment_id" in payments_sql
    assert "GROUP BY" in payments_sql.upper()
    assert "deleted_at" not in payments_sql
