import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OTPRequest(BaseModel):
    phone: str = Field(..., min_length=8, max_length=32, description="E.164 phone number")


class OTPVerifyRequest(BaseModel):
    phone: str = Field(..., min_length=8, max_length=32)
    code: str = Field(..., min_length=4, max_length=8)


class PortalUserResponse(BaseModel):
    id: uuid.UUID
    phone: Optional[str] = None
    email: Optional[str] = None
    full_name: str
    locale_pref: str = "ar"
    is_active: bool = True


class ProfileUpdateRequest(BaseModel):
    phone: Optional[str] = Field(None, min_length=8, max_length=32)
    locale_pref: Optional[str] = Field(None, pattern="^(ar|en)$")
