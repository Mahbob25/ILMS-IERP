import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.modules.academic.pricing import (
    SectionPriceTimeline,
    get_current_section_price,
    get_enrollment_price_components,
    get_enrollment_price_components_batch,
    get_price_timelines,
    get_section_price_at,
)


def _result(rows):
    m = MagicMock()
    m.all.return_value = list(rows)
    return m


def _section(price):
    section = MagicMock()
    section.id = uuid.uuid4()
    section.price = price
    return section


def _enrollment(section, enrolled_at=None, price_override=None, agreed_price=None, admin_discount=None):
    enrollment = MagicMock()
    enrollment.id = uuid.uuid4()
    enrollment.section_id = section.id
    enrollment.section = section
    enrollment.enrolled_at = enrolled_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
    enrollment.price_override = price_override
    enrollment.agreed_price = agreed_price
    enrollment.admin_discount = admin_discount
    return enrollment


class TestSectionPriceTimeline:
    def test_resolves_latest_record_not_after(self):
        timeline = SectionPriceTimeline([
            (datetime(2026, 1, 1, tzinfo=timezone.utc), Decimal("800")),
            (datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("1000")),
        ])
        assert timeline.at(datetime(2026, 7, 1, tzinfo=timezone.utc)) == Decimal("1000")
        assert timeline.at(datetime(2026, 3, 1, tzinfo=timezone.utc)) == Decimal("800")

    def test_falls_back_to_earliest_when_all_newer(self):
        timeline = SectionPriceTimeline([
            (datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("1000")),
        ])
        assert timeline.at(datetime(2026, 1, 1, tzinfo=timezone.utc)) == Decimal("1000")

    def test_empty_timeline_returns_none(self):
        assert SectionPriceTimeline([]).at(datetime(2026, 1, 1, tzinfo=timezone.utc)) is None
        assert SectionPriceTimeline([]).latest is None


@pytest.mark.asyncio
async def test_get_price_timelines_groups_rows_in_one_query():
    section_a, section_b = uuid.uuid4(), uuid.uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section_a, datetime(2026, 1, 1, tzinfo=timezone.utc), Decimal("800")),
        (section_a, datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("1000")),
        (section_b, datetime(2026, 2, 1, tzinfo=timezone.utc), Decimal("500")),
    ]))

    timelines = await get_price_timelines(db, [section_a, section_b])

    assert db.execute.await_count == 1
    assert timelines[section_a].latest == Decimal("1000")
    assert timelines[section_b].latest == Decimal("500")


@pytest.mark.asyncio
async def test_get_price_timelines_skips_query_when_no_ids():
    db = AsyncMock()
    db.execute = AsyncMock()
    assert await get_price_timelines(db, []) == {}
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_section_price_at_returns_latest_not_after():
    section_id = uuid.uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section_id, datetime(2026, 1, 1, tzinfo=timezone.utc), Decimal("800")),
        (section_id, datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("1000")),
    ]))
    result = await get_section_price_at(db, section_id, datetime(2026, 5, 1, tzinfo=timezone.utc))
    assert result == Decimal("800")


@pytest.mark.asyncio
async def test_get_section_price_at_falls_back_to_earliest():
    section_id = uuid.uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section_id, datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("700")),
    ]))
    result = await get_section_price_at(db, section_id, datetime(2026, 5, 1, tzinfo=timezone.utc))
    assert result == Decimal("700")


@pytest.mark.asyncio
async def test_get_current_section_price_uses_column_without_query():
    db = AsyncMock()
    db.execute = AsyncMock()
    result = await get_current_section_price(db, _section(Decimal("900")))
    assert result == Decimal("900")
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_current_section_price_falls_back_to_history():
    section = _section(None)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section.id, datetime(2026, 1, 1, tzinfo=timezone.utc), Decimal("650")),
    ]))
    result = await get_current_section_price(db, section)
    assert result == Decimal("650")


