from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker, superadmin_gate
from app.modules.dashboard.schemas import (
    TeacherDashboardResponse,
    SecretaryDashboardResponse,
    ManagerDashboardResponse,
    SuperadminDashboardResponse,
)
from app.modules.dashboard import service as dashboard_service

dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@dashboard_router.get("/teacher", response_model=TeacherDashboardResponse)
async def teacher_dashboard(
    current_user: User = Depends(RoleChecker(allowed_roles=["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_teacher_dashboard(db, current_user.id)


@dashboard_router.get("/secretary", response_model=SecretaryDashboardResponse)
async def secretary_dashboard(
    current_user: User = Depends(RoleChecker(allowed_roles=["secretary"])),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_secretary_dashboard(db)


@dashboard_router.get("/manager", response_model=ManagerDashboardResponse)
async def manager_dashboard(
    current_user: User = Depends(RoleChecker(allowed_roles=["manager"])),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_manager_dashboard(db)


@dashboard_router.get("/superadmin", response_model=SuperadminDashboardResponse)
async def superadmin_dashboard(
    current_user: User = Depends(superadmin_gate),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_superadmin_dashboard(db)
