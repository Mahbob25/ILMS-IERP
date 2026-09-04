"""Smoke-test the LessonForge generator render path with a mocked LLM."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services import lessonforge

FAKE_LLM_JSON = {
    "title": "Subject-Verb Agreement",
    "theme_notes": "Colorful classroom style",
    "sections": [
        {
            "heading": "Core Rule",
            "blocks": [
                {
                    "kind": "rule",
                    "text": "The subject and verb must agree in number.",
                    "items": ["Singular subject → singular verb", "Plural subject → plural verb"],
                    "arabic": "يجب أن يتوافق الفاعل والفعل من حيث المفرد والجمع.",
                    "sticker": "lightbulb",
                }
            ],
        },
        {
            "heading": "Practice",
            "blocks": [
                {
                    "kind": "practice",
                    "text": "Choose the correct verb: He (work/works) every day.",
                    "answer": "works",
                },
                {
                    "kind": "teacher_note",
                    "text": "Ask the class to explain why 'They work' is correct.",
                },
            ],
        },
    ],
    "custom_css": None,
}


async def main() -> None:
    settings.OPENAI_API_KEY = "test-key"

    async def fake_call(prompt: str):
        from app.services.lessonforge_content import LessonForgeContent
        return LessonForgeContent.model_validate(FAKE_LLM_JSON)

    lessonforge._call_llm = fake_call

    # Image generation is disabled in this smoke (no provider/model), so the
    # enrichment step must no-op and keep the emoji/sticker fallback.
    async def no_image_cfg():
        return {
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "api_key": "",
            "image_provider": "",
            "image_model": "",
        }

    lessonforge.load_config = no_image_cfg

    payload = {
        "topic_text": "Subject and verb must agree in number.",
        "style": "colorful",
        "explanation_language": "bilingual",
        "learner_level": "beginner",
        "difficulty": "medium",
        "output_mode": "worksheet",
        "content_mode": "strict_source",
        "include_practice": True,
        "include_answer_key": True,
        "include_teacher_notes": True,
        "include_common_mistakes": True,
        "include_exceptions": True,
        "practice_type": "multiple_choice",
    }

    result = await lessonforge.generate(payload)
    assert result["status"] == "completed"
    assert result["title"] == "Subject-Verb Agreement"
    html = result["html"]

    # Key structural checks
    assert "Subject-Verb Agreement" in html
    assert "theme-colorful" in html
    assert "kind-rule" in html
    assert "kind-practice" in html
    assert "teacher-only" in html
    assert 'class="arabic"' in html
    assert "Answer: works" in html
    assert "@media print" in html
    assert "@media (max-width: 560px)" in html
    assert "<style>" in html and "</style>" in html

    # Poster-engine markers (cards, grids, icon badges, hero ribbon, fonts)
    assert 'class="card kind-rule"' in html
    assert "icon-badge" in html
    assert 'class="compare-grid"' in html or "compare-grid" in html
    assert 'class="hero"' in html
    assert "layout-worksheet" in html
    assert "fonts.googleapis.com" in html or "fonts.gstatic.com" in html
    assert "break-inside: avoid" in html

    # Only Google Fonts external dependencies are allowed (fonts.googleapis / gstatic)
    import re
    external = re.findall(r"https?://[^\s\"'>]+", html)
    for url in external:
        assert "fonts.googleapis.com" in url or "fonts.gstatic.com" in url, f"unexpected external URL: {url}"

    # ── Phase 1: sticker bank + medallion asset slot ─────────────────────
    # A block with a "sticker" key renders inside a white die-cut medallion.
    assert 'class="sticker-medallion"' in html
    assert "viewBox=\"0 0 100 100\"" in html, "sticker SVG bank should be emitted"
    assert 'class="icon-badge"' in html, "cards without an asset keep the emoji-badge fallback"
    # No AI-generated image without config: no rendered <img> sticker and no
    # embedded base64 data URI (the .sticker-gen CSS rule may still be present).
    assert '<img class="sticker-gen"' not in html, "no generated image should render without image config"
    assert "data:image" not in html, "no base64 image should be embedded without image config"

    print("generator smoke test PASSED")
    print(f"html length: {len(html)} bytes")


async def run_enrichment() -> None:
    """Exercise the Phase-2 image enrichment pipeline with mocked gateway calls.

    Verifies the graceful-degradation contract: with image config present, a
    block's image_hint gets a base64 data URI attached; a failing image call
    leaves that slot null; and with no image config nothing is generated.
    """
    from app.services.lessonforge_content import LessonForgeContent

    def _content(hints: list, hero: str | None = None):
        blocks = [
            {"kind": "definition", "text": "a", "items": [], "arabic": None, "image_hint": h}
            for h in hints
        ]
        return LessonForgeContent.model_validate(
            {
                "title": "T",
                "theme_notes": None,
                "sections": [{"heading": "H", "blocks": blocks}],
                "hero_image_hint": hero,
            }
        )

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16

    # Case A: image config present -> hints get data URIs; failures stay null.
    async def fake_gen(prompt, *, model, api_key, size="512x512"):
        if "FAIL" in prompt:
            raise RuntimeError("provider refused")
        return png

    async def fake_load():
        return {
            "image_provider": "google",
            "image_model": "gemini-2.5-flash-image-preview",
            "api_key": "k",
        }

    from app.services import lessonforge as lf

    orig_gen, orig_load = lf.generate_image, lf.load_config
    lf.generate_image, lf.load_config = fake_gen, fake_load
    try:
        # 3 hints but the cap is MAX_CARD_IMAGES=2: only the first two are
        # scheduled; the third must be left null (cost bound).
        c = _content(["ok one", "FAIL two", "ok three"])
        await lf._enrich_with_images(c)
        b1, b2, b3 = c.sections[0].blocks
        assert b1.image_data.startswith("data:image/png;base64,")
        assert b2.image_data is None, "failed image call must leave the slot null"
        assert b3.image_data is None, "hints beyond the cap must not be generated"
    finally:
        lf.generate_image, lf.load_config = orig_gen, orig_load

    # Case B: no image config -> nothing generated, calls never fire.
    async def fake_load_disabled():
        return {"image_provider": "", "image_model": "", "api_key": "k"}

    fired = []

    async def fake_gen_bad(prompt, **kw):
        fired.append(prompt)

    lf.generate_image, lf.load_config = fake_gen_bad, fake_load_disabled
    try:
        c2 = _content(["ignored"], hero="hero hint")
        await lf._enrich_with_images(c2)
        assert c2.hero_image_data is None
        assert c2.sections[0].blocks[0].image_data is None
        assert fired == [], "image calls must not fire without config"
    finally:
        lf.generate_image, lf.load_config = orig_gen, orig_load

    print("image enrichment smoke test PASSED")


if __name__ == "__main__":
    asyncio.run(main())
    asyncio.run(run_enrichment())
