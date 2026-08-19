import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=7, max_length=30)
    message: Optional[str] = Field(default=None, max_length=2000)
    locale: str = Field(default="ar", pattern="^(ar|en)$")


class ContactCreateResponse(BaseModel):
    id: uuid.UUID
    status: str


class ContactAdminResponse(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    message: Optional[str]
    locale: str
    status: str
    created_at: datetime
    contacted_at: Optional[datetime] = None
    contacted_by: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ContactStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|contacted|archived)$")
    notes: Optional[str] = None
