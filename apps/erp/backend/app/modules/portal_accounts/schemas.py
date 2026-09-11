"""Pydantic schemas for portal account provisioning (ERP side)."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.identity.schemas import _validate_password_strength

PHONE_RE = r"^\+?[0-9]{8,15}$"


class ParentAccountData(BaseModel):
    full_name: str
    phone: str = Field(..., pattern=PHONE_RE, min_length=8, max_length=32)
    email: str
    relationship: Optional[str] = None


class PortalAccountCreateResult(BaseModel):
    student_user_id: str
    parent_user_id: Optional[str] = None
    student_email: str
    student_phone: str
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None


# --- Admin management (ERP dashboard) ---

class PortalAccountListItem(BaseModel):
    id: uuid.UUID
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    locale_pref: str = "ar"
    is_active: bool
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None
    created_at: Optional[datetime] = None
    account_type: str
    student_id: Optional[uuid.UUID] = None
    student_code: Optional[str] = None
    student_name: Optional[str] = None
    linked_students_count: int = 0


class LinkedStudentBrief(BaseModel):
    student_id: uuid.UUID
    student_code: Optional[str] = None
    full_name: str
    relationship: Optional[str] = None
    verified_at: Optional[datetime] = None


class PortalAccountDetail(PortalAccountListItem):
    linked_students: list[LinkedStudentBrief] = Field(default_factory=list)


class PortalAccountListResponse(BaseModel):
    items: list[PortalAccountListItem]
    total: int


class PortalAccountStateResponse(BaseModel):
    id: uuid.UUID
    is_active: bool
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None


class ResetPasswordRequest(BaseModel):
    mode: str = Field("phone", pattern="^(phone|custom)$")
    new_password: Optional[str] = Field(None, min_length=8)

    _validate_password = field_validator("new_password")(_validate_password_strength)


class ResetPasswordResponse(BaseModel):
    id: uuid.UUID
    email: Optional[str] = None
    phone: Optional[str] = None
    new_password: str


class ParentLinkRequest(BaseModel):
    student_id: uuid.UUID
    relationship: Optional[str] = None


class ImpersonateResponse(BaseModel):
    url: str
