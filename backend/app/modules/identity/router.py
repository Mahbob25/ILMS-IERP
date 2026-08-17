import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from sqlalchemy.orm import joinedload
from app.db.session import get_db
from app.modules.identity.models import User, Role, Employee, RefreshToken
from app.modules.identity.schemas import (
    UserLogin, UserResponse, UserCreate, UserUpdate,
    TeacherResponse, TeacherDetailResponse,
    RoleCreate, RoleResponse,
    EmployeeResponse, EmployeeCreate, EmployeeUpdate, EmployeeDetailResponse,
    GrantAccessRequest, LinkedUserInfo,
    PermissionResponse, RolePermissionsResponse, RolePermissionsUpdate,
    ChangePasswordRequest, UpdateMeRequest,
)
from app.modules.identity.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    ExpiredSignatureError,
    InvalidTokenError
)
from app.modules.identity.dependencies import (
    get_current_user, RoleChecker, superadmin_gate,
    require_manager, require_secretary, require_teacher,
    PermissionChecker, VALID_SYSTEM_ROLES
)
from app.modules.identity import service as identity_service
from app.core.rate_limit import limiter
from app.core.config import settings

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
employees_router = APIRouter(prefix="/employees", tags=["employees"])

VALID_SYSTEM_ROLES_LIST = list(VALID_SYSTEM_ROLES)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.ENVIRONMENT != "development"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=15 * 60
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )


def _clear_auth_cookies(response: Response) -> None:
    secure = settings.ENVIRONMENT != "development"
    response.delete_cookie(key="access_token", path="/", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", path="/", secure=secure, httponly=True, samesite="lax")


# --- Auth Endpoints ---

@auth_router.post("/login")
@limiter.limit("3/minute")
async def login(
    login_data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    query = select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.email == login_data.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user and user.locked_until and user.locked_until.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user or not verify_password(login_data.password, user.password_hash):
        # Fall back to portal users (students/parents) — same credentials style.
        portal_user = await _lookup_portal_user(db, login_data.email, login_data.password)
        if portal_user is not None:
            return await _issue_portal_sso(response, db, portal_user, request)
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = (datetime.now(timezone.utc) + timedelta(minutes=15)).replace(tzinfo=None)
        await identity_service.create_audit_log(
            db=db,
            action="LOGIN_FAILED",
            payload={"email": login_data.email},
            ip_address=request.client.host if request.client else None
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    user.failed_login_attempts = 0
    user.locked_until = None

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    # Only allow system roles to log in
    if user.role.name not in VALID_SYSTEM_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account does not have system access"
        )

    user_payload = {"sub": str(user.id), "role": user.role.name, "is_superadmin": user.is_superadmin}
    access_token = create_access_token(user_payload)
    refresh_token = create_refresh_token(user_payload)

    hashed_refresh = _hash_token(refresh_token)
    db_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hashed_refresh,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=7))
    )
    db.add(db_refresh_token)

    _set_auth_cookies(response, access_token, refresh_token)

    await identity_service.create_audit_log(
        db=db,
        user_id=user.id,
        action="LOGIN_SUCCESS",
        ip_address=request.client.host if request.client else None
    )

    return user


async def _lookup_portal_user(db: AsyncSession, email: str, password: str):
    """Return the portal.users dict if email+password match a portal account, else None."""
    from app.modules.portal_accounts import service as portal_accounts_service
    from app.modules.identity.security import verify_password

    account = await portal_accounts_service.find_portal_user_by_email(db, email)
    if not account:
        return None
    password_hash = (
        await db.execute(
            text("SELECT password_hash FROM portal.users WHERE id = :uid"),
            {"uid": account["id"]},
        )
    ).scalar_one_or_none()
    if not password_hash or not verify_password(password, password_hash):
        return None
    if not account.get("is_active", True):
        return None
    return account


