"""Promo render worker — claims `promo:render` jobs and produces mp4 + poster.

Mirrors `app/core/queue.py` (RedisStreamsQueue, consumer group, MAX_ATTEMPTS=3,
DLQ `promo:dlq`) and the SSE event bus (`events/` module).

Job lifecycle per render:
1. XREADGROUP from `promo:render` → project `rendering`, SSE `started`.
2. Resolve brand_kit.json + template version + variables from project payload.
3. Gate: `hyperframes check` — non-zero → failed, SSE failed, DLQ after 3 attempts.
4. Render: `hyperframes render --low-memory-mode --quality <q>` (streaming mode).
5. Poster: ffmpeg poster_at → poster.jpg → baked as frame 0.
6. Persist paths + timings, status done, SSE done. Audit PROMO_RENDER_COMPLETED.
7. Always clean temp frames (disk guard: refuse job if < 4GB free, requeue).

Renderer modes (env PROMO_RENDERER):
- `hyperframes` (default): real pipeline via subprocess.
- `fake`: deterministic stub for tests/local dev — writes a minimal valid mp4
  header + poster jpg without Chrome/ffmpeg. Used by the fake-render harness.
"""
import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

STREAM_NAME = "promo:render"
DLQ_NAME = "promo:dlq"
GROUP_NAME = "promo-workers"
MAX_ATTEMPTS = 3
DISK_MIN_FREE_MB = 4096
STUCK_MINUTES = 15

EVENT_STARTED = "promo.render.started"
EVENT_PROGRESS = "promo.render.progress"
EVENT_DONE = "promo.render.done"
EVENT_FAILED = "promo.render.failed"


def template_dir() -> Path:
    override = os.getenv("PROMO_TEMPLATE_DIR", "")
    if override:
        return Path(override)
    # Worker image bakes templates at /templates; repo checkout at infrastructure/.
    for candidate in (
        Path("/templates/course-ad-v1"),
        Path(__file__).resolve().parents[6] / "infrastructure" / "promo-templates" / "course-ad-v1",
        Path.cwd() / "infrastructure" / "promo-templates" / "course-ad-v1",
    ):
        if (candidate / "index.html").exists():
            return candidate
    return Path("/templates/course-ad-v1")


def uploads_root() -> Path:
    override = os.getenv("PROMO_UPLOADS_DIR", "")
    if override:
        return Path(override)
    from app.core.storage import UPLOAD_DIR
    return UPLOAD_DIR


def disk_free_mb(path: Path) -> float:
    usage = shutil.disk_usage(str(path))
    return usage.free / (1024 * 1024)


def check_disk_guard(path: Optional[Path] = None) -> Tuple[bool, float]:
    root = path or uploads_root()
    try:
        root.mkdir(parents=True, exist_ok=True)
        free = disk_free_mb(root)
    except Exception:
        return False, 0.0
    return (free >= DISK_MIN_FREE_MB), free


