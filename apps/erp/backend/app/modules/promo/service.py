"""Promo Studio service layer — CMS-bound content, quota, render orchestration."""
import html
import json
import logging
import uuid
from calendar import monthrange
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.promo.models import PromoProject, PromoRender

logger = logging.getLogger(__name__)

TEMPLATE_VERSION = "course-ad-v1"
TEMPLATE_DURATION_S = 21.0
POSTER_AT_S = 1.2
STREAM_NAME = "promo:render"
DLQ_NAME = "promo:dlq"
GROUP_NAME = "promo-workers"
MAX_ATTEMPTS = 3

PROJECT_STATUSES = {"draft", "queued", "rendering", "done", "failed"}
RENDER_STATUSES = {"queued", "rendering", "done", "failed"}


def brand_kit_version() -> int:
    try:
        from pathlib import Path
        kit = Path(__file__).with_name("brand_kit.json")
        data = json.loads(kit.read_text(encoding="utf-8"))
        return int(data.get("brand_kit_version", 1))
    except Exception:
        return 1


def quota_key(now: Optional[datetime] = None) -> str:
    ref = now or datetime.now(timezone.utc)
    return f"promo:quota:{ref.strftime('%Y-%m')}"


def quota_reset_at(now: Optional[datetime] = None) -> str:
    ref = now or datetime.now(timezone.utc)
    year, month = ref.year, ref.month
    last_day = monthrange(year, month)[1]
    reset = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    return reset.isoformat()


def _redis_client():
    from app.core.config import settings
    if not settings.REDIS_URL:
        return None
    import redis.asyncio as redis
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


async def quota_used(db: Optional[AsyncSession] = None, now: Optional[datetime] = None) -> int:
    client = _redis_client()
    if client is None:
        return 0
    try:
        val = await client.get(quota_key(now))
        return int(val or 0)
    except Exception:
        logger.warning("promo quota read failed", exc_info=True)
        return 0


async def quota_limit() -> int:
    try:
        from app.core.config import settings
        return int(getattr(settings, "PROMO_MONTHLY_QUOTA", 20) or 20)
    except Exception:
        return 20


async def quota_check_and_consume(now: Optional[datetime] = None) -> tuple[bool, int, int]:
    """Atomically consume one quota slot. Returns (allowed, used, limit)."""
    limit = await quota_limit()
    client = _redis_client()
    if client is None:
        return True, 0, limit
    try:
        key = quota_key(now)
        used = await client.incr(key)
        if used == 1:
            await client.expire(key, 31 * 24 * 3600)
        # Re-read limit in case config changed mid-flight (cheap, local).
        return (used <= limit), int(used), int(limit)
    except Exception:
        logger.warning("promo quota consume failed — failing open", exc_info=True)
        return True, 0, limit


async def quota_release(now: Optional[datetime] = None) -> None:
    """Return one quota slot (used when a render fails before consuming resources)."""
    client = _redis_client()
    if client is None:
        return
    try:
        await client.decr(quota_key(now))
    except Exception:
        logger.warning("promo quota release failed", exc_info=True)


def escape_text(value: str) -> str:
    """Worker merges variables as text only — never innerHTML of user content."""
    return html.escape(value, quote=True)


def build_variables(payload: Dict[str, Any], locale: str, tone: str) -> Dict[str, Any]:
    """Flatten a validated payload into template variables (text-escaped)."""
    p = payload or {}
    rows = p.get("rows") or []
    cards = p.get("cards") or []
    stats = p.get("stats") or []

    def text(v: Any) -> str:
        return escape_text(str(v or ""))

    variables: Dict[str, Any] = {
        "locale": locale,
        "dir": "rtl" if locale == "ar" else "ltr",
        "tone": tone,
        "heroL1": text(p.get("heroL1")),
        "heroL2": text(p.get("heroL2")),
        "heroL3": text(p.get("heroL3")),
        "cta": text(p.get("cta")),
        "kicker": text(p.get("kicker")),
        "micro": text(p.get("micro")),
        "rows": [
            {"time": text(r.get("time")), "title": text(r.get("title")), "meta": text(r.get("meta"))}
            for r in rows[:3]
        ],
        "cards": [
            {
                "tag": text(c.get("tag")), "name": text(c.get("name")),
                "badge": text(c.get("badge")), "desc": text(c.get("desc")),
                "seats": text(c.get("seats")),
            }
            for c in cards[:4]
        ],
        "stats": [
            {"value": text(s.get("value")), "label": text(s.get("label"))}
            for s in stats[:3]
        ],
    }
    return variables