async def _issue_portal_sso(response: Response, db: AsyncSession, portal_user: dict, request: Request):
    """Issue a one-time SSO ticket for a portal user (student/parent)."""
    from app.modules.identity.security import create_sso_ticket
    from app.core.config import settings

    ticket = create_sso_ticket(portal_user["id"])
    await identity_service.create_audit_log(
        db=db,
        action="LOGIN_SUCCESS",
        payload={"portal_user_id": str(portal_user["id"]), "sso_ticket_issued": True},
        ip_address=request.client.host if request.client else None,
    )
    return {
        "user_type": "portal",
        "sso_ticket": ticket,
        "portal_url": settings.PORTAL_FRONTEND_URL,
    }


@auth_router.post("/refresh")
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        user_id_str = payload.get("sub")
    except (ExpiredSignatureError, InvalidTokenError):
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    hashed_refresh = _hash_token(refresh_token)
    query = select(RefreshToken).options(joinedload(RefreshToken.user).joinedload(User.role)).where(
        RefreshToken.token_hash == hashed_refresh,
        RefreshToken.revoked == False
    )
    result = await db.execute(query)
    db_refresh = result.scalar_one_or_none()

    if not db_refresh or db_refresh.expires_at < datetime.now(timezone.utc):
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked or expired"
        )

    user = db_refresh.user
    if not user.is_active:
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    db_refresh.revoked = True

    user_payload = {"sub": str(user.id), "role": user.role.name, "is_superadmin": user.is_superadmin}
    new_access_token = create_access_token(user_payload)
    new_refresh_token = create_refresh_token(user_payload)

    new_hashed_refresh = _hash_token(new_refresh_token)
    new_db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=new_hashed_refresh,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=7))
    )
    db.add(new_db_refresh)

    _set_auth_cookies(response, new_access_token, new_refresh_token)

    await identity_service.create_audit_log(
        db=db,
        user_id=user.id,
        action="TOKEN_ROTATED",
        ip_address=request.client.host if request.client else None
    )

    return {"status": "success"}


@auth_router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if refresh_token:
        hashed_refresh = _hash_token(refresh_token)
        query = select(RefreshToken).where(RefreshToken.token_hash == hashed_refresh)
        result = await db.execute(query)
        db_refresh = result.scalar_one_or_none()

        if db_refresh:
            db_refresh.revoked = True
            await identity_service.create_audit_log(
                db=db,
                user_id=db_refresh.user_id,
                action="LOGOUT",
                ip_address=request.client.host if request.client else None
            )

    _clear_auth_cookies(response)
    return {"status": "success"}


@auth_router.get("/csrf")
async def csrf_token():
    return {"status": "ok"}


@auth_router.get("/me")
async def auth_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.employee.full_name if current_user.employee else None,
        "role": current_user.role.name,
        "is_superadmin": current_user.is_superadmin,
    }

@auth_router.post("/change-password")
@limiter.limit("5/minute")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        await identity_service.create_audit_log(
            db=db,
            user_id=current_user.id,
            action="PASSWORD_CHANGE_FAILED",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.password_hash = get_password_hash(body.new_password)
    await db.flush()
    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="PASSWORD_CHANGED",
        ip_address=request.client.host if request.client else None,
    )
    return {"status": "success"}


@auth_router.get("/me/permissions")
async def auth_me_permissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    perms = await identity_service.get_user_permissions(db, current_user)
    return {"permissions": perms}


# --- User CRUD Endpoints ---

