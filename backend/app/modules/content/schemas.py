from datetime import datetime
from typing import Optional, Dict, Any
import uuid
from pydantic import BaseModel, Field


class LandingContentResponse(BaseModel):
    key: str
    value: Dict[str, Any]
    updated_at: Optional[datetime] = None


class LandingContentUpdate(BaseModel):
    value: Dict[str, Any]


class AnnouncementCreate(BaseModel):
    text_ar: str = Field(..., min_length=1)
    text_en: str = Field(..., min_length=1)
    is_active: bool = True
    sort_order: int = 0


class AnnouncementUpdate(BaseModel):
    text_ar: Optional[str] = Field(default=None, min_length=1)
    text_en: Optional[str] = Field(default=None, min_length=1)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    text_ar: str
    text_en: str
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: Optional[datetime] = None