@pytest.mark.asyncio
async def test_price_override_lowers_but_never_raises():
    section = _section(Decimal("1000"))
    enrollment = _enrollment(section, price_override=Decimal("1500"))
    db = AsyncMock()
    db.execute = AsyncMock()
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["base_price"] == Decimal("1000")
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_price_override_below_price_is_honored():
    section = _section(Decimal("1000"))
    enrollment = _enrollment(section, price_override=Decimal("800"))
    db = AsyncMock()
    db.execute = AsyncMock()
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["base_price"] == Decimal("800")


@pytest.mark.asyncio
async def test_legacy_agreed_price_is_honored_uncapped_and_queried_only_when_needed():
    section = _section(Decimal("500"))
    enrollment = _enrollment(section, agreed_price=Decimal("900"))
    db = AsyncMock()
    db.execute = AsyncMock()
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["base_price"] == Decimal("900")
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_base_price_derived_from_history_at_enrollment():
    section = _section(Decimal("1200"))
    enrollment = _enrollment(section)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section.id, datetime(2025, 1, 1, tzinfo=timezone.utc), Decimal("1000")),
    ]))
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["base_price"] == Decimal("1000")


@pytest.mark.asyncio
async def test_base_price_falls_back_to_current_when_no_history():
    section = _section(Decimal("1200"))
    enrollment = _enrollment(section)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([]))
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["base_price"] == Decimal("1200")


@pytest.mark.asyncio
async def test_discount_is_applied_to_base():
    section = _section(Decimal("1000"))
    enrollment = _enrollment(section, price_override=Decimal("1000"), admin_discount=Decimal("25"))
    db = AsyncMock()
    db.execute = AsyncMock()
    components = await get_enrollment_price_components(db, enrollment, section=section)
    assert components["discount_amount"] == Decimal("250")
    assert components["net_price"] == Decimal("750")


@pytest.mark.asyncio
async def test_batch_skips_history_query_when_all_have_overrides():
    section = _section(Decimal("1000"))
    a = _enrollment(section, agreed_price=Decimal("900"))
    b = _enrollment(section, price_override=Decimal("800"))
    db = AsyncMock()
    db.execute = AsyncMock()

    components = await get_enrollment_price_components_batch(
        db, [a, b], sections_by_id={section.id: section}
    )

    db.execute.assert_not_awaited()
    assert components[a.id]["base_price"] == Decimal("900")
    assert components[b.id]["base_price"] == Decimal("800")


@pytest.mark.asyncio
async def test_batch_derives_all_enrollments_with_one_query():
    section = _section(Decimal("1200"))
    early = _enrollment(section, enrolled_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    late = _enrollment(section, enrolled_at=datetime(2026, 8, 1, tzinfo=timezone.utc))
    late.price_override = None
    late.agreed_price = None
    late.admin_discount = Decimal("10")

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([
        (section.id, datetime(2025, 6, 1, tzinfo=timezone.utc), Decimal("1000")),
        (section.id, datetime(2026, 6, 1, tzinfo=timezone.utc), Decimal("1200")),
    ]))

    components = await get_enrollment_price_components_batch(
        db, [early, late], sections_by_id={section.id: section}
    )

    assert db.execute.await_count == 1
    assert components[early.id]["base_price"] == Decimal("1000")
    assert components[late.id]["base_price"] == Decimal("1200")
    assert components[late.id]["net_price"] == Decimal("1080")


@pytest.mark.asyncio
async def test_batch_caps_override_to_current_price():
    section = _section(Decimal("900"))
    enrollment = _enrollment(section, price_override=Decimal("2000"))
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result([]))

    components = await get_enrollment_price_components_batch(
        db, [enrollment], sections_by_id={section.id: section}
    )

    assert components[enrollment.id]["base_price"] == Decimal("900")


@pytest.mark.asyncio
async def test_batch_empty_returns_empty_without_query():
    db = AsyncMock()
    db.execute = AsyncMock()
    assert await get_enrollment_price_components_batch(db, []) == {}
    db.execute.assert_not_awaited()
