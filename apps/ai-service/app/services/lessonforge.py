"""LessonForge generator — turns the teacher's spec contract into self-contained,
classroom-ready HTML via an LLM + a Jinja2 template.

Runs inside the ai-worker process (apps/ai-service). No image generation:
``output_format`` is fixed to ``html``, produced by a text LLM.
"""
import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.lessonforge_content import LessonForgeContent, LessonForgeSection

logger = logging.getLogger(__name__)

# ── Style → CSS theme mapping (spec §28). Custom styles get their own CSS. ──
THEME_NAMES = {
    "colorful": "theme-colorful",
    "minimalist": "theme-minimalist",
    "playful": "theme-playful",
    "academic": "theme-academic",
    "professional": "theme-professional",
    "dark": "theme-dark",
    "pastel": "theme-pastel",
    "modern": "theme-modern",
    "classroom-friendly": "theme-classroom",
}

STYLE_HINTS = {
    "colorful": "Vibrant, high-contrast, energetic classroom feel with bold accent colors.",
    "minimalist": "Clean, lots of whitespace, restrained palette, typography-led.",
    "playful": "Rounded shapes, friendly, slightly whimsical; still legible.",
    "academic": "Formal, serif headings, restrained scholarly palette.",
    "professional": "Corporate-clean, muted palette, strong alignment.",
    "dark": "Dark background with light text; high-contrast, modern.",
    "pastel": "Soft pastel palette, gentle, calm.",
    "modern": "Current, flat design, generous spacing, subtle shadows.",
    "classroom-friendly": "High readability from a distance, clear cards, strong hierarchy.",
}


