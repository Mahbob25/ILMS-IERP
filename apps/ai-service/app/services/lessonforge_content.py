from typing import List, Literal, Optional

from pydantic import BaseModel, Field


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


class LessonForgeSection(BaseModel):
    heading: str = Field(..., min_length=1)
    blocks: List[LessonForgeBlock] = Field(..., min_length=1)


class LessonForgeContent(BaseModel):
    title: str = Field(..., min_length=1)
    theme_notes: Optional[str] = None
    sections: List[LessonForgeSection] = Field(..., min_length=1)
    custom_css: Optional[str] = None  # only used when style is a custom teacher description
