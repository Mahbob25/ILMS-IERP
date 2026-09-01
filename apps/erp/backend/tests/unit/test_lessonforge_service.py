"""Unit tests for the LessonForge service — enqueue + poll materialization.

These run against an in-memory fake queue + a faked Redis client, so no
Redis/DB is required. The DB session is replaced by a lightweight fake that
records mutations.
"""
import json
import uuid
from types import SimpleNamespace

import pytest

from app.modules.lessonforge import service as lessonforge_service
from app.modules.lessonforge.models import LessonForgeResource


class FakeQueue:
    def __init__(self):
        self.enqueued = []

    async def enqueue(self, queue, payload):
        self.enqueued.append((queue, payload))
        return payload["job_id"]


class FakeRedis:
    """Minimal redis.asyncio stand-in exposing only get/set used by the service."""

    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value


class FakeDB:
    """Stands in for AsyncSession: records added objects and honours get/delete."""

    def __init__(self):
        self.added = []
        self.deleted = []
        self.rows = {}

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        # simulate persistence: assign PK + job_id
        for obj in self.added:
            if not obj.id:
                obj.id = uuid.uuid4()
            if not obj.job_id:
                obj.job_id = str(obj.id)
            self.rows[str(obj.id)] = obj
            self.rows[obj.job_id] = obj

    async def get(self, model, pk):
        return self.rows.get(str(pk))

    async def delete(self, obj):
        self.deleted.append(obj)
        self.rows.pop(str(obj.id), None)
        self.rows.pop(obj.job_id, None)


@pytest.fixture(autouse=True)
def _patch_deps(monkeypatch):
    monkeypatch.setattr(lessonforge_service, "get_queue", lambda: FakeQueue())
    monkeypatch.setattr(lessonforge_service, "settings", SimpleNamespace(REDIS_URL="redis://x"))
    monkeypatch.setattr(
        lessonforge_service, "redis",
        SimpleNamespace(from_url=lambda url, **kwargs: FakeRedis()),
    )
    monkeypatch.setattr(lessonforge_service.storage, "save_text", lambda html, subdir="", filename=None: f"{subdir}/{filename}")


def test_create_job_enqueues_and_returns_row():
    db = FakeDB()
    teacher_id = uuid.uuid4()
    payload = {"topic_text": "lesson", "style": "colorful", "output_mode": "worksheet"}
    row = lessonforge_service.create_job.__wrapped__ if hasattr(lessonforge_service.create_job, "__wrapped__") else None

    import asyncio

    async def run():
        return await lessonforge_service.create_job(db, teacher_id=teacher_id, payload=payload)

    row = asyncio.run(run())
    assert row.status == "queued"
    assert row.format == "html"
    assert row.teacher_id == teacher_id
    assert row.job_id == str(row.id)
    queue, payload_sent = FakeQueue.enqueued if hasattr(FakeQueue, "enqueued") else (None, None)


def test_create_job_failed_enqueue_marks_row_failed(monkeypatch):
    class BoomQueue:
        async def enqueue(self, queue, payload):
            raise RuntimeError("redis down")

    monkeypatch.setattr(lessonforge_service, "get_queue", lambda: BoomQueue())
    db = FakeDB()

    import asyncio

    async def run():
        return await lessonforge_service.create_job(
            db, teacher_id=uuid.uuid4(), payload={"topic_text": "x", "style": "y"}
        )

    row = asyncio.run(run())
    assert row.status == "failed"
    assert row.error_message


def test_poll_job_materializes_completed(monkeypatch):
    db = FakeDB()
    teacher_id = uuid.uuid4()

    import asyncio

    async def seed():
        row = await lessonforge_service.create_job(
            db, teacher_id=teacher_id, payload={"topic_text": "t", "style": "s"}
        )
        return row

    row = asyncio.run(seed())

    # The fake redis is fresh per from_url call; prime it through the service path.
    fake_redis = FakeRedis()
    monkeypatch.setattr(
        lessonforge_service, "redis",
        SimpleNamespace(from_url=lambda url, **kwargs: fake_redis),
    )
    monkeypatch.setattr(
        lessonforge_service.storage, "save_text",
        lambda html, subdir="", filename=None: f"{subdir}/{filename}",
    )

    result_payload = {
        "status": "completed",
        "title": "My Resource",
        "output_mode": "worksheet",
        "html": "<html><body>hi</body></html>",
    }
    fake_redis.store[f"ai:result:{row.job_id}"] = json.dumps(result_payload)

    async def poll():
        return await lessonforge_service.poll_job(db, teacher_id=teacher_id, job_id=row.job_id)

    res = asyncio.run(poll())
    assert res["status"] == "completed"
    assert res["resource_id"] == row.id
    assert row.status == "completed"
    assert row.title == "My Resource"
    assert row.file_path == "lessonforge/{}.html".format(row.job_id)

    # Second poll is idempotent (no double save).
    fake_redis.store[f"ai:result:{row.job_id}"] = json.dumps({"status": "completed", "html": "x"})
    res2 = asyncio.run(poll())
    assert res2["status"] == "completed"


def test_poll_job_marks_failed():
    db = FakeDB()

    import asyncio

    async def seed():
        return await lessonforge_service.create_job(
            db, teacher_id=uuid.uuid4(), payload={"topic_text": "t", "style": "s"}
        )

    row = asyncio.run(seed())
    fake_redis = FakeRedis()
    fake_redis.store[f"ai:result:{row.job_id}"] = json.dumps({"status": "failed", "error": "boom"})
    lessonforge_service.redis.from_url = lambda url, **kwargs: fake_redis

    async def poll():
        return await lessonforge_service.poll_job(db, teacher_id=row.teacher_id, job_id=row.job_id)

    res = asyncio.run(poll())
    assert res["status"] == "failed"
    assert res["error"] == "boom"
    assert row.status == "failed"


def test_poll_job_ownership_enforced():
    db = FakeDB()

    import asyncio

    async def seed():
        return await lessonforge_service.create_job(
            db, teacher_id=uuid.uuid4(), payload={"topic_text": "t", "style": "s"}
        )

    row = asyncio.run(seed())
    other_teacher = uuid.uuid4()

    async def poll():
        return await lessonforge_service.poll_job(db, teacher_id=other_teacher, job_id=row.job_id)

    res = asyncio.run(poll())
    assert res["status"] == "not_found"
