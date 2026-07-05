from typing import Optional
from datetime import date
import uuid
from pydantic import BaseModel, EmailStr, Field, field_validator

# --- Role Schemas ---

class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True

class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

# --- Permission Schemas ---

class PermissionResponse(BaseModel):
    id: uuid.UUID
    codename: str
    label: str
    group: str

    class Config:
        from_attributes = True

class RolePermissionsResponse(BaseModel):
    role_id: uuid.UUID
    permission_codenames: list[str]

class RolePermissionsUpdate(BaseModel):
    permission_codenames: list[str]

# --- Auth Schemas ---

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# --- Employee Schemas ---

class EmployeeResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    employee_type: str
    phone_number: Optional[str] = None
    salary: Optional[float] = None
    hire_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    address: Optional[str] = None
    is_active: bool
    has_user_account: bool = False

    class Config:
        from_attributes = True

class EmployeeCreate(BaseModel):
    full_name: str
    employee_type: str = Field(..., description="Must be a valid EmployeeType value")
    phone_number: Optional[str] = None
    salary: Optional[float] = None
    hire_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    address: Optional[str] = None

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    employee_type: Optional[str] = None
    phone_number: Optional[str] = None
    salary: Optional[float] = None
    hire_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None

class EmployeeDetailResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    employee_type: str
    phone_number: Optional[str] = None
    salary: Optional[float] = None
    hire_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    address: Optional[str] = None
    is_active: bool
    linked_user: Optional["LinkedUserInfo"] = None

    class Config:
        from_attributes = True

class LinkedUserInfo(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role_name: str
    is_active: bool
    is_superadmin: bool

def _validate_password_strength(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if not any(c.islower() for c in v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit")
    if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
        raise ValueError("Password must contain at least one special character")
    return v

class GrantAccessRequest(BaseModel):
    email: EmailStr
    password: str
    role_id: uuid.UUID

# --- User Schemas ---

class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: Optional[str] = None
    locale_pref: str
    is_active: bool
    is_superadmin: bool
    role: RoleResponse
    employee_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters with uppercase, lowercase, and digit")
    role_id: uuid.UUID
    locale_pref: Optional[str] = "ar"
    employee_id: Optional[uuid.UUID] = None

    _validate_password = field_validator("password")(_validate_password_strength)

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    role_id: Optional[uuid.UUID] = None
    locale_pref: Optional[str] = None
    is_active: Optional[bool] = None
    employee_id: Optional[uuid.UUID] = None

    _validate_password = field_validator("password")(_validate_password_strength)

# --- Teacher/Detail Schemas (unchanged) ---

class SectionInfo(BaseModel):
    id: uuid.UUID
    course_name: str
    enrolled_count: int
    capacity: int
    status: str

    class Config:
        from_attributes = True

class RecentActivity(BaseModel):
    action: str
    detail: str
    timestamp: str

class TeacherResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    employee_type: str
    is_active: bool
    sections_count: int = 0
    wallet_balance: float = 0.0
    wallet_last_updated: Optional[str] = None

    class Config:
        from_attributes = True

class TeacherDetailResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: Optional[EmailStr] = None
    is_active: bool
    wallet_balance: float
    sections: list[SectionInfo]
    recent_activity: list[RecentActivity]

    class Config:
        from_attributes = True
