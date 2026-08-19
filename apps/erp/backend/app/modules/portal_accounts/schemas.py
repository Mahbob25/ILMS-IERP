"""Pydantic schemas for portal account provisioning (ERP side)."""

from typing import Optional
from pydantic import BaseModel, Field

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