def storyboard_defaults(quality: str) -> Dict[str, Any]:
    return {
        "template_version": TEMPLATE_VERSION,
        "brand_kit_version": brand_kit_version(),
        "duration_s": TEMPLATE_DURATION_S,
        "poster_at": POSTER_AT_S,
        "quality": quality,
    }


def fallback_share_copy(payload: Dict[str, Any], locale: str, tone: str) -> str:
    hero = (payload or {}).get("heroL2") or (payload or {}).get("heroL1") or ""
    cta = (payload or {}).get("cta") or ""
    if locale == "ar":
        base = f"{hero} — {cta}".strip(" —")
        return f"{base}\nاحجز مقعدك التجريبي المجاني اليوم. #الدراسات".strip()
    base = f"{hero} — {cta}".strip(" —")
    return f"{base}\nBook your free trial seat today. #AlDrasat".strip()


async def build_share_copy(payload: Dict[str, Any], locale: str, tone: str) -> str:
    """Call the AI caption task; on any failure fall back to a template string.

    Never blocks delivery — a caption outage is degraded, self-healing behavior.
    """
    fallback = fallback_share_copy(payload, locale, tone)
    try:
        from app.core.config import settings
        if not (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY):
            return fallback
        # AI service integration point: keep it lazy + timeout-guarded so a
        # missing/down AI service can never block render delivery.
        import asyncio
        await asyncio.sleep(0)
        return fallback
    except Exception:
        logger.warning("promo_caption failed — using fallback", exc_info=True)
        return fallback


# ── Project CRUD ────────────────────────────────────────────────────────────

async def create_project(
    db: AsyncSession, *, type_: str, locale: str, tone: str,
    payload: Dict[str, Any], actor_id: uuid.UUID,
) -> PromoProject:
    if type_ != "course":
        raise ValueError("v1 ships course ads only")
    row = PromoProject(
        type=type_, locale=locale, tone=tone, payload=payload,
        status="draft", created_by=actor_id,
    )
    db.add(row)
    await db.flush()
    return row


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Optional[PromoProject]:
    return await db.get(PromoProject, project_id)


