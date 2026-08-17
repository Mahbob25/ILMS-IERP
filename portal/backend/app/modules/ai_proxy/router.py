import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.config import settings
from app.core.rate_limit import limiter
from app.modules.auth.dependencies import get_current_portal_user
from app.services.queue import get_queue

logger = logging.getLogger(__name__)

ai_router = APIRouter(prefix="/ai", tags=["ai"])


@ai_router.post("/explain")
@limiter.limit("10/minute")
async def ai_explain(
    body: dict,
    request: Request,
    current_user: dict = Depends(get_current_portal_user),
):
    """Enqueue an explanation job to the HIGH-priority ai:student queue.

    Returns 202 {job_id} — the frontend polls /ai/jobs/{job_id} or streams.
    Never writes chunks/concepts; only enqueues. Phase 3 wires the worker.
    """
    section_id = body.get("section_id")
    question = (body.get("question") or "").strip()
    if not section_id or not question:
        raise HTTPException(status_code=400, detail="section_id and question are required")

    queue = get_queue()
    job_id = await queue.enqueue(
        settings.AI_STUDENT_QUEUE,
        {
            "kind": "explain",
            "actor_id": str(current_user["id"]),
            "section_id": section_id,
            "question": question,
        },
    )
    return {"job_id": job_id, "status": "queued"}


@ai_router.get("/jobs/{job_id}")
async def ai_job_status(
    job_id: str,
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_portal_user),
):
    """Poll ai:result:{job_id} (TTL 1h). Phase 3 wires the worker to write it."""
    # Phase 1 skeleton: job results live in Redis once the ai-service worker
    # exists. Until then return a clear "processing" state.
    if not settings.REDIS_URL:
        return {"job_id": job_id, "status": "queued"}
    import redis.asyncio as redis

    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    raw = await client.get(f"ai:result:{job_id}")
    if raw is None:
        return {"job_id": job_id, "status": "processing"}
    import json

    return {"job_id": job_id, "status": "completed", "result": json.loads(raw)}
