"""Pydantic contracts for Promo Studio.

Reading-time enforcement (plan §3.2): fixed template timing + variable-length
text = overflow risk. Max lengths below are derived from the rendering floor
(short label 0.8s settled; sentence 0.3s/word). Over-limit input is rejected
with a field error — never auto-shrunk.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

PromoType = Literal["course"]
PromoLocale = Literal["ar", "en"]
PromoTone = Literal["cinematic", "clean"]
PromoQuality = Literal["draft", "high"]
PromoProjectStatus = Literal["draft", "queued", "rendering", "done", "failed"]
PromoRenderStatus = Literal["queued", "rendering", "done", "failed"]

MAX_HERO_L1 = 24
MAX_HERO_L2 = 32
MAX_HERO_L3 = 28
MAX_CTA = 26
MAX_ROW_TITLE = 34
MAX_CARD_NAME = 20
MAX_CARD_DESC = 60
MAX_ROWS = 3
MAX_CARDS = 4
MAX_STATS = 3


class ScheduleRow(BaseModel):
    time: str = Field(..., min_length=1, max_length=8)
    title: str = Field(..., min_length=1, max_length=MAX_ROW_TITLE)
    meta: str = Field(default="", max_length=60)


class ProgramCard(BaseModel):
    tag: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=MAX_CARD_NAME)
    badge: str = Field(default="", max_length=20)
    desc: str = Field(default="", max_length=MAX_CARD_DESC)
    seats: str = Field(default="", max_length=20)


class StatItem(BaseModel):
    value: str = Field(..., min_length=1, max_length=12)
    label: str = Field(..., min_length=1, max_length=20)


class PromoPayload(BaseModel):
    heroL1: str = Field(..., min_length=1, max_length=MAX_HERO_L1)
    heroL2: str = Field(..., min_length=1, max_length=MAX_HERO_L2)
    heroL3: str = Field(..., min_length=1, max_length=MAX_HERO_L3)
    cta: str = Field(..., min_length=1, max_length=MAX_CTA)
    kicker: str = Field(default="", max_length=60)
    micro: str = Field(default="", max_length=80)
    rows: List[ScheduleRow] = Field(default_factory=list, max_length=MAX_ROWS)
    cards: List[ProgramCard] = Field(default_factory=list, max_length=MAX_CARDS)
    stats: List[StatItem] = Field(default_factory=list, max_length=MAX_STATS)
    program_slug: Optional[str] = Field(default=None, max_length=120)
    custom_course: bool = False

    @field_validator("heroL1", "heroL2", "heroL3", "cta", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class ProjectCreate(BaseModel):
    type: PromoType = "course"
    locale: PromoLocale = "ar"
    tone: PromoTone = "cinematic"
    payload: PromoPayload


class ProjectUpdate(BaseModel):
    locale: Optional[PromoLocale] = None
    tone: Optional[PromoTone] = None
    payload: Optional[PromoPayload] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    type: str
    locale: str
    tone: str
    payload: Dict[str, Any]
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RenderRequestResponse(BaseModel):
    render_id: uuid.UUID
    status: str


class RenderResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    quality: str
    template_version: str
    brand_kit_version: int
    mp4_url: Optional[str] = None
    poster_url: Optional[str] = None
    share_copy: Optional[str] = None
    duration_s: Optional[float] = None
    render_ms: Optional[int] = None
    status: str
    error: Optional[str] = None
    progress: Optional[int] = None
    created_at: Optional[datetime] = None


class QuotaResponse(BaseModel):
    used: int
    limit: int
    reset_at: str
