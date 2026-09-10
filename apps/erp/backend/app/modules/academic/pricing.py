"""Shared pricing derivation for sections and enrollments.

A section's list price changes over time. Each change is recorded in
``section_price_history``. An enrollment's base price is derived from the
section price that was in effect at ``enrolled_at``, unless an explicit
per-enrollment override was recorded. The admin discount percentage is applied
on top of the base to produce the net price.
"""
import bisect
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.modules.academic.models import CourseSection, Enrollment, SectionPriceRecord


def to_decimal(value) -> Optional[Decimal]:
    if value is None:
        return None
    return value if isinstance(value, Decimal) else Decimal(str(value))


def apply_discount(base: Optional[Decimal], discount_pct: Optional[Decimal]):
    """Return (discount_amount, net_price) for a base price and percentage discount."""
    if base is None:
        return None, None
    if discount_pct is None:
        return None, base
    discount_amount = base * discount_pct / Decimal("100")
    return discount_amount, base - discount_amount


class SectionPriceTimeline:
    """A section's price history, pre-sorted for binary-search lookups."""

    __slots__ = ("times", "prices")

    def __init__(self, rows: Iterable[tuple[datetime, Decimal]]):
        ordered = list(rows)
        self.times = [r[0] for r in ordered]
        self.prices = [r[1] for r in ordered]

    def at(self, when: datetime) -> Optional[Decimal]:
        """Price in effect at ``when`` (latest record <= when).

        Falls back to the earliest recorded price when every record is newer
        than ``when`` (e.g. an enrollment created just before its section's
        first record).
        """
        if not self.prices:
            return None
        idx = bisect.bisect_right(self.times, when)
        if idx > 0:
            return self.prices[idx - 1]
        return self.prices[0]

    @property
    def latest(self) -> Optional[Decimal]:
        return self.prices[-1] if self.prices else None


async def get_price_timelines(
    db: AsyncSession, section_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, SectionPriceTimeline]:
    """Load price history for many sections in a single query."""
    ids = list({sid for sid in section_ids if sid is not None})
    if not ids:
        return {}
    rows = await db.execute(
        select(
            SectionPriceRecord.section_id,
            SectionPriceRecord.effective_at,
            SectionPriceRecord.price,
        )
        .where(SectionPriceRecord.section_id.in_(ids))
        .order_by(SectionPriceRecord.section_id, SectionPriceRecord.effective_at)
    )
    grouped: dict[uuid.UUID, list[tuple[datetime, Decimal]]] = {}
    for section_id, effective_at, price in rows.all():
        grouped.setdefault(section_id, []).append((effective_at, to_decimal(price)))
    return {sid: SectionPriceTimeline(entries) for sid, entries in grouped.items()}


async def get_section_price_at(
    db: AsyncSession, section_id: uuid.UUID, at: datetime
) -> Optional[Decimal]:
    timelines = await get_price_timelines(db, [section_id])
    timeline = timelines.get(section_id)
    return timeline.at(at) if timeline else None


async def get_current_section_price(
    db: AsyncSession, section: Optional[CourseSection]
) -> Optional[Decimal]:
    """The section's current list price, falling back to its latest history record."""
    if section is None:
        return None
    if section.price is not None:
        return to_decimal(section.price)
    timelines = await get_price_timelines(db, [section.id])
    timeline = timelines.get(section.id)
    return timeline.latest if timeline else None


def _components(
    enrollment: Enrollment,
    base: Optional[Decimal],
    discount_pct: Optional[Decimal],
) -> dict:
    discount_amount, net_price = apply_discount(base, discount_pct)
    return {
        "base_price": base,
        "price_override": to_decimal(enrollment.price_override),
        "admin_discount": discount_pct,
        "discount_amount": discount_amount,
        "net_price": net_price,
    }


def _current_price(
    section: Optional[CourseSection], timeline: Optional[SectionPriceTimeline]
) -> Optional[Decimal]:
    if section is not None and section.price is not None:
        return to_decimal(section.price)
    if timeline is not None:
        return timeline.latest
    return None


def _needs_history(enrollment: Enrollment) -> bool:
    """True when the base price must be resolved from dated price history."""
    return (
        enrollment.price_override is None
        and enrollment.agreed_price is None
        and enrollment.enrolled_at is not None
    )


def _base_price(
    enrollment: Enrollment,
    section: Optional[CourseSection],
    timeline: Optional[SectionPriceTimeline],
) -> Optional[Decimal]:
    if enrollment.price_override is not None:
        base = to_decimal(enrollment.price_override)
        # A newly-recorded explicit override may only lower the current price.
        current = _current_price(section, timeline)
        if current is not None:
            base = min(base, current)
        return base

    # Legacy agreed_price acts as a materialized override, uncapped.
    if enrollment.agreed_price is not None:
        return to_decimal(enrollment.agreed_price)

    if enrollment.enrolled_at is not None and timeline is not None:
        base = timeline.at(enrollment.enrolled_at)
        if base is not None:
            return base

    return _current_price(section, timeline)


async def get_enrollment_price_components(
    db: AsyncSession,
    enrollment: Enrollment,
    section: Optional[CourseSection] = None,
    timeline: Optional[SectionPriceTimeline] = None,
) -> dict:
    """Single source of truth for an enrollment's price basis.

    ``base_price`` is an explicit override when one was recorded, otherwise the
    section price in effect at ``enrolled_at``, otherwise the section's current
    price. ``net_price`` applies the admin discount percentage on top.

    History is only queried when the base must be derived from ``enrolled_at``.
    Pass a preloaded ``timeline`` to avoid the query entirely.
    """
    if section is None:
        section = enrollment.__dict__.get("section")

    if timeline is None and _needs_history(enrollment):
        timelines = await get_price_timelines(db, [enrollment.section_id])
        timeline = timelines.get(enrollment.section_id)

    base = _base_price(enrollment, section, timeline)
    return _components(enrollment, base, to_decimal(enrollment.admin_discount))


async def get_enrollment_price_components_batch(
    db: AsyncSession,
    enrollments: Iterable[Enrollment],
    sections_by_id: Optional[dict[uuid.UUID, CourseSection]] = None,
) -> dict[uuid.UUID, dict]:
    """Derive price components for many enrollments with at most one history query."""
    items = list(enrollments)
    if not items:
        return {}

    timelines: dict[uuid.UUID, SectionPriceTimeline] = {}
    if any(_needs_history(e) for e in items):
        timelines = await get_price_timelines(db, (e.section_id for e in items))

    results: dict[uuid.UUID, dict] = {}
    for enrollment in items:
        section = None
        if sections_by_id is not None:
            section = sections_by_id.get(enrollment.section_id)
        if section is None:
            section = enrollment.__dict__.get("section")
        base = _base_price(enrollment, section, timelines.get(enrollment.section_id))
        results[enrollment.id] = _components(
            enrollment, base, to_decimal(enrollment.admin_discount)
        )
    return results


