from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class InstituteProfile(BaseModel):
    name: str = Field(default="Al-Drasat ERP", max_length=200)
    address: Optional[str] = None
    phone: Optional[str] = None
    logo_path: str = "/logo.jpeg"


class Defaults(BaseModel):
    timezone: str = "Asia/Riyadh"
    default_teacher_percentage: Optional[float] = Field(default=None, ge=0, le=100)
    backup_retention_days: Optional[int] = Field(default=None, ge=1, le=365)


class SystemSettingsResponse(BaseModel):
    institute_profile: InstituteProfile
    defaults: Defaults


class SystemSettingsUpdate(BaseModel):
    institute_profile: Optional[InstituteProfile] = None
    defaults: Optional[Defaults] = None
