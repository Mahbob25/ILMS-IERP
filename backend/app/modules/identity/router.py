import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.db.session import get_db
from app.modules.identity.models import User, Role, RefreshToken
from app.modules.identity.schemas import UserLogin, UserResponse, UserCreate, UserUpdate
from app.modules.identity.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    ExpiredSignatureError,
    InvalidTokenError
)
from app.modules.identity.dependencies import get_current_user, RoleChecker, superadmin_gate, require_manager, require_secretary, require_teacher
from app.modules.identity.service import create_audit_log

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])

def _hash_token(token: str) -> str:
    """Helper to SHA-256 hash refresh tokens for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()

def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Helper to set access and refresh tokens in HttpOnly Secure cookies."""
    # Set access token cookie (expires in 15 minutes)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=15 * 60  # 15 mins
    )
    # Set refresh token cookie (expires in 7 days)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60  # 7 days
    )

def _clear_auth_cookies(response: Response) -> None:
    """Helper to remove authentication cookies."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")

@auth_router.post("/login", response_model=UserResponse)
async def login(
    login_data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate credentials, establish session, write cookies, and audit log."""
    # Query user and load role
    query = select(User).options(joinedload(User.role)).where(User.email == login_data.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        # Audit log failed login
        await create_audit_log(
            db=db,
            action="LOGIN_FAILED",
            payload={"email": login_data.email},
            ip_address=request.client.host if request.client else None
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    # Generate JWT tokens
    user_payload = {"sub": str(user.id), "role": user.role.name, "is_superadmin": user.is_superadmin}
    access_token = create_access_token(user_payload)
    refresh_token = create_refresh_token(user_payload)

    # Save hash of refresh token in DB
    hashed_refresh = _hash_token(refresh_token)
    db_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hashed_refresh,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).replace(tzinfo=None)
    )
    db.add(db_refresh_token)

    # Set HttpOnly cookies
    _set_auth_cookies(response, access_token, refresh_token)

    # Audit log successful login
    await create_audit_log(
        db=db,
        user_id=user.id,
        action="LOGIN_SUCCESS",
        ip_address=request.client.host if request.client else None
    )

    return user

@auth_router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    """Perform refresh token rotation, invalidating old sessions."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    try:
        # Decode refresh token payload
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        user_id_str = payload.get("sub")
    except (ExpiredSignatureError, InvalidTokenError):
        # Expired or modified token
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Verify token exists in database and is not revoked
    hashed_refresh = _hash_token(refresh_token)
    query = select(RefreshToken).options(joinedload(RefreshToken.user).joinedload(User.role)).where(
        RefreshToken.token_hash == hashed_refresh,
        RefreshToken.revoked == False
    )
    result = await db.execute(query)
    db_refresh = result.scalar_one_or_none()

    if not db_refresh or db_refresh.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
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

    # Perform Rotation: Mark old refresh token as revoked
    db_refresh.revoked = True

    # Generate new tokens
    user_payload = {"sub": str(user.id), "role": user.role.name, "is_superadmin": user.is_superadmin}
    new_access_token = create_access_token(user_payload)
    new_refresh_token = create_refresh_token(user_payload)

    # Store new refresh token hash
    new_hashed_refresh = _hash_token(new_refresh_token)
    new_db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=new_hashed_refresh,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).replace(tzinfo=None)
    )
    db.add(new_db_refresh)

    # Set new cookies
    _set_auth_cookies(response, new_access_token, new_refresh_token)

    # Audit log token rotation
    await create_audit_log(
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
    """Revoke active session and clear authentication cookies."""
    if refresh_token:
        hashed_refresh = _hash_token(refresh_token)
        query = select(RefreshToken).where(RefreshToken.token_hash == hashed_refresh)
        result = await db.execute(query)
        db_refresh = result.scalar_one_or_none()
        
        if db_refresh:
            db_refresh.revoked = True
            await create_audit_log(
                db=db,
                user_id=db_refresh.user_id,
                action="LOGOUT",
                ip_address=request.client.host if request.client else None
            )

    _clear_auth_cookies(response)
    return {"status": "success"}


@auth_router.get("/me")
async def auth_me(current_user: User = Depends(get_current_user)):
    """Return compact current user info (id, email, full_name, role)."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.name,
    }


# --- USER CRUD ENDPOINTS ---

@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    """Create a new user. SuperAdmin can create anyone; Manager can only create Teachers."""
    # Retrieve target role
    role_query = select(Role).where(Role.id == user_data.role_id)
    role_result = await db.execute(role_query)
    target_role = role_result.scalar_one_or_none()

    if not target_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specified role ID does not exist"
        )

    # Check hierarchy restrictions: Manager cannot create SuperAdmin/Manager/Secretary users
    if current_user.role.name != "superadmin" and target_role.name != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers are only authorized to create Teacher accounts"
        )

    # Check duplicate email
    email_query = select(User).where(User.email == user_data.email)
    email_result = await db.execute(email_query)
    if email_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered"
        )

    # Encrypt password
    hashed_password = get_password_hash(user_data.password)

    # Create user object
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role_id=user_data.role_id,
        locale_pref=user_data.locale_pref or "ar",
    )
    db.add(new_user)
    await db.flush()  # Populates user ID

    # Query again to eagerly load role for schema response
    query = select(User).options(joinedload(User.role)).where(User.id == new_user.id)
    res = await db.execute(query)
    created_user = res.scalar_one()

    # Log user creation
    await create_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_CREATED",
        payload={"created_user_id": str(created_user.id), "role": target_role.name}
    )

    return created_user

@users_router.get("", response_model=List[UserResponse])
async def list_users(
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    """List all registered users. Managers see only Teachers, SuperAdmins see everyone."""
    if current_user.role.name == "superadmin":
        query = select(User).options(joinedload(User.role)).order_by(User.full_name)
    else:
        # Managers see teachers only
        query = select(User).options(joinedload(User.role)).join(User.role).where(
            Role.name == "teacher"
        ).order_by(User.full_name)
        
    result = await db.execute(query)
    return result.scalars().all()

@users_router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Fetch current session user info."""
    return current_user