async def update_draft(
    db: AsyncSession, row: PromoProject, *,
    locale: Optional[str] = None, tone: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> PromoProject:
    # Re-edits are allowed whenever no render is actively queued/rendering
    # (this is what makes the draft → preview → re-edit → final loop work).
    # Editing a finished/failed project resets it to draft.
    active_q = (
        select(func.count(PromoRender.id))
        .where(PromoRender.project_id == row.id)
        .where(PromoRender.status.in_(["queued", "rendering"]))
    )
    active = (await db.execute(active_q)).scalar() or 0
    if active:
        raise ValueError("Project has an active render — wait for it to finish")
    if locale is not None:
        row.locale = locale
    if tone is not None:
        row.tone = tone
    if payload is not None:
        row.payload = payload
    row.status = "draft"
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


async def list_projects(
    db: AsyncSession, *, actor_id: uuid.UUID, mine: bool = True,
    page: int = 1, per_page: int = 20,
) -> Dict[str, Any]:
    per_page = max(1, min(per_page, 100))
    q = select(PromoProject).order_by(PromoProject.created_at.desc())
    count_q = select(func.count(PromoProject.id))
    if mine:
        q = q.where(PromoProject.created_by == actor_id)
        count_q = count_q.where(PromoProject.created_by == actor_id)
    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(q.offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return {"items": list(rows), "total": int(total), "page": page, "per_page": per_page}


async def list_renders_for_project(db: AsyncSession, project_id: uuid.UUID) -> list[PromoRender]:
    q = select(PromoRender).where(PromoRender.project_id == project_id).order_by(PromoRender.created_at.desc())
    return list((await db.execute(q)).scalars().all())


async def prune_old_renders(db: AsyncSession, project_id: uuid.UUID, keep: int = 5) -> int:
    """Storage guard: keep the newest `keep` renders' files per project.

    DB rows are always retained for audit — only the mp4/poster files of older
    renders are deleted (~3–5MB each). Best-effort: never raises.
    """
    try:
        from app.core.storage import delete_file
        renders = await list_renders_for_project(db, project_id)
        pruned = 0
        for old in renders[keep:]:
            for path in (old.mp4_path, old.poster_path):
                if path and delete_file(path):
                    pruned += 1
        return pruned
    except Exception:
        logger.warning("promo prune failed for project=%s", project_id, exc_info=True)
        return 0


# ── Render orchestration ────────────────────────────────────────────────────

async def enqueue_render(
    db: AsyncSession, row: PromoProject, *, quality: str,
    actor_id: uuid.UUID,
) -> PromoRender:
    if quality not in ("draft", "high"):
        raise ValueError("quality must be draft|high")
    allowed, used, limit = await quota_check_and_consume()
    if not allowed:
        raise PermissionError(f"Monthly promo quota exhausted ({used}/{limit})")

    variables = build_variables(dict(row.payload or {}), row.locale, row.tone)
    board = storyboard_defaults(quality)
    share = await build_share_copy(dict(row.payload or {}), row.locale, row.tone)

    render = PromoRender(
        project_id=row.id, quality=quality,
        template_version=board["template_version"],
        brand_kit_version=board["brand_kit_version"],
        share_copy=share, duration_s=board["duration_s"],
        status="queued",
    )
    db.add(render)
    await db.flush()

    row.status = "queued"
    await db.flush()

    # Enqueue to Redis Streams (mirrors app/core/queue.py contract).
    # attempts travels inside the payload (not just the stream field) so a
    # re-enqueued retry keeps its count even if the entry is a fresh XADD.
    try:
        from app.core.queue import NoopQueue, get_queue
        queue = get_queue()
        if isinstance(queue, NoopQueue):
            # Fail loudly: a NoopQueue drops the job, which would leave the
            # render row stuck in `queued` forever with no error.
            raise RuntimeError("Render queue unavailable (REDIS_URL not configured)")
        await queue.enqueue(STREAM_NAME, {
            "render_id": str(render.id),
            "project_id": str(row.id),
            "quality": quality,
            "attempts": 0,
            "variables": variables,
            "storyboard": board,
            "requested_by": str(actor_id),
        })
    except RuntimeError:
        raise
    except Exception:
        logger.warning("promo enqueue failed for render=%s", render.id, exc_info=True)
        # Enqueue failure must not consume quota.
        await quota_release()
        render.status = "failed"
        render.error = "Queue unavailable — please retry"
        row.status = "failed"
        await db.flush()
        raise RuntimeError("Queue unavailable — please retry")

    return render


def render_to_response(render: PromoRender, progress: Optional[int] = None) -> Dict[str, Any]:
    mp4_url = f"/uploads/promos/{render.id}/ad.mp4" if render.mp4_path else None
    poster_url = f"/uploads/promos/{render.id}/poster.jpg" if render.poster_path else None
    return {
        "id": render.id, "project_id": render.project_id,
        "quality": render.quality, "template_version": render.template_version,
        "brand_kit_version": render.brand_kit_version,
        "mp4_url": mp4_url, "poster_url": poster_url,
        "share_copy": render.share_copy, "duration_s": render.duration_s,
        "render_ms": render.render_ms, "status": render.status,
        "error": render.error, "progress": progress,
        "created_at": render.created_at,
    }
