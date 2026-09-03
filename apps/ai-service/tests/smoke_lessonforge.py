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

    print("generator smoke test PASSED")
    print(f"html length: {len(html)} bytes")


if __name__ == "__main__":
    asyncio.run(main())