def merge_variables(html_text: str, variables: Dict[str, Any]) -> str:
    """Merge variables as TEXT ONLY (no innerHTML of user content).

    Supports two binding styles used by the template:
    - `<... data-var-text="heroL1" ...>old</...>`: inner text replaced.
    - `{{heroL1}}` mustache placeholders in text nodes.
    - `<html ... data-dir="...">` / scene roots get `dir` applied.
    Values are expected pre-escaped by the backend; this function escapes again
    defensively for any raw values.
    """
    import html as html_lib

    def esc(v: Any) -> str:
        s = str(v or "")
        # Backend already escapes; unescape-then-escape keeps it idempotent.
        return html_lib.escape(html_lib.unescape(s), quote=True)

    out = html_text
    # data-var-text bindings
    pattern = re.compile(
        r'(<[^>]*data-var-text="([^"]+)"[^>]*>)(.*?)(</[^>]+>)',
        re.DOTALL,
    )

    def _repl(m: re.Match) -> str:
        opening, var_id, _old, closing = m.groups()
        if var_id in ("rows", "cards", "stats"):
            return m.group(0)  # structured lists are rendered by template JS
        return f"{opening}{esc(variables.get(var_id, ''))}{closing}"

    out = pattern.sub(_repl, out)
    # data-var-src bindings (e.g. <audio data-var-src="music">): swap src when
    # the variable is provided, otherwise keep the tone-default fallback.
    try:
        src_pattern = re.compile(r'(<[^>]*data-var-src="([^"]+)"[^>]*\ssrc=")([^"]*)(")')
        def _src_repl(m: re.Match) -> str:
            prefix, var_id, _old_src, suffix = m.groups()
            val = variables.get(var_id)
            if val:
                return f"{prefix}{esc(val)}{suffix}"
            return m.group(0)
        out = src_pattern.sub(_src_repl, out)
    except Exception:
        pass
    # mustache placeholders (scalars only)
    for key, val in variables.items():
        if isinstance(val, (list, dict)):
            continue
        out = out.replace("{{" + str(key) + "}}", esc(val))
    # dir binding
    direction = esc(variables.get("dir", "rtl"))
    out = re.sub(r'<html([^>]*)>', lambda m: f'<html{m.group(1)} dir="{direction}">' if 'dir=' not in m.group(1) else m.group(0), out, count=1)
    # tone + locale as data attributes on root for the init-script switch
    tone = esc(variables.get("tone", "cinematic"))
    locale = esc(variables.get("locale", "ar"))
    out = out.replace('id="root"', f'id="root" data-tone="{tone}" data-locale="{locale}"')
    # embed variables JSON for the template init script (structured rows/cards/stats).
    # `<` is escaped so a payload value can never break out of the script block
    # (defense in depth on top of the text-only merge above).
    payload = json.dumps(variables, ensure_ascii=False).replace("<", "\\u003c")
    marker = '<!-- PROMO_VARIABLES -->'
    if marker in out:
        out = out.replace(marker, f'<script id="promo-variables" type="application/json">{payload}</script>')
    return out


def run_hyperframes_check(comp_dir: Path) -> Tuple[bool, str]:
    """Gate: `hyperframes check`. Non-zero → failed render (plan §5 step 3)."""
    if os.getenv("PROMO_RENDERER", "hyperframes") == "fake":
        # Fake gate: fail only when the composition is structurally broken so
        # the harness can exercise the failed/DLQ paths deterministically.
        index = comp_dir / "index.html"
        try:
            text = index.read_text(encoding="utf-8")
        except Exception as e:
            return False, f"fake-check: index.html unreadable: {e}"
        if 'data-duration' not in text or 'class="clip' not in text:
            return False, "fake-check: composition missing data-duration/clip markers"
        return True, "fake-check: ok"
    try:
        proc = subprocess.run(
            ["hyperframes", "check", str(comp_dir)],
            capture_output=True, text=True, timeout=120,
        )
        ok = proc.returncode == 0
        return ok, (proc.stdout + proc.stderr)[-4000:]
    except FileNotFoundError:
        return False, "hyperframes binary not found"
    except Exception as e:
        return False, f"check failed: {e}"


def _write_fake_mp4(path: Path, duration_s: float = 21.0) -> None:
    # Minimal ftyp header so content-type sniffers see video/mp4. Not playable
    # as real video — sufficient for the stubbed pipeline + download-link tests.
    path.write_bytes(
        b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
        + f"FAKE-PROMO duration={duration_s}".encode()
    )


def _write_fake_poster(path: Path) -> None:
    # 1x1 white JPEG — valid magic bytes for the jpg content check.
    path.write_bytes(
        bytes.fromhex(
            "ffd8ffe000104a46494600010100000100010000ffdb004300"
            "080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a"
            "171816181a1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d"
            "ffdb0043010909090c0b0c180d0d1832211c111434343434343434"
            "34343434343434343434343434343434343434343434343434"
            "ffc00011080001000103012200021101031101ffc4001f0000010501"
            "0101010100000000000000000102030405060708090a0bffc400b510"
            "0002010303020403050504040000017d010203000411051221314106"
            "13516107227114328191a1082342b1c11552d1f02433627282090a"
            "161718191a25262728292a3435363738393a434445464748494a53"
            "5455565758595a636465666768696a737475767778797a83848586"
            "8788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6"
            "b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6"
            "e7e8e9eaf2f3f4f5f6f7f8f9faffc4001f01000301010101010101"
            "01000000000000000102030405060708090a0bffc400b51100020102"
            "040404030407050404000102770001020311040521312206135161"
            "07227114328191a1082342b1c11552d1f02433627282090a161718"
            "191a25262728292a3435363738393a434445464748494a53545556"
            "5758595a636465666768696a737475767778797a83848586878889"
            "8a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9"
            "bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9"
            "eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00d2cf20ff"
            "d9"
        )
    )


