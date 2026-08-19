from typing import Optional, List
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.db.session import get_db
from app.modules.identity.models import User, Role, Permission, RolePermission
from app.modules.identity.security import decode_token, ExpiredSignatureError, InvalidTokenError

VALID_SYSTEM_ROLES = {"superadmin", "manager", "teacher", "secretary", "marketing_manager"}

async def get_current_user(
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    """FastAPI dependency to extract and validate the current logged-in user from access_token cookie."""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    query = select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.id == user_id_str, User.is_active == True)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated"
        )
    return user

class RoleChecker:
    """FastAPI dependency to enforce Role-Based Access Control (RBAC)."""
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name == "superadmin":
            return current_user

        if current_user.role.name not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires one of roles {self.allowed_roles}"
            )
        return current_user

async def superadmin_gate(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency that restricts endpoint strictly to SuperAdmins."""
    if current_user.role.name != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: SuperAdmin credentials required"
        )
    return current_user


def require_role(role_name: str):
    """Factory that returns a dependency requiring a specific role (SuperAdmin bypass included)."""
    async def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name == "superadmin":
            return current_user
        if current_user.role.name != role_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires role '{role_name}'"
            )
        return current_user
    return _role_checker


require_manager = require_role("manager")
require_secretary = require_role("secretary")
require_teacher = require_role("teacher")


class PermissionChecker:
    """FastAPI dependency to check page-level permissions from the DB."""
    def __init__(self, permission_codename: str):
        self.permission_codename = permission_codename

    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> User:
        if current_user.is_superadmin:
            return current_user

        result = await db.execute(
            select(RolePermission)
            .join(Permission, RolePermission.permission_id == Permission.id)
            .where(
                RolePermission.role_id == current_user.role_id,
                Permission.codename == self.permission_codename,
            )
        )
        if not result.first():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Missing permission '{self.permission_codename}'"
            )
        return current_user
