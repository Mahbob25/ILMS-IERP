import json
import logging
import uuid
from typing import Optional

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core import storage
from app.core.queue import get_queue
from app.modules.lessonforge.models import LessonForgeResource

logger = logging.getLogger(__name__)

AI_TEACHER_QUEUE = "ai:teacher"
RESULT_TTL_SECONDS = 3600  # worker sets ai:result:{job_id} with a 1h TTL (portal ai_proxy convention)


async def create_job(db: AsyncSession, *, teacher_id: uuid.UUID, payload: dict) -> LessonForgeResource:
    """Insert a queued resource row and enqueue the generation job."""
    row = LessonForgeResource(
        teacher_id=teacher_id,
        job_id="",
        output_mode=payload.get("output_mode", "auto"),
        status="queued",
        format="html",
        config=payload,
    )
    db.add(row)
    await db.flush()

    job_id = str(row.id)
    row.job_id = job_id
    queue = get_queue()
    try:
        await queue.enqueue(
            AI_TEACHER_QUEUE,
            {"kind": "lessonforge", "job_id": job_id, "payload": payload},
        )
    except Exception:
        row.status = "failed"
        row.error_message = "Failed to enqueue generation job"
        logger.exception("lessonforge enqueue failed for teacher %s", teacher_id)
    await db.flush()
    return row


async def list_resources(db: AsyncSession, *, teacher_id: uuid.UUID) -> list[LessonForgeResource]:
    result = await db.execute(
        select(LessonForgeResource)
        .where(LessonForgeResource.teacher_id == teacher_id)
        .order_by(LessonForgeResource.created_at.desc())
    )
    return list(result.scalars().all())


async def get_owned_resource(db: AsyncSession, *, teacher_id: uuid.UUID, resource_id: uuid.UUID) -> Optional[LessonForgeResource]:
    row = await db.get(LessonForgeResource, resource_id)
    if not row or row.teacher_id != teacher_id:
        return None
    return row


async def delete_resource(db: AsyncSession, *, teacher_id: uuid.UUID, resource_id: uuid.UUID) -> bool:
    row = await get_owned_resource(db, teacher_id=teacher_id, resource_id=resource_id)
    if not row:
        return False
    if row.file_path:
        try:
            storage.delete_file(row.file_path)
        except Exception:
            logger.warning("lessonforge delete_file failed for %s", row.file_path, exc_info=True)
    await db.delete(row)
    await db.flush()
    return True


async def poll_job(db: AsyncSession, *, teacher_id: uuid.UUID, job_id: str) -> dict:
    """Return the job status, materializing the worker result into the DB + uploads
    on the first poll that sees a completed/failed result. Idempotent afterwards."""
    row = await db.get(LessonForgeResource, job_id)
    if not row or row.teacher_id != teacher_id:
        return {"job_id": job_id, "status": "not_found"}

    if row.status in ("completed", "failed"):
        return _status_from_row(row)

    if not settings.REDIS_URL:
        return _status_from_row(row)

    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    raw = await client.get(f"ai:result:{job_id}")
    if raw is None:
        return _status_from_row(row)  # still queued/processing

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("lessonforge: malformed ai:result for %s", job_id)
        return _status_from_row(row)

    status = result.get("status")
    if status == "completed":
        html = result.get("html") or ""
        title = result.get("title") or ""
        rel_path = storage.save_text(html, subdir="lessonforge", filename=f"{job_id}.html")
        row.status = "completed"
        row.title = title[:300] if title else None
        row.file_path = rel_path
        row.error_message = None
        await db.flush()
        return {"job_id": job_id, "status": "completed", "resource_id": row.id}
    if status == "failed":
        row.status = "failed"
        row.error_message = (result.get("error") or "Generation failed")[:1000]
        await db.flush()
        return {"job_id": job_id, "status": "failed", "error": row.error_message}

    return _status_from_row(row)


def _status_from_row(row: LessonForgeResource) -> dict:
    d: dict = {"job_id": row.job_id, "status": row.status}
    if row.status == "completed":
        d["resource_id"] = row.id
    if row.status == "failed":
        d["error"] = row.error_message
    return d