async def _publish_progress(user_id: Optional[str], event_type: str, data: Dict[str, Any]) -> None:
    if not user_id:
        return
    try:
        from app.modules.events.bus import channel_for_user, get_event_bus
        from app.modules.events.envelope import make_event
        await get_event_bus().publish(channel_for_user(user_id), make_event(event_type, data))
    except Exception:
        logger.warning("promo SSE publish failed (%s)", event_type, exc_info=True)


async def _set_progress(render_id: str, percent: int) -> None:
    try:
        from app.core.config import settings
        if not settings.REDIS_URL:
            return
        import redis.asyncio as redis
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.set(f"promo:progress:{render_id}", int(percent), ex=3600)
        await client.aclose()
    except Exception:
        pass


async def render_job(
    *, render_id: str, project_id: str, quality: str,
    variables: Dict[str, Any], storyboard: Dict[str, Any],
    requested_by: Optional[str] = None,
) -> Tuple[bool, Dict[str, Any], str]:
    """Execute one render. Returns (ok, paths, error). Always cleans temp frames."""
    started = time.monotonic()
    duration_s = float(storyboard.get("duration_s", 21.0))
    poster_at = float(storyboard.get("poster_at", 1.2))
    out_dir = uploads_root() / "promos" / str(render_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    mp4_path = out_dir / "ad.mp4"
    poster_path = out_dir / "poster.jpg"

    ok_guard, free = check_disk_guard(uploads_root())
    if not ok_guard:
        return False, {}, f"Disk guard: only {free:.0f}MB free (< 4GB) — job requeued"

    await _set_progress(render_id, 5)
    await _publish_progress(requested_by, EVENT_STARTED, {"render_id": render_id, "project_id": project_id})

    src = template_dir()
    workdir = Path(os.getenv("TEMP", "/tmp")) / f"promo-{render_id}"
    try:
        if workdir.exists():
            shutil.rmtree(workdir, ignore_errors=True)
        shutil.copytree(src, workdir)
        index = workdir / "index.html"
        merged = merge_variables(index.read_text(encoding="utf-8"), variables)
        index.write_text(merged, encoding="utf-8")

        ok, check_out = run_hyperframes_check(workdir)
        if not ok:
            await _publish_progress(requested_by, EVENT_FAILED, {"render_id": render_id, "error": check_out[-500:]})
            return False, {}, f"Template check failed: {check_out[-1000:]}"

        await _set_progress(render_id, 20)

        if os.getenv("PROMO_RENDERER", "hyperframes") == "fake":
            for pct in (40, 70, 90):
                await _set_progress(render_id, pct)
                await _publish_progress(requested_by, EVENT_PROGRESS, {"render_id": render_id, "progress": pct})
            _write_fake_mp4(mp4_path, duration_s)
            _write_fake_poster(poster_path)
        else:
            quality_flag = "--draft" if quality == "draft" else "--high"
            await _set_progress(render_id, 40)
            proc = await asyncio.to_thread(
                subprocess.run,
                ["hyperframes", "render", str(workdir), "--low-memory-mode", quality_flag,
                 "--out", str(mp4_path)],
                capture_output=True, text=True, timeout=600,
            )
            if proc.returncode != 0:
                tail = ((proc.stdout or "") + (proc.stderr or ""))[-2000:]
                await _publish_progress(requested_by, EVENT_FAILED, {"render_id": render_id, "error": tail[-500:]})
                return False, {}, f"Render failed: {tail}"
            await _set_progress(render_id, 80)
            # Poster at storyboard.poster_at, baked as frame 0 (overlay recipe).
            frame_tmp = workdir / "poster_frame.jpg"
            proc = await asyncio.to_thread(
                subprocess.run,
                ["ffmpeg", "-y", "-ss", str(poster_at), "-i", str(mp4_path),
                 "-frames:v", "1", str(frame_tmp)],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0 or not frame_tmp.exists():
                # Poster failure degrades — still deliver the mp4.
                logger.warning("poster extraction failed for render=%s", render_id)
                _write_fake_poster(poster_path)
            else:
                shutil.move(str(frame_tmp), str(poster_path))

        render_ms = int((time.monotonic() - started) * 1000)
        await _set_progress(render_id, 100)
        rel_mp4 = f"promos/{render_id}/ad.mp4"
        rel_poster = f"promos/{render_id}/poster.jpg"
        await _publish_progress(requested_by, EVENT_DONE, {
            "render_id": render_id, "project_id": project_id,
            "mp4_url": f"/uploads/{rel_mp4}", "poster_url": f"/uploads/{rel_poster}",
        })
        return True, {
            "mp4_path": rel_mp4, "poster_path": rel_poster,
            "duration_s": duration_s, "render_ms": render_ms,
        }, ""
    except Exception as e:
        logger.exception("render_job failed render=%s", render_id)
        return False, {}, str(e)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def job_attempts(job: Dict[str, Any]) -> int:
    """Attempts travel inside the payload (survives re-enqueue as a fresh XADD)
    with the stream field as fallback for entries written before this change."""
    payload = job.get("payload", job) or {}
    try:
        field_attempts = int(job.get("attempts", 0) or 0)
    except (TypeError, ValueError):
        field_attempts = 0
    try:
        payload_attempts = int(payload.get("attempts", 0) or 0)
    except (TypeError, ValueError):
        payload_attempts = 0
    return max(field_attempts, payload_attempts)


async def requeue_job(queue, payload: Dict[str, Any], attempts: int) -> None:
    """Re-enqueue a retry as a fresh stream entry carrying its attempt count."""
    await queue.enqueue(STREAM_NAME, {**(payload or {}), "attempts": attempts})


async def process_one_job(db, job: Dict[str, Any], queue=None) -> bool:
    """Process a single queue entry. Always returns True (ACK the old entry):
    retries are re-enqueued as FRESH entries carrying attempts+1, because
    XREADGROUP ">" never redelivers an un-acked PEL entry on its own."""
    from app.modules.promo.models import PromoProject, PromoRender
    payload = job.get("payload", job) or {}
    render_id = payload.get("render_id")
    attempts = job_attempts(job)

    render = await db.get(PromoRender, render_id) if render_id else None
    if render is None:
        logger.warning("promo job references missing render=%s — ACK", render_id)
        return True

    project = await db.get(PromoProject, render.project_id)
    if project is None:
        render.status = "failed"
        render.error = "Project deleted"
        await db.flush()
        return True

    render.status = "rendering"
    project.status = "rendering"
    await db.flush()

    ok, paths, error = await render_job(
        render_id=str(render.id), project_id=str(project.id),
        quality=render.quality,
        variables=dict(payload.get("variables", {}) or {}),
        storyboard=dict(payload.get("storyboard", {}) or {}),
        requested_by=payload.get("requested_by"),
    )
    if ok:
        render.status = "done"
        render.mp4_path = paths["mp4_path"]
        render.poster_path = paths["poster_path"]
        render.duration_s = paths["duration_s"]
        render.render_ms = paths["render_ms"]
        render.error = None
        project.status = "done"
        await db.flush()
        try:
            from app.modules.identity import service as identity_service
            await identity_service.create_audit_log(
                db=db, user_id=project.created_by, action="PROMO_RENDER_COMPLETED",
                payload={"project_id": str(project.id), "render_id": str(render.id),
                          "render_ms": paths["render_ms"]},
                ip_address=None,
            )
        except Exception:
            logger.warning("PROMO_RENDER_COMPLETED audit failed", exc_info=True)
        try:
            from app.modules.promo import service as promo_service
            await promo_service.prune_old_renders(db, project.id, keep=5)
        except Exception:
            pass
        return True

    # Failure path: disk-guard refusal requeues WITHOUT consuming an attempt
    # (the job did no work) and backs off so a full disk doesn't hot-loop.
    if error.startswith("Disk guard:"):
        logger.warning("promo render refused (disk) render=%s", render_id)
        render.status = "queued"
        project.status = "queued"
        await db.flush()
        if queue is not None:
            await requeue_job(queue, payload, attempts)
        await asyncio.sleep(30)
        return True

    if attempts + 1 >= MAX_ATTEMPTS:
        render.status = "failed"
        render.error = error[-2000:]
        project.status = "failed"
        await db.flush()
        try:
            from app.core.config import settings
            if settings.REDIS_URL:
                import redis.asyncio as redis
                client = redis.from_url(settings.REDIS_URL, decode_responses=True)
                await client.xadd(DLQ_NAME, {"render_id": str(render.id), "error": error[-1000:]})
                await client.aclose()
        except Exception:
            logger.warning("promo DLQ write failed render=%s", render_id, exc_info=True)
        # Release the quota slot — a terminal failure consumed no value.
        try:
            from app.modules.promo import service as promo_service
            await promo_service.quota_release()
        except Exception:
            pass
        return True

    render.status = "queued"
    project.status = "queued"
    await db.flush()
    if queue is not None:
        await requeue_job(queue, payload, attempts + 1)
    return True


async def watchdog_sweep_stuck(db, queue=None, minutes: int = STUCK_MINUTES) -> int:
    """Reset `rendering` rows older than `minutes` back to `queued` (worker OOM/kill)
    AND re-enqueue them — a reset without a fresh stream entry would orphan the
    job, since the consumer only reads new (">") entries."""
    from app.modules.promo.models import PromoProject, PromoRender
    from sqlalchemy import select
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    q = select(PromoRender).where(
        PromoRender.status == "rendering", PromoRender.created_at < cutoff,
    )
    rows = list((await db.execute(q)).scalars().all())
    for r in rows:
        r.status = "queued"
        proj = await db.get(PromoProject, r.project_id)
        if proj is not None:
            proj.status = "queued"
        if queue is not None and proj is not None:
            try:
                from app.modules.promo import service as promo_service
                variables = promo_service.build_variables(
                    dict(proj.payload or {}), proj.locale, proj.tone)
                await requeue_job(queue, {
                    "render_id": str(r.id), "project_id": str(proj.id),
                    "quality": r.quality, "attempts": 0,
                    "variables": variables,
                    "storyboard": promo_service.storyboard_defaults(r.quality),
                    "requested_by": str(proj.created_by) if proj.created_by else None,
                }, 0)
            except Exception:
                logger.warning("watchdog re-enqueue failed render=%s", r.id, exc_info=True)
    if rows:
        await db.flush()
    return len(rows)


async def run_forever(poll_seconds: int = 5) -> None:
    from app.core.queue import get_queue
    from app.db.session import async_session_maker
    queue = get_queue()
    logger.info("promo-worker started stream=%s group=%s", STREAM_NAME, GROUP_NAME)
    while True:
        # NOTE: the worker uses bare sessions (not the get_db dependency),
        # so every state transition must be COMMITTED explicitly — flush()
        # alone is rolled back when the context exits.
        try:
            async with async_session_maker() as db:
                try:
                    await watchdog_sweep_stuck(db, queue)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise
        except Exception:
            logger.warning("watchdog sweep failed", exc_info=True)
        try:
            job = await queue.dequeue(STREAM_NAME, timeout=poll_seconds)
        except Exception:
            logger.warning("promo dequeue failed", exc_info=True)
            await asyncio.sleep(poll_seconds)
            continue
        if not job:
            continue
        try:
            from app.db.session import async_session_maker
            async with async_session_maker() as db:
                try:
                    await process_one_job(db, job, queue)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise
                try:
                    await queue.ack(STREAM_NAME, job.get("id", ""))
                except Exception:
                    logger.warning("promo ack failed", exc_info=True)
        except Exception:
            logger.exception("promo job crashed")
            await asyncio.sleep(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_forever())
