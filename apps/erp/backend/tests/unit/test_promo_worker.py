"""Unit tests for the promo render worker (fake-render harness).

Covers plan §8 worker paths: success / check-fail / DLQ / disk-guard refusal /
watchdog sweep — all with PROMO_RENDERER=fake so no Chrome/ffmpeg is needed.
"""
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, Mock
import pytest

from app.modules.promo import worker as promo_worker
from app.modules.promo import service as promo_service


@pytest.fixture(autouse=True)
def fake_renderer(monkeypatch, tmp_path):
    monkeypatch.setenv("PROMO_RENDERER", "fake")
    monkeypatch.setenv("PROMO_UPLOADS_DIR", str(tmp_path / "uploads"))
    monkeypatch.setattr(promo_worker, "template_dir", lambda: Path("E:/lms/infrastructure/promo-templates/course-ad-v1"))
    return tmp_path


def sample_job(**overrides):
    payload = {
        "render_id": str(uuid.uuid4()),
        "project_id": str(uuid.uuid4()),
        "quality": "draft",
        "variables": promo_service.build_variables({
            "heroL1": "Learn it", "heroL2": "with AI", "heroL3": "ship it same day.",
            "cta": "Book free trial", "kicker": "k", "micro": "m",
            "rows": [], "cards": [], "stats": [],
        }, "en", "clean"),
        "storyboard": promo_service.storyboard_defaults("draft"),
        "requested_by": str(uuid.uuid4()),
    }
    payload.update(overrides)
    return {"id": "stream-1", "job_id": str(uuid.uuid4()), "payload": payload, "attempts": 0, "queue": "promo:render"}


class TestMergeVariables:
    def test_text_only_no_innerhtml(self):
        html_text = '<div id="s1-l1" data-var-text="heroL1">old</div>'
        out = promo_worker.merge_variables(html_text, {"heroL1": '<img src=x onerror=alert(1)>', "dir": "ltr", "tone": "clean", "locale": "en"})
        assert "<img" not in out
        assert "&lt;img" in out

    def test_dir_applied(self):
        out = promo_worker.merge_variables("<html><body></body></html>", {"dir": "rtl", "tone": "c", "locale": "ar"})
        assert 'dir="rtl"' in out

    def test_variables_marker_embedded(self):
        html_text = "<html><!-- PROMO_VARIABLES --></html>"
        out = promo_worker.merge_variables(html_text, {"heroL1": "Hi", "dir": "ltr", "tone": "clean", "locale": "en"})
        assert "promo-variables" in out
        assert "Hi" in out


class TestCheckGate:
    def test_fake_check_passes_on_real_template(self):
        ok, out = promo_worker.run_hyperframes_check(Path("E:/lms/infrastructure/promo-templates/course-ad-v1"))
        assert ok is True

    def test_fake_check_fails_on_broken_composition(self, tmp_path):
        (tmp_path / "index.html").write_text("<html><body>broken</body></html>", encoding="utf-8")
        ok, out = promo_worker.run_hyperframes_check(tmp_path)
        assert ok is False


class TestRenderJob:
    async def test_fake_render_success(self, tmp_path):
        job = sample_job()
        ok, paths, error = await promo_worker.render_job(
            render_id=job["payload"]["render_id"], project_id=job["payload"]["project_id"],
            quality="draft", variables=job["payload"]["variables"],
            storyboard=job["payload"]["storyboard"], requested_by=None,
        )
        assert ok is True
        assert error == ""
        assert paths["mp4_path"].endswith("ad.mp4")
        assert paths["poster_path"].endswith("poster.jpg")
        assert paths["render_ms"] >= 0
        root = Path(str(tmp_path / "uploads")) / "promos" / job["payload"]["render_id"]
        assert (root / "ad.mp4").exists()
        assert (root / "poster.jpg").exists()

    async def test_disk_guard_refuses(self, monkeypatch):
        monkeypatch.setattr(promo_worker, "check_disk_guard", lambda path=None: (False, 100.0))
        job = sample_job()
        ok, _, error = await promo_worker.render_job(
            render_id=job["payload"]["render_id"], project_id=job["payload"]["project_id"],
            quality="draft", variables=job["payload"]["variables"],
            storyboard=job["payload"]["storyboard"],
        )
        assert ok is False
        assert error.startswith("Disk guard:")


def make_db_with_render(render, project):
    db = AsyncMock()
    # AsyncSession.add is sync in real code — keep it sync here too so the
    # audit-log path inside process_one_job doesn't emit un-awaited warnings.
    db.add = Mock()

    async def _get(model, pk):
        from app.modules.promo.models import PromoRender, PromoProject
        if model is PromoRender and str(pk) == str(render.id):
            return render
        if model is PromoProject and str(pk) == str(project.id):
            return project
        return None

    db.get = _get
    return db


@pytest.fixture
def fake_queue():
    """In-memory stand-in for RedisStreamsQueue (captures re-enqueues)."""
    q = Mock()
    q.enqueued = []
    async def _enqueue(stream, payload):
        q.enqueued.append((stream, payload))
        return "new-job-id"
    async def _ack(stream, entry_id):
        q.acked = (stream, entry_id)
    q.enqueue = Mock(side_effect=_enqueue)
    q.ack = Mock(side_effect=_ack)
    return q