@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_user(
    user_data: UserCreate,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    role_query = select(Role).where(Role.id == user_data.role_id)
    role_result = await db.execute(role_query)
    target_role = role_result.scalar_one_or_none()

    if not target_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specified role ID does not exist"
        )

    if current_user.role.name != "superadmin" and target_role.name in ("superadmin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot create SuperAdmin or Manager accounts"
        )

    email_query = select(User).where(User.email == user_data.email)
    email_result = await db.execute(email_query)
    if email_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered"
        )

    if not user_data.employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="employee_id is required: every user must be linked to an employee"
        )

    employee_check = await db.execute(select(Employee).where(Employee.id == user_data.employee_id))
    if not employee_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specified employee does not exist"
        )

    hashed_password = get_password_hash(user_data.password)

    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        role_id=user_data.role_id,
        locale_pref=user_data.locale_pref or "ar",
        employee_id=user_data.employee_id,
    )
    db.add(new_user)
    await db.flush()

    query = select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.id == new_user.id)
    res = await db.execute(query)
    created_user = res.scalar_one()

    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_CREATED",
        payload={"created_user_id": str(created_user.id), "role": target_role.name}
    )

    return created_user


@users_router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = Query(None),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    query = select(User).options(joinedload(User.role), joinedload(User.employee)).join(User.role)

    if role:
        query = query.where(Role.name == role)
    elif current_user.role.name != "superadmin":
        query = query.where(Role.name == "teacher")

    query = query.order_by(User.email)
    result = await db.execute(query)
    return result.scalars().all()


@users_router.patch("/me", response_model=UserResponse)
async def patch_me(
    body: UpdateMeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    for key, value in data.items():
        setattr(current_user, key, value)
    await db.flush()
    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_PREFS_UPDATED",
        payload={"fields": list(data.keys())},
        ip_address=request.client.host if request.client else None,
    )
    result = await db.execute(
        select(User).options(joinedload(User.role), joinedload(User.employee)).where(User.id == current_user.id)
    )
    return result.scalar_one()


@users_router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@users_router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Role).order_by(Role.name))
    return result.scalars().all()


@users_router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")
    return await identity_service.create_role(db, data.name)


@users_router.get("/teachers", response_model=List[TeacherResponse])
async def list_teachers(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary", "teacher"])),
    db: AsyncSession = Depends(get_db)
):
    return await identity_service.get_teachers_with_stats(db)


@users_router.get("/teachers/{teacher_id}", response_model=TeacherDetailResponse)
async def get_teacher_detail(
    teacher_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])),
    db: AsyncSession = Depends(get_db)
):
    result = await identity_service.get_teacher_detail(db, teacher_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")
    return result


@users_router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    user = await identity_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role.name != "superadmin" and user.role.name in ("superadmin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot view SuperAdmin or Manager accounts"
        )
    return user


@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    user_data: UserUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    user = await identity_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role.name != "superadmin" and user.role.name in ("superadmin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot update SuperAdmin or Manager accounts"
        )

    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(
            select(User).where(User.email == user_data.email, User.id != user_id)
        )
        if email_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )

    update_data = user_data.model_dump(exclude_unset=True)
    updated = await identity_service.update_user(db, user, update_data)

    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_UPDATED",
        payload={"updated_user_id": str(user_id)}
    )
    return updated


@users_router.delete("/{user_id}", response_model=UserResponse)
async def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    user = await identity_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself"
        )

    if current_user.role.name != "superadmin" and user.role.name in ("superadmin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers cannot deactivate SuperAdmin or Manager accounts"
        )

    result = await identity_service.soft_delete_user(db, user)

    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_DEACTIVATED",
        payload={"deactivated_user_id": str(user_id)}
    )
    return result


# --- Employee Endpoints ---

