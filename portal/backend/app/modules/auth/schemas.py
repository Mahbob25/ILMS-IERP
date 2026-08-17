import uuid
from typing import Optional

from pydantic import BaseModel, Field


class EmailLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class SSOLoginRequest(BaseModel):
    ticket: str = Field(..., min_length=10, max_length=512)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


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