class TestJobAttempts:
    def test_prefers_max_of_field_and_payload(self):
        assert promo_worker.job_attempts({"attempts": 1, "payload": {"attempts": 2}}) == 2
        assert promo_worker.job_attempts({"attempts": 3, "payload": {"attempts": 1}}) == 3
        assert promo_worker.job_attempts({"payload": {}}) == 0
        assert promo_worker.job_attempts({"attempts": "bad", "payload": {"attempts": None}}) == 0


class TestProcessOneJob:
    async def test_success_marks_done(self, fake_queue):
        render = Mock(id=uuid.uuid4(), project_id=uuid.uuid4(), quality="draft", status="queued")
        project = Mock(id=render.project_id, status="queued", created_by=uuid.uuid4())
        db = make_db_with_render(render, project)
        job = sample_job(render_id=str(render.id), project_id=str(project.id))
        assert await promo_worker.process_one_job(db, job, fake_queue) is True
        assert render.status == "done"
        assert project.status == "done"
        assert render.mp4_path.endswith("ad.mp4")

    async def test_retry_reenqueues_with_attempts_plus_one(self, tmp_path, monkeypatch, fake_queue):
        # Broken template dir forces the check gate to fail.
        broken = tmp_path / "broken"
        broken.mkdir()
        (broken / "index.html").write_text("<html>broken</html>", encoding="utf-8")
        monkeypatch.setattr(promo_worker, "template_dir", lambda: broken)

        render = Mock(id=uuid.uuid4(), project_id=uuid.uuid4(), quality="draft", status="queued")
        project = Mock(id=render.project_id, status="queued", created_by=uuid.uuid4())
        db = make_db_with_render(render, project)

        job = sample_job(render_id=str(render.id), project_id=str(project.id))
        job["attempts"] = 0
        assert await promo_worker.process_one_job(db, job, fake_queue) is True
        assert render.status == "queued"
        # Retry goes out as a FRESH entry carrying attempts=1 (XREADGROUP ">"
        # never redelivers the old PEL entry on its own).
        assert len(fake_queue.enqueued) == 1
        stream, payload = fake_queue.enqueued[0]
        assert stream == "promo:render"
        assert payload["attempts"] == 1
        assert payload["render_id"] == str(render.id)

    async def test_third_attempt_goes_to_dlq(self, tmp_path, monkeypatch, fake_queue):
        broken = tmp_path / "broken"
        broken.mkdir()
        (broken / "index.html").write_text("<html>broken</html>", encoding="utf-8")
        monkeypatch.setattr(promo_worker, "template_dir", lambda: broken)

        render = Mock(id=uuid.uuid4(), project_id=uuid.uuid4(), quality="draft", status="queued")
        project = Mock(id=render.project_id, status="queued", created_by=uuid.uuid4())
        db = make_db_with_render(render, project)

        job = sample_job(render_id=str(render.id), project_id=str(project.id))
        job["attempts"] = 2  # third attempt → terminal DLQ
        assert await promo_worker.process_one_job(db, job, fake_queue) is True
        assert render.status == "failed"
        assert render.error
        # Terminal failure does NOT re-enqueue.
        assert len(fake_queue.enqueued) == 0

    async def test_disk_guard_reenqueues_without_consuming_attempt(self, monkeypatch, fake_queue):
        monkeypatch.setattr(promo_worker, "check_disk_guard", lambda path=None: (False, 100.0))
        monkeypatch.setattr(promo_worker.asyncio, "sleep", AsyncMock())
        render = Mock(id=uuid.uuid4(), project_id=uuid.uuid4(), quality="draft", status="queued")
        project = Mock(id=render.project_id, status="queued", created_by=uuid.uuid4())
        db = make_db_with_render(render, project)
        job = sample_job(render_id=str(render.id), project_id=str(project.id))
        assert await promo_worker.process_one_job(db, job, fake_queue) is True
        assert render.status == "queued"
        assert fake_queue.enqueued[0][1]["attempts"] == 0

    async def test_missing_render_acks(self, fake_queue):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        assert await promo_worker.process_one_job(db, sample_job(), fake_queue) is True


class TestWatchdog:
    async def test_sweeps_stuck_rendering_and_reenqueues(self, fake_queue):
        from app.modules.promo.models import PromoRender, PromoProject
        old = Mock(spec=PromoRender)
        old.status = "rendering"
        old.project_id = uuid.uuid4()
        old.id = uuid.uuid4()
        old.quality = "draft"
        proj = Mock(spec=PromoProject)
        proj.status = "rendering"
        proj.id = old.project_id
        proj.payload = {}
        proj.locale = "ar"
        proj.tone = "cinematic"
        proj.created_by = uuid.uuid4()
        db = AsyncMock()
        db.add = Mock()
        result = Mock()
        result.scalars.return_value.all.return_value = [old]
        db.execute = AsyncMock(return_value=result)

        async def _get(model, pk):
            return proj if model is PromoProject else None
        db.get = _get
        swept = await promo_worker.watchdog_sweep_stuck(db, fake_queue, minutes=15)
        assert swept == 1
        assert old.status == "queued"
        # The rescue is useless without a fresh stream entry — assert it.
        assert len(fake_queue.enqueued) == 1
        assert fake_queue.enqueued[0][1]["render_id"] == str(old.id)