@employees_router.get("", response_model=List[EmployeeResponse])
async def list_employees(
    employee_type: Optional[str] = Query(None, description="Filter by employee type"),
    search: Optional[str] = Query(None, description="Search by name"),
    has_account: Optional[bool] = Query(None, description="Filter by whether employee has a user account"),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    return await identity_service.list_employees(db, employee_type=employee_type, search=search, has_account=has_account)


@employees_router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    data: EmployeeCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    try:
        employee = await identity_service.create_employee(db, data.model_dump())
        await identity_service.create_audit_log(
            db=db,
            user_id=current_user.id,
            action="EMPLOYEE_CREATED",
            payload={"employee_id": str(employee.id), "employee_type": data.employee_type}
        )
        return employee
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@employees_router.get("/{employee_id}", response_model=EmployeeDetailResponse)
async def get_employee_detail(
    employee_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    result = await identity_service.get_employee_detail(db, employee_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return result


@employees_router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: uuid.UUID,
    data: EmployeeUpdate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    employee = await identity_service.get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    try:
        updated = await identity_service.update_employee(db, employee, data.model_dump(exclude_unset=True))
        await identity_service.create_audit_log(
            db=db,
            user_id=current_user.id,
            action="EMPLOYEE_UPDATED",
            payload={"employee_id": str(employee_id)}
        )
        return updated
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@employees_router.delete("/{employee_id}", response_model=EmployeeResponse)
async def delete_employee(
    employee_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    employee = await identity_service.get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    result = await identity_service.soft_delete_employee(db, employee)
    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="EMPLOYEE_DEACTIVATED",
        payload={"employee_id": str(employee_id)}
    )
    return result


@employees_router.post("/{employee_id}/grant-access", response_model=UserResponse)
async def grant_employee_access(
    employee_id: uuid.UUID,
    data: GrantAccessRequest,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    try:
        user = await identity_service.grant_user_access(
            db,
            employee_id=employee_id,
            email=data.email,
            password=data.password,
            role_id=data.role_id,
        )
        await identity_service.create_audit_log(
            db=db,
            user_id=current_user.id,
            action="USER_ACCESS_GRANTED",
            payload={"employee_id": str(employee_id), "user_id": str(user.id)}
        )
        return user
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@employees_router.post("/{employee_id}/revoke-access", status_code=status.HTTP_200_OK)
async def revoke_employee_access(
    employee_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    await identity_service.revoke_user_access(db, employee_id)
    await identity_service.create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_ACCESS_REVOKED",
        payload={"employee_id": str(employee_id)}
    )
    return {"status": "success"}


# --- Permission Endpoints ---

permissions_router = APIRouter(prefix="/permissions", tags=["permissions"])


@permissions_router.get("", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: User = Depends(PermissionChecker("page_roles")),
    db: AsyncSession = Depends(get_db)
):
    return await identity_service.get_all_permissions(db)


@permissions_router.get("/roles/{role_id}", response_model=RolePermissionsResponse)
async def get_role_permissions(
    role_id: uuid.UUID,
    current_user: User = Depends(PermissionChecker("page_roles")),
    db: AsyncSession = Depends(get_db)
):
    codenames = await identity_service.get_role_permissions(db, role_id)
    return RolePermissionsResponse(role_id=role_id, permission_codenames=codenames)


@permissions_router.put("/roles/{role_id}", response_model=RolePermissionsResponse)
async def set_role_permissions(
    role_id: uuid.UUID,
    data: RolePermissionsUpdate,
    current_user: User = Depends(PermissionChecker("page_roles")),
    db: AsyncSession = Depends(get_db)
):
    try:
        await identity_service.set_role_permissions(db, role_id, data.permission_codenames)
        await identity_service.create_audit_log(
            db=db,
            user_id=current_user.id,
            action="ROLE_PERMISSIONS_UPDATED",
            payload={"role_id": str(role_id)}
        )
        return RolePermissionsResponse(role_id=role_id, permission_codenames=data.permission_codenames)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# --- Deprecated /users/employees redirect (backward compat) ---

@users_router.get("/employees", response_model=List[EmployeeResponse])
async def list_employees_deprecated(
    roles: Optional[List[str]] = Query(None, description="Deprecated: use /employees instead"),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    # Redirect to new endpoint logic, ignore old roles param
    return await identity_service.list_employees(db, employee_type=roles[0] if roles else None)


@users_router.get("/employees/{user_id}", response_model=EmployeeDetailResponse)
async def get_employee_detail_deprecated(
    user_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    result = await identity_service.get_employee_detail(db, user_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return result