def build_prompt(payload: dict) -> str:
    """Encode the spec's pedagogical rules (§13–§28) into the LLM instruction."""
    p = payload

    def _val(key: str, default: str = "auto") -> str:
        v = p.get(key)
        return str(v).strip() if v not in (None, "") else default

    lang = _val("explanation_language", "auto")
    content_mode = _val("content_mode", "strict_source")
    output_mode = _val("output_mode", "auto")
    learner_level = _val("learner_level", "auto")
    difficulty = _val("difficulty", "auto")

    lang_rules = {
        "english": (
            "LANGUAGE MODE: English only. Use English for explanations, definitions, "
            "terminology, examples, rules, exercises, instructions, and answers. Do NOT add "
            "Arabic unless the teacher's own supporting notes include Arabic that must be preserved."
        ),
        "bilingual": (
            "LANGUAGE MODE: Bilingual — English is the primary instructional language; Arabic "
            "supports explanation. Keep grammar terminology, target vocabulary, examples, formulas, "
            "rules, exercises, questions, and answers in English. Use Arabic (in the block's 'arabic' "
            "field) for explanations, definitions, difficult concepts, comparisons, and misconceptions. "
            "Guiding principle: 'Arabic explains; English teaches.' Do not translate every example."
        ),
    }.get(
        lang,
        (
            "LANGUAGE MODE: Auto — decide the appropriate amount of Arabic support based on learner "
            "level, topic difficulty, subject, and any teacher supporting notes. Beginner/elementary: "
            "strong to substantial bilingual support. Middle school: moderate. High school: prefer "
            "English with targeted Arabic clarification. University/adult/advanced: prefer English with "
            "limited Arabic. Never convert the resource into a fully Arabic lesson. When Arabic is used, "
            "put it in the block's 'arabic' field and keep the English target-language content primary. "
            "Guiding principle: 'Arabic explains; English teaches.'"
        ),
    )

    content_rules = {
        "strict_source": (
            "CONTENT MODE: strict_source — use ONLY information supported by the teacher's source. "
            "Do not introduce unsupported rules, facts, examples, or explanations."
        ),
        "source_plus_examples": (
            "CONTENT MODE: source_plus_examples — preserve the source while allowing simple additional "
            "examples that illustrate supplied concepts. Added examples must not introduce new rules."
        ),
        "teacher_creative": (
            "CONTENT MODE: teacher_creative — allow pedagogical enrichment: additional explanations, "
            "examples, analogies, practice, teaching tips, activities, memory aids. Do not contradict "
            "the source and never silently 'correct' it."
        ),
    }
    content_rule = content_rules.get(content_mode) or content_rules["strict_source"]

    structure_by_mode = {
        "cheat_sheet": "Concise, scannable cheat sheet: topic title, concise definition, major rules, examples, comparisons, exceptions, common mistakes, memory aids, quick-review checklist.",
        "revision_guide": "Revision guide prioritizing key concepts, rules, examples, common mistakes, exam traps, quick review, optional practice.",
        "worksheet": "Worksheet: concise explanation, worked examples, guided practice, independent exercises of increasing difficulty, optional answer key.",
        "quiz": "Quiz: clear instructions, questions aligned with the objective, appropriate difficulty, varied question types, unambiguous answers, optional answer key. Do not test unrelated knowledge.",
        "poster": "Classroom poster: large title, core rules, memorable examples, minimal text, strong visual hierarchy, readable from a distance. Do NOT cram an entire lesson onto it.",
        "practice": "Practice resource prioritizing exercises: recognition, guided application, independent application, tricky cases, challenge.",
        "exit_ticket": "Exit ticket: short assessment focused on the learning objective, 3–5 questions, quick completion, clear answer format.",
        "learning_pack": "Learning pack combining: cheat sheet, examples, common mistakes, practice, challenge, answer key, teacher notes. Clearly separate Student Material from Teacher Material.",
    }
    structure = structure_by_mode.get(output_mode) or (
        "Select the most appropriate resource structure for the teacher's content and requested purpose "
        "among: cheat sheet, revision guide, worksheet, quiz, poster, practice, exit ticket, learning pack."
    )

    flags = []
    if p.get("include_common_mistakes", True):
        flags.append("include a 'common mistake' block showing a likely learner error")
    if p.get("include_exceptions", True):
        flags.append("include an 'exception' block only when educationally relevant")
    if p.get("include_practice", False):
        flags.append(
            "include practice. Practice must directly test the target concept, match the learner level, "
            "have a clear answer, avoid ambiguity, and progress by difficulty (recognition → guided "
            "application → independent → tricky cases → challenge, as appropriate)."
        )
    if p.get("include_answer_key", False):
        flags.append("include an 'answer_key' block with the correct answers")
    if p.get("include_teacher_notes", False):
        flags.append(
            "include 'teacher_note' blocks with teaching tips, common misconceptions, ask-the-class "
            "prompts, guided explanations, or extensions. These are TEACHER-facing and must never appear "
            "in the student-facing body text."
        )

    optional = []
    if p.get("learning_objective"):
        optional.append(f"Learning objective (align the entire resource to it): {p['learning_objective']}")
    if p.get("subject"):
        optional.append(f"Subject: {p['subject']}")
    if p.get("grade_level"):
        optional.append(f"Grade level: {p['grade_level']}")
    if p.get("lesson_duration"):
        optional.append(f"Lesson duration: {p['lesson_duration']}")
    if p.get("visual_density") in ("light", "balanced", "dense"):
        optional.append(f"Visual density: {p['visual_density']} (never sacrifice readability for density)")
    if p.get("number_of_pages") not in (None, "", "auto"):
        optional.append(f"Number of pages (1–6): {p['number_of_pages']} — split pages by concept, not arbitrary text length")
    if p.get("example_count") not in (None, "", "auto"):
        optional.append(f"Example count: {p['example_count']}")
    if p.get("practice_type") not in (None, "", "auto"):
        optional.append(f"Practice type preference: {p['practice_type']}")
    if p.get("practice_question_count") not in (None, "", "auto"):
        optional.append(f"Practice question count: {p['practice_question_count']}")
    if p.get("supporting_notes"):
        optional.append(
            "Supporting notes (treat as teacher-provided instructional material; preserve meaning, do "
            f"not silently contradict or replace):\n{p['supporting_notes']}"
        )

    # Pre-compute f-string parts that contain backslashes — Python <3.12 forbids
    # backslash escapes inside f-string expression parts, and ai-service runs 3.11.
    components_section = (
        "\n".join("- " + f for f in flags) if flags else "OPTIONAL COMPONENTS: none requested."
    )
    optional_section = "\n".join("- " + o for o in optional) if optional else ""

    return f"""You are LessonForge, an expert teacher-focused learning-resource generator.

TEACHER'S TOPIC TEXT (the source — preserve its definitions, rules, examples, formulas, terminology, numbers, warnings, and distinctions; never fabricate content):
<topic_text>
{p.get("topic_text", "")}
</topic_text>

REQUESTED VISUAL STYLE: {p.get("style", "")}

{lang_rules}

{content_rule}

LEARNER CONTEXT: level={learner_level}, difficulty={difficulty}. Adapt explanation complexity without changing the underlying concept. Do not invent a grade or subject unless clearly supported.

OUTPUT STRUCTURE: {structure}

{components_section}

{optional_section}

PEDAGOGICAL ORGANIZATION (when appropriate): What is it → Core rule → Example → Compare → Exception → Common mistake → Practice → Memory aid. Do not force every section.

FIDELITY RULES:
- Preserve the teacher's content and meaning exactly.
- Keep numbers, formulas, symbols, and terminology correct.
- Never fabricate information to make the resource look complete.
- Remove only obvious conversational framing that is not part of the lesson.

QUALITY BAR (self-check before answering): topic present; major source concepts present; definitions faithful; examples accurate; learner level appropriate; practice matches the lesson; questions have clear answers; no accidental language mixing; no gibberish; Arabic correct RTL (never mirrored).

RESPONSE FORMAT: Respond with VALID JSON ONLY (no markdown fences, no commentary), matching this schema exactly:
{{
  "title": "Resource title",
  "theme_notes": "optional short note on the visual treatment, or null",
  "sections": [
    {{
      "heading": "Section heading (e.g. 'What is it?', 'Core Rule', 'Examples', 'Practice')",
      "blocks": [
        {{
          "kind": "definition|rule|example|compare|exception|common_mistake|memory_aid|practice|answer_key|teacher_note|checklist",
          "text": "the block content",
          "items": ["optional bullet items"],
          "answer": "only for practice/answer_key blocks",
          "arabic": "Arabic support text only in bilingual/auto modes when useful, else null"
        }}
      ]
    }}
  ],
  "custom_css": null
}}

Notes:
- "example" blocks: show a clear demonstration (and for compare, correct vs incorrect or A vs B).
- "practice" blocks: give the exercise to the student; put the solution in "answer" ONLY when include_answer_key is true (guided exercises excepted).
- "teacher_note" blocks are for the teacher only.
- If the style is a custom teacher description (not one of the presets), you may set "custom_css" to a small block of CSS that realizes it; otherwise null.
"""


