"""Unit tests for the Notifications Center service (Phase 1).

Covers notification CRUD, deduplication, pagination, cleanup, and the realtime
hints published to the per-user event stream.
All tests use AsyncMock — no real database.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, Mock

import pytest

from app.modules.notifications import service as notif_service

USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
OTHER_USER_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def published(monkeypatch):
    """Capture the realtime hints the service publishes, instead of hitting Redis."""
    events = []

    class SpyBus:
        async def publish(self, channel, event):
            events.append((channel, event))

    monkeypatch.setattr(notif_service, "get_event_bus", lambda: SpyBus())
    return events


@pytest.fixture
def mock_db_inserted(mock_db):
    """A db whose INSERT actually produced a row (RETURNING gave one id back)."""
    result = Mock()
    result.first.return_value = (uuid.uuid4(),)
    mock_db.execute = AsyncMock(return_value=result)
    return mock_db


@pytest.fixture
def mock_db_deduped(mock_db):
    """A db whose INSERT was skipped by ON CONFLICT DO NOTHING (no row back)."""
    result = Mock()
    result.first.return_value = None
    mock_db.execute = AsyncMock(return_value=result)
    return mock_db


class TestCreateNotification:
    async def test_inserts_row_with_all_fields(self, mock_db_inserted):
        await notif_service.create_notification(
            mock_db_inserted,
            user_id=USER_ID,
            type_="refund_requested",
            title_key="notif.refund_requested",
            body_key="notif.refund_requested_body",
            params={"amount": "500 SAR"},
            target_href="dashboard/cashier/refunds",
            priority="high",
            dedupe_key="refund_requested:abc-123",
        )

        mock_db_inserted.execute.assert_called_once()

    async def test_publishes_hint_when_row_inserted(self, mock_db_inserted, published):
        await notif_service.create_notification(
            mock_db_inserted,
            user_id=USER_ID,
            type_="refund_requested",
            title_key="notif.refund",
            priority="high",
        )

        assert len(published) == 1
        channel, event = published[0]
        assert channel == f"events:user:{USER_ID}"
        assert event["type"] == "notification.created"
        assert event["data"]["notification_type"] == "refund_requested"

    async def test_stays_silent_when_insert_is_deduped(self, mock_db_deduped, published):
        """ON CONFLICT DO NOTHING must not wake every client for nothing."""
        await notif_service.create_notification(
            mock_db_deduped,
            user_id=USER_ID,
            type_="unlock_requested",
            title_key="notif.unlock",
            dedupe_key="unlock_requested:2026-07-01",
        )

        assert published == []

    async def test_dedupe_same_key_twice_does_not_raise(self, mock_db_deduped):
        for _ in range(2):
            await notif_service.create_notification(
                mock_db_deduped,
                user_id=USER_ID,
                type_="unlock_requested",
                title_key="notif.unlock",
                dedupe_key="unlock_requested:2026-07-01",
            )

        assert mock_db_deduped.execute.call_count == 2

    async def test_failure_is_suppressed_and_returns_none(self, mock_db):
        mock_db.execute.side_effect = RuntimeError("db down")

        result = await notif_service.create_notification(
            mock_db,
            user_id=USER_ID,
            type_="refund_requested",
            title_key="notif.refund",
        )

        assert result is None

    async def test_publish_failure_never_breaks_the_insert(self, mock_db_inserted, monkeypatch):
        """A dead event bus must not fail the business flow that triggered it."""

        class ExplodingBus:
            async def publish(self, channel, event):
                raise RuntimeError("redis down")

        monkeypatch.setattr(notif_service, "get_event_bus", lambda: ExplodingBus())

        result = await notif_service.create_notification(
            mock_db_inserted,
            user_id=USER_ID,
            type_="refund_requested",
            title_key="notif.refund",
        )

        assert result is None
        mock_db_inserted.execute.assert_called_once()


class TestListNotifications:
    async def test_paginates_results(self, mock_db):
        mock_result = Mock()
        mock_result.scalar.return_value = 25
        mock_scalars = Mock()
        mock_result.scalars.return_value = mock_scalars
        mock_scalars.all.return_value = []

        mock_db.execute = AsyncMock(return_value=mock_result)

        resp = await notif_service.list_notifications(
            mock_db, user_id=USER_ID, page=2, per_page=10
        )

        assert resp["total"] == 25
        assert resp["page"] == 2
        assert resp["per_page"] == 10
        assert resp["pages"] == 3

    async def test_clamps_per_page_to_100(self, mock_db):
        mock_result = Mock()
        mock_result.scalar.return_value = 0
        mock_scalars = Mock()
        mock_result.scalars.return_value = mock_scalars
        mock_scalars.all.return_value = []

        mock_db.execute = AsyncMock(return_value=mock_result)

        resp = await notif_service.list_notifications(
            mock_db, user_id=USER_ID, per_page=200
        )
        assert resp["per_page"] == 100

    async def test_zero_total_returns_one_page(self, mock_db):
        mock_result = Mock()
        mock_result.scalar.return_value = 0
        mock_scalars = Mock()
        mock_result.scalars.return_value = mock_scalars
        mock_scalars.all.return_value = []

        mock_db.execute = AsyncMock(return_value=mock_result)

        resp = await notif_service.list_notifications(mock_db, user_id=USER_ID)

        assert resp["pages"] == 1
        assert resp["total"] == 0
        assert resp["items"] == []


class TestUnreadCount:
    async def test_returns_scalar_count(self, mock_db):
        mock_result = Mock()
        mock_result.scalar.return_value = 7

        mock_db.execute = AsyncMock(return_value=mock_result)

        count = await notif_service.get_unread_count(mock_db, user_id=USER_ID)
        assert count == 7

    async def test_returns_zero_when_no_unread(self, mock_db):
        mock_result = Mock()
        mock_result.scalar.return_value = None

        mock_db.execute = AsyncMock(return_value=mock_result)

        count = await notif_service.get_unread_count(mock_db, user_id=USER_ID)
        assert count == 0


class TestMarkRead:
    async def test_mark_specific_ids_only_own_notifications(self, mock_db, published):
        target_ids = [uuid.uuid4(), uuid.uuid4()]
        mock_result = Mock()
        mock_result.rowcount = 2

        mock_db.execute = AsyncMock(return_value=mock_result)

        updated = await notif_service.mark_read(
            mock_db, user_id=USER_ID, ids=target_ids
        )

        assert updated == 2
        mock_db.execute.assert_called_once()

    async def test_empty_ids_marks_all_unread(self, mock_db):
        mock_result = Mock()
        mock_result.rowcount = 5

        mock_db.execute = AsyncMock(return_value=mock_result)

        updated = await notif_service.mark_read(mock_db, user_id=USER_ID, ids=[])

        assert updated == 5
        mock_db.execute.assert_called_once()

    async def test_none_ids_marks_all(self, mock_db):
        """When ids is None (e.g. omitted from request body), mark all unread."""
        mock_result = Mock()
        mock_result.rowcount = 5

        mock_db.execute = AsyncMock(return_value=mock_result)

        updated = await notif_service.mark_read(mock_db, user_id=USER_ID, ids=None)

        assert updated == 5

    async def test_publishes_update_so_other_tabs_reconcile(self, mock_db, published):
        mock_result = Mock()
        mock_result.rowcount = 3

        mock_db.execute = AsyncMock(return_value=mock_result)

        await notif_service.mark_read(mock_db, user_id=USER_ID, ids=[uuid.uuid4()])

        assert len(published) == 1
        channel, event = published[0]
        assert channel == f"events:user:{USER_ID}"
        assert event["type"] == "notification.updated"
        assert event["data"]["reason"] == "mark_read"

    async def test_no_publish_when_nothing_changed(self, mock_db, published):
        mock_result = Mock()
        mock_result.rowcount = 0

        mock_db.execute = AsyncMock(return_value=mock_result)

        await notif_service.mark_read(mock_db, user_id=USER_ID, ids=[uuid.uuid4()])

        assert published == []


class TestDeleteExpired:
    async def test_batched_delete_terminates_after_all_purged(self, mock_db):
        """2,500+ expired rows should all get purged across 3 batches."""
        # Batch 1: 1,000 ids, deletes 1,000
        # Batch 2: 1,000 ids, deletes 1,000
        # Batch 3: 500 ids, deletes 500 → stops because len < batch_size
        mock_result_1 = Mock()
        mock_result_1.fetchall.return_value = [("id1",)] * 1000
        mock_result_2 = Mock()
        mock_result_2.fetchall.return_value = [("id2",)] * 1000
        mock_result_3 = Mock()
        mock_result_3.fetchall.return_value = [("id3",)] * 500

        del_result_1 = Mock(rowcount=1000)
        del_result_2 = Mock(rowcount=1000)
        del_result_3 = Mock(rowcount=500)

        mock_db.execute = AsyncMock(
            side_effect=[
                mock_result_1, del_result_1,
                mock_result_2, del_result_2,
                mock_result_3, del_result_3,
            ]
        )

        deleted = await notif_service.delete_expired(mock_db, retention_days=90)
        assert deleted == 2500
        assert mock_db.execute.call_count == 6

    async def test_batched_delete_stops_when_none_found(self, mock_db):
        mock_result = Mock()
        mock_result.fetchall.return_value = []

        mock_db.execute = AsyncMock(return_value=mock_result)

        deleted = await notif_service.delete_expired(mock_db, retention_days=90)
        assert deleted == 0
        assert mock_db.execute.call_count == 1
