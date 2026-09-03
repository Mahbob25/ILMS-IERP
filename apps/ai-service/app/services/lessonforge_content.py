from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class LessonForgeBlock(BaseModel):
    """One pedagogical block within a section (spec §15 structure)."""

    kind: Literal[
        "definition", "rule", "example", "compare", "exception", "common_mistake",
        "memory_aid", "practice", "answer_key", "teacher_note", "checklist",
    ]
    text: str = Field(..., min_length=1)
    items: List[str] = Field(default_factory=list)
    answer: Optional[str] = None
    arabic: Optional[str] = None  # Arabic support/explanation ("Arabic explains; English teaches")

    @field_validator("items", mode="before")
    @classmethod
    def items_null_to_empty(cls, v):
        # LLMs frequently emit null for unused fields — treat as "no bullets".
        return v if v is not None else []

    @field_validator("text", mode="before")
    @classmethod
    def text_null_to_blank(cls, v):
        # LLMs occasionally emit null for a block's text — a single null must
        # not sink the whole resource. A blank block is less harmful than a
        # failed generation.
        if not isinstance(v, str) or not v.strip():
            return " "
        return v


class LessonForgeSection(BaseModel):
    heading: str = Field(..., min_length=1)
    blocks: List[LessonForgeBlock] = Field(..., min_length=1)


class LessonForgeContent(BaseModel):
    title: str = Field(..., min_length=1)
    theme_notes: Optional[str] = None
    sections: List[LessonForgeSection] = Field(..., min_length=1)
    custom_css: Optional[str] = None  # only used when style is a custom teacher description