async def generate(payload: dict) -> dict:
    """Call the LLM, validate the structured JSON, render self-contained HTML."""
    prompt = build_prompt(payload)
    style = str(payload.get("style", "")).strip()

    content = await _call_llm(prompt)
    html = render_html(content, style)
    return {
        "status": "completed",
        "title": content.title,
        "output_mode": payload.get("output_mode", "auto"),
        "html": html,
    }


async def _call_llm(prompt: str) -> LessonForgeContent:
    """Dispatch to the configured provider. Gemini is the default when a
    GEMINI_API_KEY is present; OpenAI is the alternative."""
    provider = (settings.LLM_PROVIDER or "gemini").strip().lower()
    if provider == "gemini" and settings.GEMINI_API_KEY:
        return await _complete_gemini(prompt)
    if provider == "openai" and settings.OPENAI_API_KEY:
        return await _complete_openai(prompt)
    # Fall back to whichever key is actually configured.
    if settings.GEMINI_API_KEY:
        return await _complete_gemini(prompt)
    if settings.OPENAI_API_KEY:
        return await _complete_openai(prompt)
    raise RuntimeError("No LLM API key configured (set GEMINI_API_KEY or OPENAI_API_KEY on the ai-service)")


async def _complete_gemini(prompt: str) -> LessonForgeContent:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    async def call(sys_content, temp, max_tokens):
        resp = await client.aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=sys_content + "\n\n" + prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=temp,
                max_output_tokens=max_tokens,
            ),
        )
        return resp.text or "{}"

    raw = await call(
        (
            "You are LessonForge, an expert teacher-focused learning-resource generator. "
            "Respond with valid JSON only, matching the schema in the request."
        ),
        0.7,
        settings.GEMINI_MAX_OUTPUT_TOKENS,
    )
    data, retry = _parse_or_none(raw)
    if data is not None:
        return data

    # Retry once: tell the model the first attempt was unusable (truncated or
    # off-schema) and to be concise so the whole JSON fits comfortably.
    logger.warning("lessonforge: first Gemini response unusable — retrying once (concise)")
    raw = await call(
        "You are LessonForge. The previous response was truncated or did not match the schema. "
        "Return COMPLETE, VALID JSON only. Be CONCISE — short definitions, fewer bullets — so the "
        "entire resource fits well under the output limit. Exactly this schema: " + _SCHEMA,
        0.4,
        settings.GEMINI_MAX_OUTPUT_TOKENS,
    )
    data, retry = _parse_or_none(raw)
    if data is not None:
        return data
    raise RuntimeError(
        "Gemini returned unusable JSON on retry (truncated or schema mismatch). "
        "Try a shorter topic or fewer requested sections."
    )


