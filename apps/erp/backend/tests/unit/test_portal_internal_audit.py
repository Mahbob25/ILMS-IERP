"""`_write_audit` is best-effort: a failing audit write must never break the request.

Regression: the audit row shared the request transaction unguarded. When its
flush failed — a constraint, a JSONB problem, a DB blip — SQLAlchemy left the
session deactivated, so `get_db()`'s teardown `commit()` raised
PendingRollbackError and 500'd the whole request. Handling the exception was
therefore not enough: an audit failure took down every audited portal route.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.modules.portal_internal import router as portal_router


def _savepoint() -> AsyncMock:
    """A `begin_nested()` result that rolls back and re-raises on the way out."""
    savepoint = AsyncMock()
    savepoint.__aenter__ = AsyncMock(return_value=None)
    savepoint.__aexit__ = AsyncMock(return_value=False)
    return savepoint


def test_failed_audit_write_is_contained_by_a_savepoint():
    savepoint = _savepoint()
    db = MagicMock()
    db.begin_nested = MagicMock(return_value=savepoint)

    with patch.object(
        portal_router, "create_audit_log", side_effect=RuntimeError("audit boom")
    ) as m_create:
        # Best-effort: the failure is logged, never raised.
        asyncio.run(portal_router._write_audit(db, "ACT", "actor", "/me", True))

    m_create.assert_awaited_once()
    # The savepoint is what keeps the failure off the request's session.
    db.begin_nested.assert_called_once()
    savepoint.__aexit__.assert_awaited_once()
    # A full rollback is NOT an acceptable substitute: /profile calls this after
    # writing, and would lose the caller's update with it.
    db.rollback.assert_not_called()


def test_successful_audit_write_commits_with_the_request():
    """The happy path still runs inside the savepoint, so the row joins the
    request transaction rather than being committed on its own."""
    savepoint = _savepoint()
    db = MagicMock()
    db.begin_nested = MagicMock(return_value=savepoint)

    with patch.object(
        portal_router, "create_audit_log", new_callable=AsyncMock
    ) as m_create:
        asyncio.run(portal_router._write_audit(db, "ACT", "actor", "/me", True))

    m_create.assert_awaited_once()
    db.begin_nested.assert_called_once()
    # Payload shape: the actor is not an ERP user, so it rides in the JSONB.
    assert m_create.await_args.kwargs["user_id"] is None
    assert m_create.await_args.kwargs["payload"] == {
        "path": "/me",
        "ok": True,
        "actor_id": "actor",
    }
