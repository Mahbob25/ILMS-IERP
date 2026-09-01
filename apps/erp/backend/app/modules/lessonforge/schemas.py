import uuid
from datetime import datetime
from typing import Optional, Union
from pydantic import BaseModel, Field, field_validator

# ── Spec §8 / §34 — output modes ──────────────────────────────────────────────
OUTPUT_MODES = ("cheat_sheet", "revision_guide", "worksheet", "quiz", "poster", "practice", "exit_ticket", "learning_pack", "auto")
LEARNER_LEVELS = ("beginner", "elementary", "middle_school", "high_school", "university", "adult", "auto")
DIFFICULTIES = ("easy", "medium", "hard", "advanced", "auto")
LANGUAGES = ("english", "bilingual", "auto")
CONTENT_MODES = ("strict_source", "source_plus_examples", "teacher_creative")
DENSITIES = ("light", "balanced", "dense", "auto")
PRACTICE_TYPES = ("multiple_choice", "fill_in_the_blank", "correct_the_sentence", "matching", "true_false", "short_answer", "mixed", "auto")

# Named visual styles (spec §1). Free-text custom styles are also allowed.
STYLE_PRESETS = (
    "colorful", "minimalist", "playful", "academic", "professional",
    "dark", "pastel", "modern", "classroom-friendly", "custom",
)


class LessonForgeCreate(BaseModel):
    # ── Mandatory (spec §1, §12) ──────────────────────────────────────────
    topic_text: str = Field(..., min_length=1, max_length=60000)
    style: str = Field(..., min_length=1, max_length=200)

    # ── Language (spec §2) ────────────────────────────────────────────────
    explanation_language: str = Field(default="auto", pattern="^(english|bilingual|auto)$")

    # ── Learner context (spec §4) ─────────────────────────────────────────
    learner_level: str = Field(default="auto", pattern="^(beginner|elementary|middle_school|high_school|university|adult|auto)$")
    subject: Optional[str] = Field(default=None, max_length=120)
    grade_level: Optional[str] = Field(default=None, max_length=120)

    # ── Objective / difficulty / duration (spec §5–§7) ────────────────────
    learning_objective: Optional[str] = Field(default=None, max_length=1000)
    difficulty: str = Field(default="auto", pattern="^(easy|medium|hard|advanced|auto)$")
    lesson_duration: Optional[str] = Field(default=None, max_length=50)

    # ── Output (spec §8) ──────────────────────────────────────────────────
    output_mode: str = Field(default="auto", pattern="^(cheat_sheet|revision_guide|worksheet|quiz|poster|practice|exit_ticket|learning_pack|auto)$")

    # ── Customization (spec §10) ──────────────────────────────────────────
    number_of_pages: Union[int, str] = Field(default="auto")
    visual_density: str = Field(default="auto", pattern="^(light|balanced|dense|auto)$")
    example_count: Union[int, str] = Field(default="auto")
    include_exceptions: bool = True
    include_common_mistakes: bool = True
    include_practice: bool = False
    practice_type: str = Field(default="auto", pattern="^(multiple_choice|fill_in_the_blank|correct_the_sentence|matching|true_false|short_answer|mixed|auto)$")
    practice_question_count: Union[int, str] = Field(default="auto")
    include_answer_key: bool = False
    include_teacher_notes: bool = False

    # ── Content mode (spec §11) ───────────────────────────────────────────
    content_mode: str = Field(default="strict_source", pattern="^(strict_source|source_plus_examples|teacher_creative)$")

    # ── Supporting notes (spec §3) ────────────────────────────────────────
    supporting_notes: Optional[str] = Field(default=None, max_length=20000)

    @field_validator("topic_text", "style", "supporting_notes", "subject", "grade_level",
                     "learning_objective", "lesson_duration")
    @classmethod
    def strip_whitespace(cls, v):
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None

    @field_validator("style")
    @classmethod
    def normalize_style(cls, v: str) -> str:
        """Custom styles come through as free text; strip and lowercase presets."""
        v = v.strip()
        return v.lower() if v in STYLE_PRESETS else v


class LessonForgeResourceResponse(BaseModel):
    id: uuid.UUID
    title: Optional[str] = None
    output_mode: str
    status: str
    format: str
    created_at: datetime

    class Config:
        from_attributes = True


class LessonForgeJobStatus(BaseModel):
    job_id: str
    status: str
    resource_id: Optional[uuid.UUID] = None
    error: Optional[str] = None
