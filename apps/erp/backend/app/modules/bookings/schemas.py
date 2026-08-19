import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


PROGRAMS = {"languages", "computing", "ai", "diplomas", ""}


class BookingCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=7, max_length=30)
    program: Optional[str] = Field(default=None, max_length=50)
    message: Optional[str] = Field(default=None, max_length=2000)
    locale: str = Field(default="ar", pattern="^(ar|en)$")


class BookingResponse(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    program: Optional[str]
    message: Optional[str]
    locale: str
    status: str
    created_at: datetime


class BookingAdminResponse(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    program: Optional[str]
    message: Optional[str]
    locale: str
    status: str
    created_at: datetime
    contacted_at: Optional[datetime]
    contacted_by: Optional[uuid.UUID]
    notes: Optional[str]


class BookingStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|contacted|cancelled)$")
    notes: Optional[str] = None


class BookingCreateResponse(BaseModel):
    id: uuid.UUID
    status: str
