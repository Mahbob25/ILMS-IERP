"""Admin endpoints for managing portal accounts (students & parents).

The portal_accounts module previously had no router — accounts were only ever
created as a side effect of creating a student. These endpoints let ERP staff
list/search, reset passwords, activate/deactivate/unlock, and re-link portal
accounts, plus superadmin impersonation through the existing one-time SSO
ticket.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.modules.identity.dependencies import RoleChecker, superadmin_gate
from app.modules.identity.models import User
from app.modules.identity.security import create_sso_ticket
from app.modules.identity.service import create_audit_log
from app.modules.portal_accounts import service
from app.modules.portal_accounts.schemas import (
    ImpersonateResponse,
    ParentLinkRequest,
    PortalAccountDetail,
    PortalAccountListResponse,
    PortalAccountStateResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
)

portal_accounts_router = APIRouter(prefix="/portal-accounts", tags=["portal-accounts"])

_MANAGE_ROLES = ["superadmin", "manager", "secretary"]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Portal account not found"
    )


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


@portal_accounts_router.get("", response_model=PortalAccountListResponse)
async def list_portal_accounts(
    search: Optional[str] = Query(None),
    account_type: str = Query("all", pattern="^(all|student|parent)$"),
    status_filter: str = Query("all", alias="status", pattern="^(all|active|inactive|locked)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    items, total = await service.list_portal_accounts(
        db,
        search=search,
        account_type=account_type,
        status=status_filter,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return {"items": items, "total": total}


@portal_accounts_router.get("/{user_id}", response_model=PortalAccountDetail)
async def get_portal_account(
    user_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    account = await service.get_portal_account_detail(db, user_id)
    if not account:
        raise _not_found()
    return account


@portal_accounts_router.post("/{user_id}/reset-password", response_model=ResetPasswordResponse)
async def reset_portal_password(
    user_id: uuid.UUID,
    data: ResetPasswordRequest,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    account = await service.get_portal_account(db, user_id)
    if not account:
        raise _not_found()

    if data.mode == "phone":
        if not account.get("phone"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This account has no phone number; set a custom password instead.",
            )
        new_password = account["phone"]
    else:
        if not data.new_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="new_password is required when mode=custom",
            )
        new_password = data.new_password

    await service.set_portal_password(db, user_id, new_password)
    await create_audit_log(
        db=db,
        action="PORTAL_ACCOUNT_PASSWORD_RESET",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id), "mode": data.mode},
        ip_address=_client_ip(request),
    )
    return {
        "id": account["id"],
        "email": account.get("email"),
        "phone": account.get("phone"),
        "new_password": new_password,
    }


@portal_accounts_router.post("/{user_id}/activate", response_model=PortalAccountStateResponse)
async def activate_portal_account(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    state = await service.set_portal_active(db, user_id, True)
    if not state:
        raise _not_found()
    await create_audit_log(
        db=db,
        action="PORTAL_ACCOUNT_ACTIVATED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id)},
        ip_address=_client_ip(request),
    )
    return state


@portal_accounts_router.post("/{user_id}/deactivate", response_model=PortalAccountStateResponse)
async def deactivate_portal_account(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    state = await service.set_portal_active(db, user_id, False)
    if not state:
        raise _not_found()
    await create_audit_log(
        db=db,
        action="PORTAL_ACCOUNT_DEACTIVATED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id)},
        ip_address=_client_ip(request),
    )
    return state


@portal_accounts_router.post("/{user_id}/unlock", response_model=PortalAccountStateResponse)
async def unlock_portal_account(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    state = await service.unlock_portal_account(db, user_id)
    if not state:
        raise _not_found()
    await create_audit_log(
        db=db,
        action="PORTAL_ACCOUNT_UNLOCKED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id)},
        ip_address=_client_ip(request),
    )
    return state


@portal_accounts_router.post("/{user_id}/links", response_model=PortalAccountDetail)
async def link_parent_account(
    user_id: uuid.UUID,
    data: ParentLinkRequest,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    account = await service.get_portal_account(db, user_id)
    if not account:
        raise _not_found()
    if account["account_type"] != "parent":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only parent accounts can be linked to students.",
        )
    if not await service.student_exists(db, data.student_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )

    await service.link_parent_to_student(db, user_id, data.student_id, data.relationship)
    await create_audit_log(
        db=db,
        action="PORTAL_PARENT_LINKED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id), "student_id": str(data.student_id)},
        ip_address=_client_ip(request),
    )
    return await service.get_portal_account_detail(db, user_id)


@portal_accounts_router.delete("/{user_id}/links/{student_id}", response_model=PortalAccountDetail)
async def unlink_parent_account(
    user_id: uuid.UUID,
    student_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(RoleChecker(allowed_roles=_MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    account = await service.get_portal_account(db, user_id)
    if not account:
        raise _not_found()

    removed = await service.unlink_parent_from_student(db, user_id, student_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Link not found"
        )
    await create_audit_log(
        db=db,
        action="PORTAL_PARENT_UNLINKED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id), "student_id": str(student_id)},
        ip_address=_client_ip(request),
    )
    return await service.get_portal_account_detail(db, user_id)


@portal_accounts_router.post("/{user_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate_portal_account(
    user_id: uuid.UUID,
    request: Request,
    locale: str = Query("ar", pattern="^(ar|en)$"),
    current_user: User = Depends(superadmin_gate),
    db: AsyncSession = Depends(get_db),
):
    account = await service.get_portal_account(db, user_id)
    if not account:
        raise _not_found()
    if not account.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot sign in as a deactivated account.",
        )

    ticket = create_sso_ticket(str(user_id))
    base = (settings.PORTAL_FRONTEND_URL or "").rstrip("/")
    await create_audit_log(
        db=db,
        action="PORTAL_ACCOUNT_IMPERSONATED",
        user_id=current_user.id,
        payload={"portal_user_id": str(user_id), "locale": locale},
        ip_address=_client_ip(request),
    )
    return {"url": f"{base}/{locale}/login?ticket={ticket}"}