async def _complete_openai(prompt: str) -> LessonForgeContent:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def call(sys_content, temp):
        resp = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "system", "content": sys_content}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=temp,
            max_tokens=settings.OPENAI_MAX_OUTPUT_TOKENS,
        )
        return resp.choices[0].message.content or "{}"

    raw = await call(
        (
            "You are LessonForge, an expert teacher-focused learning-resource generator. "
            "You always respond with valid JSON only, matching the schema in the user message."
        ),
        0.7,
    )
    data, _ = _parse_or_none(raw)
    if data is not None:
        return data
    logger.warning("lessonforge: first OpenAI response unusable — retrying once (concise)")
    raw = await call(
        "You are LessonForge. The previous response was truncated or did not match the schema. "
        "Return COMPLETE, VALID JSON only. Be CONCISE — short definitions, fewer bullets — so the "
        "entire resource fits well under the output limit. Exactly this schema: " + _SCHEMA,
        0.4,
    )
    data, _ = _parse_or_none(raw)
    if data is not None:
        return data
    raise RuntimeError(
        "OpenAI returned unusable JSON on retry (truncated or schema mismatch). "
        "Try a shorter topic or fewer requested sections."
    )


def _parse_or_none(raw: str):
    """Return (content, should_retry) — validated content, or (None, True) to retry once.

    Both malformed JSON (e.g. a truncated response) and schema mismatches are
    retryable; only retrying on schema errors left truncation fatal.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None, True
    try:
        return LessonForgeContent.model_validate(data), False
    except Exception:
        return None, True


_SCHEMA = (
    '{"title": string, "theme_notes": string|null, "sections": [{"heading": string, '
    '"blocks": [{"kind": "definition|rule|example|compare|exception|common_mistake|'
    'memory_aid|practice|answer_key|teacher_note|checklist", "text": string, "items": '
    'string[]|null, "answer": string|null, "arabic": string|null}]}], '
    '"custom_css": string|null}'
)


def render_html(content: LessonForgeContent, style: str) -> str:
    """Render the validated content into a self-contained HTML document."""
    theme = THEME_NAMES.get(style.lower(), THEME_NAMES["classroom-friendly"])
    theme_style = STYLE_HINTS.get(style.lower())
    from jinja2 import Environment, PackageLoader, select_autoescape

    env = Environment(
        loader=PackageLoader("app", "templates"),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("lessonforge.html")
    return template.render(
        content=content,
        theme=theme,
        style_hint=theme_style,
        custom_css=content.custom_css if style.lower() not in THEME_NAMES else None,
    )
