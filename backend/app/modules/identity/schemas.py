from typing import Optional
import uuid
from pydantic import BaseModel, EmailStr, Field

class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    locale_pref: str
    is_active: bool
    is_superadmin: bool
    role: RoleResponse

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str
    role_id: uuid.UUID
    locale_pref: Optional[str] = "ar"

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6)
    full_name: Optional[str] = None
    role_id: Optional[uuid.UUID] = None
    locale_pref: Optional[str] = None
    is_active: Optional[bool] = None
