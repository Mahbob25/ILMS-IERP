"""LessonForge generator — turns the teacher's spec contract into self-contained,
classroom-ready HTML via an LLM + a Jinja2 template.

Runs inside the ai-worker process (apps/ai-service). The main output is a text
LLM rendered to ``html``; when image generation is configured (Phase 2), a
small number of parallel image calls enrich matching blocks with base64 data-URI
stickers that render inside die-cut medallions. Every image failure degrades
gracefully to the emoji/sticker fallback — a resource never fails on images.
"""
import asyncio
import json
import logging

from app.services.lessonforge_content import LessonForgeContent
from app.services.llm_gateway import GatewayError, chat_json, generate_image, load_config

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
        "arabic": (
            "LANGUAGE MODE: Arabic-first lesson. Write the entire resource content — title, section "
            "headings, definitions, rules, examples, practice questions, and answers — in clear Modern "
            "Standard Arabic, right-to-left. Keep only target-language vocabulary (e.g. English terms "
            "being taught) inside the Arabic text where a teacher would, but all explanations and "
            "instructions are Arabic. The resource will be laid out RTL. Do not include English "
            "instructional prose."
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
        "cheat_sheet": "Cheat sheet: large topic title, concise definition, major rules, examples, comparisons, exceptions, common mistakes, memory aids, quick-review checklist. Prioritize scannability and visual hierarchy.",
        "revision_guide": "Revision guide prioritizing key concepts, rules, examples, common mistakes, exam traps, quick review, optional practice.",
        "worksheet": "Worksheet: concise explanation, worked examples, guided practice, independent exercises of increasing difficulty, optional answer key.",
        "quiz": "Quiz: clear instructions, questions aligned with the objective, appropriate difficulty, varied question types, unambiguous answers, optional answer key. Do not test unrelated knowledge.",
        "poster": "Classroom poster: large title, core rules, memorable examples, minimal text, strong visual hierarchy, readable from a distance. Do NOT cram an entire lesson onto it.",
        "practice": "Practice resource prioritizing exercises: recognition, guided application, independent application, tricky cases, challenge.",
        "exit_ticket": "Exit ticket: short assessment focused on the learning objective, 3–5 questions, quick completion, clear answer format.",
        "learning_pack": "Learning pack combining: cheat sheet, examples, common mistakes, practice, challenge, answer key, teacher notes. Clearly separate Student Material from Teacher Material.",
        "flashcards": "Flashcards: concise, one-concept-per-card drill deck. Each card is a 'practice' block: the question or term goes in 'text', the answer/definition goes in 'answer', and any short example or hint goes as a single bullet in 'items'. Cover the whole topic with a focused set of cards (aim for 8–16 cards).",
    }
    structure = structure_by_mode.get(output_mode) or (
        "Select the most appropriate resource structure for the teacher's content and requested purpose "
        "among: cheat sheet, revision guide, worksheet, quiz, poster, practice, exit ticket, learning pack, flashcards."
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

VISUAL-STRUCTURE CONVENTIONS (the generator renders these as poster cards):
- Prefer short, punchy block text over long paragraphs. Put extra detail in "items" bullets.
- For "compare" blocks, express each row as two sides separated by " | " (e.g. "Singular | Plural", "Active | Passive") — one item per row. The template renders these as side-by-side grid cells.
- "definition", "rule", "memory_aid", and "practice" text may begin with ONE matching emoji (💡 📖 🧠 ⭐ 🎯 ✏️ 📏 📌 ⚖️ ⚠️ ❌ 🚫 🔑) as a visual icon marker; never put more than one leading emoji, and keep the rest of the text clean.
- Section headings should be short labels the teacher recognizes: "What is it?", "The Rule", "Examples", "Compare", "Watch Out", "Common Mistakes", "Memory Tricks", "Practice", "Answer Key".
- Optional "sticker" key on any card that would benefit from a recognizable character or object. Choose ONLY from this fixed enum of keys: "lightbulb", "star", "pencil", "clipboard", "warning", "cross", "check", "brain", "rocket", "magnifying_glass", "clock", "book", "speech_bubble", "trophy", "kids_group", "kids_pair", "question_blob". When the card already leads with a descriptive emoji, prefer that over a sticker; add a sticker only when a die-cut character/object clearly aids comprehension. Most cards should have no sticker. Use "warning" only for exception/common_mistake cards, "cross" only for common_mistake, "check" only for example/answer_key.
- Optional "image_hint" on the content root or a card ONLY when a bespoke illustration meaningfully aids the concept and none of the sticker-bank keys fits (e.g. a "cute dinosaur time machine" for a creative writing prompt). Use at most 1–2 image_hints in the entire resource — prefer sticker keys everywhere else. An image_hint must be TEXTLESS (no letters or numbers), flat vector, bold outline, vibrant, isolated on a plain background, sticker style. Keep it a short phrase (3–8 words).

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
  "hero_image_hint": "optional textless hero illustration, or null",
  "sections": [
    {{
      "heading": "Section heading (e.g. 'What is it?', 'Core Rule', 'Examples', 'Practice')",
      "blocks": [
        {{
          "kind": "definition|rule|example|compare|exception|common_mistake|memory_aid|practice|answer_key|teacher_note|checklist",
          "text": "the block content",
          "items": ["optional bullet items"],
          "answer": "only for practice/answer_key blocks",
          "arabic": "Arabic support text only in bilingual/auto modes when useful, else null",
          "sticker": "optional sticker-bank key from the fixed enum, else null",
          "image_hint": "optional textless bespoke-sticker description, else null"
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
- "sticker" must be one of: lightbulb, star, pencil, clipboard, warning, cross, check, brain, rocket, magnifying_glass, clock, book, speech_bubble, trophy, kids_group, kids_pair, question_blob — or null. Leave it null unless a die-cut sticker clearly aids the card.
- "image_hint" must be a SHORT textless description (3–8 words). Use at most 1–2 per resource; otherwise null.
"""


async def generate(payload: dict) -> dict:
    """Call the LLM, validate the structured JSON, render self-contained HTML."""
    prompt = build_prompt(payload)
    style = str(payload.get("style", "")).strip()

    content = await _call_llm(prompt)
    await _enrich_with_images(content)
    html = render_html(content, style, payload)
    return {
        "status": "completed",
        "title": content.title,
        "output_mode": payload.get("output_mode", "auto"),
        "html": html,
    }


# ── Image enrichment (Phase 2, layer 2) ─────────────────────────────
# Cost/latency bound: at most ONE hero + TWO card images per resource.
# A single generated PNG (base64) adds tens of KB; 3 is a safe ceiling for
# the single-file HTML budget while still making the key cards pop.
MAX_HERO_IMAGES = 1
MAX_CARD_IMAGES = 2
IMAGE_TIMEOUT_SECONDS = 8.0  # locked down: a stalled provider must not hang a job


async def _enrich_with_images(content: LessonForgeContent) -> None:
    """Generate AI stickers for image hints and attach base64 data URIs.

    Pure best-effort: any failure (no config, provider error, timeout,
    content-safety block, oversized payload) leaves that slot null and logs —
    the template then falls back to the SVG sticker bank or the emoji badge.
    This function NEVER raises and never fails the job.
    """
    try:
        cfg = await load_config()
        image_provider = (cfg.get("image_provider") or "").strip().lower()
        image_model = (cfg.get("image_model") or "").strip()
    except (GatewayError, Exception) as e:
        logger.warning("lessonforge: image enrichment skipped (no config or error): %s", e)
        return

    if not image_provider or not image_model:
        logger.info("lessonforge: image generation disabled (no image_provider/model)")
        return

    api_key = cfg.get("api_key") or ""
    model_id = f"{image_provider}/{image_model}"

    # 1) Pick hero hint (highest priority) first.
    tasks: list = []
    if content.hero_image_hint:
        tasks.append(("hero", None, content.hero_image_hint))

    # 2) Pick card hints by priority, capped at MAX_CARD_IMAGES.
    collected: list = []
    for section in content.sections:
        for block in section.blocks:
            hint = (block.image_hint or "").strip()
            if hint:
                collected.append((id(block), block, hint))
    for block_id, block, hint in collected[:MAX_CARD_IMAGES]:
        tasks.append(("card", block_id, hint))

    if not tasks:
        return

    # 3) Fire every hint in parallel; each gets its own strict timeout.
    results = await asyncio.gather(
        *[asyncio.wait_for(_safe_generate(p, model_id, api_key), IMAGE_TIMEOUT_SECONDS) for _, _, p in tasks],
        return_exceptions=True,
    )

    # 4) Attach successful data URIs to their matching slot.
    for (kind, block_id, _), outcome in zip(tasks, results):
        if isinstance(outcome, Exception):
            logger.warning(
                "lessonforge: image for %s hint failed (%s) — falling back",
                kind,
                type(outcome).__name__,
            )
            continue
        data_uri = _png_data_uri(outcome)
        if data_uri is None:
            continue  # size guard rejected it; slot stays null
        if kind == "hero":
            content.hero_image_data = data_uri
            logger.info("lessonforge: attached hero image (%d bytes)", len(outcome))
        else:
            for section in content.sections:
                for block in section.blocks:
                    if id(block) == block_id:
                        block.image_data = data_uri
                        logger.info("lessonforge: attached card image (%d bytes)", len(outcome))
                        break


async def _safe_generate(prompt: str, model_id: str, api_key: str) -> bytes:
    """Wrap generate_image with its own per-call timeout (in addition to the
    gather-level timeout) so a hung provider task is always reaped quickly."""
    try:
        return await asyncio.wait_for(
            generate_image(prompt, model=model_id, api_key=api_key),
            timeout=IMAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as e:
        raise GatewayError("image generation timed out") from e


def _png_data_uri(raw: bytes) -> str | None:
    """Wrap PNG bytes as an embeddable data URI, guarding total payload size.

    Rejects anything larger than ~1 MB decoded — a real PNG at 256–512px is
    far smaller, so this only trips on misconfigured/oversized output that
    would balloon the single-file HTML well past budget.
    """
    if not isinstance(raw, bytes) or not raw:
        return None
    if len(raw) > 1_048_576:
        logger.warning("lessonforge: generated image too large (%d bytes) — skipping", len(raw))
        return None
    import base64

    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/png;base64,{encoded}"


async def _call_llm(prompt: str) -> LessonForgeContent:
    """Route the prompt through the LiteLLM gateway.

    The runtime provider/model/api_key come from the ERP ai_config (Redis or
    the internal fallback); the model is sent provider-prefixed
    (``{provider}/{model}``) so one wildcard proxy deployment serves any
    provider. On an unusable first response, retry once with a concise
    instruction (same truncation-fix behavior as before).
    """
    cfg = await load_config()
    model_id = f"{cfg['provider']}/{cfg['model']}"
    api_key = cfg.get("api_key") or ""

    async def call(sys_content, temp, max_tokens):
        raw = await chat_json(
            prompt,
            model=model_id,
            api_key=api_key,
            max_output_tokens=max_tokens,
            temperature=temp,
            schema_hint=_SCHEMA,
            system=sys_content,
        )
        return raw

    raw = await call(
        (
            "You are LessonForge, an expert teacher-focused learning-resource generator. "
            "Respond with valid JSON only, matching the schema in the request."
        ),
        cfg.get("temperature", 0.7),
        cfg.get("max_output_tokens", 32000),
    )
    data, retry = _parse_or_none(raw)
    if data is not None:
        return data

    # Retry once: tell the model the first attempt was unusable (truncated or
    # off-schema) and to be concise so the whole JSON fits comfortably.
    logger.warning("lessonforge: first response unusable — retrying once (concise)")
    raw = await call(
        "You are LessonForge. The previous response was truncated or did not match the schema. "
        "Return COMPLETE, VALID JSON only. Be CONCISE — short definitions, fewer bullets — so the "
        "entire resource fits well under the output limit. Exactly this schema: " + _SCHEMA,
        0.4,
        cfg.get("max_output_tokens", 32000),
    )
    data, retry = _parse_or_none(raw)
    if data is not None:
        return data
    raise RuntimeError(
        "LLM returned unusable JSON on retry (truncated or schema mismatch). "
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
    '{"title": string, "theme_notes": string|null, "hero_image_hint": string|null, '
    '"sections": [{"heading": string, '
    '"blocks": [{"kind": "definition|rule|example|compare|exception|common_mistake|'
    'memory_aid|practice|answer_key|teacher_note|checklist", "text": string, "items": '
    'string[]|null, "answer": string|null, "arabic": string|null, "sticker": string|null, '
    '"image_hint": string|null}]}], '
    '"custom_css": string|null}'
)


def render_html(
    content: LessonForgeContent,
    style: str,
    payload: dict | None = None,
) -> str:
    """Render the validated content into a self-contained HTML document."""
    theme = THEME_NAMES.get(style.lower(), THEME_NAMES["classroom-friendly"])
    theme_style = STYLE_HINTS.get(style.lower())
    payload = payload or {}

    lang_mode = str(payload.get("explanation_language") or "auto").strip().lower()
    if lang_mode not in ("english", "bilingual", "arabic", "auto"):
        lang_mode = "auto"
    output_mode = str(payload.get("output_mode") or "auto").strip().lower()

    # Resource-type body layout: auto maps to a tidy single-column article,
    # cheat-sheet-family modes get the masonry grid, others get focused rows.
    layout = {
        "cheat_sheet": "masonry",
        "revision_guide": "masonry",
        "learning_pack": "masonry",
        "worksheet": "worksheet",
        "quiz": "quiz",
        "flashcards": "flashcards",
        "poster": "masonry",
        "exit_ticket": "single",
        "practice": "single",
    }.get(output_mode, "single")

    # Mode label chip shown in the hero ribbon.
    mode_label = {
        "cheat_sheet": "Cheat Sheet",
        "revision_guide": "Revision Guide",
        "worksheet": "Worksheet",
        "quiz": "Quiz",
        "poster": "Poster",
        "practice": "Practice",
        "exit_ticket": "Exit Ticket",
        "learning_pack": "Learning Pack",
        "flashcards": "Flashcards",
        "auto": "Lesson Resource",
    }.get(output_mode, "Lesson Resource")

    # Learner-level chip shown under the title.
    level_label = {
        "beginner": "Beginner",
        "elementary": "Elementary",
        "middle_school": "Middle School",
        "high_school": "High School",
        "university": "University",
        "adult": "Adult",
        "auto": "",
    }.get(str(payload.get("learner_level") or "").strip().lower(), "")

    # Localized mode + level chips for Arabic-first resources.
    ar_mode = {
        "cheat_sheet": "ملخص سريع",
        "revision_guide": "دليل مراجعة",
        "worksheet": "ورقة عمل",
        "quiz": "اختبار",
        "poster": "ملصق",
        "practice": "تمارين",
        "exit_ticket": "بطاقة خروج",
        "learning_pack": "حزمة تعلم",
        "flashcards": "بطاقات تعليمية",
        "auto": "مورد تعليمي",
    }.get(output_mode, "مورد تعليمي")
    ar_level = {
        "beginner": "مبتدئ",
        "elementary": "ابتدائي",
        "middle_school": "متوسط",
        "high_school": "ثانوي",
        "university": "جامعي",
        "adult": "بالغ",
    }.get(str(payload.get("learner_level") or "").strip().lower(), "")

    if lang_mode == "arabic":
        hero_kicker = "مورد تعليمي"
        hero_chips = [c for c in (ar_mode, ar_level) if c]
    else:
        hero_kicker = "LessonForge"
        hero_chips = [c for c in (mode_label, level_label) if c]

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
        lang_mode=lang_mode,
        layout=layout,
        hero_kicker=hero_kicker,
        hero_chips=hero_chips,
    )
