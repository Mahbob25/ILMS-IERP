"""Unit tests for Promo Studio validation, quota, variables, and share copy.

Covers plan §8: max-length validation matrix (AR + EN, boundary chars),
quota allow/deny/reset, storyboard defaults, share-copy fallback.
"""
import uuid
import pytest

from app.modules.promo import schemas as promo_schemas
from app.modules.promo import service as promo_service


def valid_payload(**overrides):
    base = {
        "heroL1": "Learn it",
        "heroL2": "with AI",
        "heroL3": "ship it same day.",
        "cta": "Book free trial",
        "kicker": "New course",
        "micro": "On-campus",
        "rows": [{"time": "08", "title": "English B1 — Room A", "meta": "Ms. Layla"}],
        "cards": [{"tag": "CODE", "name": "Computing", "badge": "12 courses", "desc": "Ship weekly.", "seats": "5 left"}],
        "stats": [{"value": "12k+", "label": "graduates"}],
    }
    base.update(overrides)
    return base


class TestMaxLengths:
    @pytest.mark.parametrize("field,max", [
        ("heroL1", 24), ("heroL2", 32), ("heroL3", 28), ("cta", 26),
    ])
    def test_boundary_accepts_exact_max_en(self, field, max):
        p = valid_payload(**{field: "x" * max})
        assert promo_schemas.PromoPayload(**p)

    @pytest.mark.parametrize("field,max", [
        ("heroL1", 24), ("heroL2", 32), ("heroL3", 28), ("cta", 26),
    ])
    def test_one_over_max_rejected(self, field, max):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(**{field: "x" * (max + 1)}))

    def test_arabic_boundary_counts_chars_not_bytes(self):
        # 24 Arabic chars must pass even though the UTF-8 encoding is ~48 bytes.
        p = valid_payload(heroL1="ت" * 24)
        assert promo_schemas.PromoPayload(**p).heroL1 == "ت" * 24

    def test_arabic_one_over_max_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(heroL1="ت" * 25))

    def test_row_title_max_34(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(rows=[
                {"time": "08", "title": "t" * 35, "meta": "m"}]))

    def test_card_name_max_20_desc_max_60(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(cards=[
                {"tag": "T", "name": "n" * 21, "badge": "", "desc": "", "seats": ""}]))
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(cards=[
                {"tag": "T", "name": "n", "badge": "", "desc": "d" * 61, "seats": ""}]))

    def test_rows_capped_at_3_cards_at_4(self):
        from pydantic import ValidationError
        rows = [{"time": "08", "title": f"T{i}", "meta": "m"} for i in range(4)]
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(rows=rows))
        cards = [{"tag": "T", "name": f"N{i}", "badge": "", "desc": "", "seats": ""} for i in range(5)]
        with pytest.raises(ValidationError):
            promo_schemas.PromoPayload(**valid_payload(cards=cards))

    def test_v1_rejects_non_course_type(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            promo_schemas.ProjectCreate(type="activity", locale="ar", tone="cinematic",
                                        payload=valid_payload())


class TestBuildVariables:
    def test_escapes_html_as_text_only(self):
        payload = valid_payload(heroL1='<script>alert("x")</script>')
        variables = promo_service.build_variables(payload, "ar", "cinematic")
        assert "<script>" not in variables["heroL1"]
        assert "&lt;script&gt;" in variables["heroL1"]

    def test_dir_rtl_for_ar_ltr_for_en(self):
        assert promo_service.build_variables(valid_payload(), "ar", "cinematic")["dir"] == "rtl"
        assert promo_service.build_variables(valid_payload(), "en", "clean")["dir"] == "ltr"

    def test_lists_truncated_defensively(self):
        payload = valid_payload()
        payload["rows"] = payload["rows"] * 5  # 5 rows in raw dict
        payload["cards"] = payload["cards"] * 6
        variables = promo_service.build_variables(payload, "ar", "cinematic")
        assert len(variables["rows"]) == 3
        assert len(variables["cards"]) == 4


class TestStoryboard:
    def test_defaults(self):
        board = promo_service.storyboard_defaults("draft")
        assert board["template_version"] == "course-ad-v1"
        assert board["brand_kit_version"] == promo_service.brand_kit_version() >= 1
        assert board["duration_s"] == 21.0
        assert board["poster_at"] == 1.2

    def test_brand_kit_version_reads_file(self):
        assert promo_service.brand_kit_version() == 1


class TestShareCopy:
    async def test_fallback_ar_without_keys(self, monkeypatch):
        monkeypatch.setattr(promo_service, "build_share_copy",
                            promo_service.build_share_copy.__wrapped__
                            if hasattr(promo_service.build_share_copy, "__wrapped__") else promo_service.build_share_copy)
        # Force the no-key path by clearing keys on settings.
        from app.core import config as config_module
        monkeypatch.setattr(config_module.settings, "OPENAI_API_KEY", "")
        monkeypatch.setattr(config_module.settings, "GEMINI_API_KEY", "")
        copy = await promo_service.build_share_copy(valid_payload(), "ar", "cinematic")
        assert "احجز" in copy or "التجريبي" in copy

    async def test_fallback_en_without_keys(self, monkeypatch):
        from app.core import config as config_module
        monkeypatch.setattr(config_module.settings, "OPENAI_API_KEY", "")
        monkeypatch.setattr(config_module.settings, "GEMINI_API_KEY", "")
        copy = await promo_service.build_share_copy(valid_payload(), "en", "clean")
        assert "free trial" in copy.lower()

    def test_fallback_never_empty(self):
        assert promo_service.fallback_share_copy({}, "ar", "cinematic")
        assert promo_service.fallback_share_copy({}, "en", "clean")


class TestQuotaHelpers:
    def test_quota_key_monthly(self):
        from datetime import datetime, timezone
        now = datetime(2026, 9, 18, tzinfo=timezone.utc)
        assert promo_service.quota_key(now) == "promo:quota:2026-09"

    def test_quota_reset_at_end_of_month(self):
        from datetime import datetime, timezone
        now = datetime(2026, 9, 18, tzinfo=timezone.utc)
        reset = promo_service.quota_reset_at(now)
        assert reset.startswith("2026-09-30")

    async def test_quota_open_without_redis(self, monkeypatch):
        from app.core import config as config_module
        monkeypatch.setattr(config_module.settings, "REDIS_URL", "")
        allowed, used, limit = await promo_service.quota_check_and_consume()
        assert allowed is True
        assert limit >= 20

    async def test_create_project_rejects_non_course(self):
        from unittest.mock import AsyncMock
        db = AsyncMock()
        with pytest.raises(ValueError):
            await promo_service.create_project(
                db, type_="activity", locale="ar", tone="cinematic",
                payload=valid_payload(), actor_id=uuid.uuid4(),
            )


class TestUpdateDraftReedit:
    def _db_with_active(self, active: int):
        from unittest.mock import AsyncMock, Mock
        db = AsyncMock()
        result = Mock()
        result.scalar.return_value = active
        db.execute = AsyncMock(return_value=result)
        return db

    def _row(self, status: str):
        from unittest.mock import Mock
        return Mock(status=status, locale="ar", tone="cinematic", payload={}, id=uuid.uuid4())

    async def test_reedit_after_done_resets_to_draft(self):
        db = self._db_with_active(0)
        row = self._row("done")
        out = await promo_service.update_draft(db, row, payload=valid_payload())
        assert out.status == "draft"

    async def test_blocked_while_render_active(self):
        db = self._db_with_active(1)
        with pytest.raises(ValueError, match="active render"):
            await promo_service.update_draft(db, self._row("draft"), payload=valid_payload())


class TestEnqueueGuards:
    async def test_noop_queue_fails_loudly(self, monkeypatch):
        """Without Redis the queue drops jobs — enqueue must 503, not strand."""
        from unittest.mock import AsyncMock, Mock
        from app.core.queue import NoopQueue
        import app.core.queue as queue_module
        monkeypatch.setattr(queue_module, "get_queue", lambda: NoopQueue())
        db = AsyncMock()
        db.add = Mock()
        row = Mock(id=uuid.uuid4(), locale="ar", tone="cinematic",
                   payload=valid_payload(), status="draft")
        with pytest.raises(RuntimeError, match="queue unavailable"):
            await promo_service.enqueue_render(db, row, quality="draft", actor_id=uuid.uuid4())

    async def test_enqueue_carries_attempts_zero(self, monkeypatch):
        from unittest.mock import AsyncMock, Mock
        captured = {}

        class SpyQueue:
            async def enqueue(self, stream, payload):
                captured["stream"] = stream
                captured["payload"] = payload
                return "job-1"

        import app.core.queue as queue_module
        from app.core.queue import NoopQueue
        monkeypatch.setattr(queue_module, "get_queue", lambda: SpyQueue())
        monkeypatch.setattr(promo_service, "quota_check_and_consume", AsyncMock(return_value=(True, 1, 20)))
        monkeypatch.setattr(promo_service, "build_share_copy", AsyncMock(return_value="copy"))
        db = AsyncMock()
        db.add = Mock()
        row = Mock(id=uuid.uuid4(), locale="ar", tone="cinematic",
                   payload=valid_payload(), status="draft")
        render = await promo_service.enqueue_render(db, row, quality="draft", actor_id=uuid.uuid4())
        assert captured["stream"] == "promo:render"
        assert captured["payload"]["attempts"] == 0
        assert render.status == "queued"
