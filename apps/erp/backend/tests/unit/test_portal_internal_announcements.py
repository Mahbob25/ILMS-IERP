"""Portal announcements feed.

Institute-wide, not student-scoped: every portal account sees the same notices,
so there is no actor → student check on this path. The query is delegated to the
content module rather than re-written here, so the portal and the marketing site
can never disagree about what is published.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.modules.portal_internal import service

WHEN = datetime(2026, 9, 11, 9, 30, tzinfo=timezone.utc)


class _Announcement:
    """Stands in for the Announcement ORM row (only the read fields matter)."""

    def __init__(self, **kwargs):
        self.id = kwargs["id"]
        self.text_ar = kwargs["text_ar"]
        self.text_en = kwargs["text_en"]
        self.sort_order = kwargs.get("sort_order", 0)
        self.created_at = kwargs.get("created_at", WHEN)


def test_announcements_map_to_dto_fields():
    row = _Announcement(
        id=uuid.uuid4(),
        text_ar="تسجيل الفصل القادم يبدأ الأحد",
        text_en="Next term registration opens Sunday",
        sort_order=2,
    )

    with patch.object(service, "list_announcements", new_callable=AsyncMock) as m:
        m.return_value = [row]
        rows = asyncio.run(service.get_announcements(AsyncMock()))

    assert rows == [
        {
            "id": row.id,
            "text_ar": "تسجيل الفصل القادم يبدأ الأحد",
            "text_en": "Next term registration opens Sunday",
            "sort_order": 2,
            "created_at": WHEN,
        }
    ]
    # Active only — the dashboard must never render an unpublished notice.
    assert m.await_args.kwargs["active_only"] is True


def test_no_announcements_returns_empty_list():
    with patch.object(service, "list_announcements", new_callable=AsyncMock) as m:
        m.return_value = []

        assert asyncio.run(service.get_announcements(AsyncMock())) == []


def test_missing_created_at_is_preserved_as_none():
    """AnnouncementDTO.created_at is optional — a row without one must not crash."""
    row = _Announcement(id=uuid.uuid4(), text_ar="أ", text_en="a", created_at=None)

    with patch.object(service, "list_announcements", new_callable=AsyncMock) as m:
        m.return_value = [row]
        rows = asyncio.run(service.get_announcements(AsyncMock()))

    assert rows[0]["created_at"] is None
