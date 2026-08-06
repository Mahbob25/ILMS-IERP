from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import superadmin_gate
from app.modules.backups import service as backups_service
from app.modules.backups.schemas import BackupItem, BackupsListResponse, DeleteResponse

router = APIRouter(prefix="/database-backups", tags=["Database Backups"])


@router.get("", response_model=BackupsListResponse)
@limiter.limit("10/minute")
async def list_database_backups(
    request: Request,
    current_user: User = Depends(superadmin_gate),
):
    return await backups_service.list_backups()


@router.post("", response_model=BackupItem, status_code=status.HTTP_201_CREATED)
@limiter.limit("2/minute")
async def create_database_backup(
    request: Request,
    current_user: User = Depends(superadmin_gate),
    db: AsyncSession = Depends(get_db),
):
    return await backups_service.create_backup(db, current_user)


@router.delete("/{backup_id}", response_model=DeleteResponse)
async def delete_database_backup(
    backup_id: str,
    current_user: User = Depends(superadmin_gate),
    db: AsyncSession = Depends(get_db),
):
    return await backups_service.soft_delete(db, backup_id, current_user)


@router.post("/{backup_id}/undo-delete", response_model=BackupItem)
async def undo_delete_database_backup(
    backup_id: str,
    current_user: User = Depends(superadmin_gate),
    db: AsyncSession = Depends(get_db),
):
    return await backups_service.undo_delete(db, backup_id, current_user)


@router.get("/{backup_id}/download")
async def download_database_backup(
    backup_id: str,
    current_user: User = Depends(superadmin_gate),
):
    path = backups_service.get_download_path(backup_id)
    return FileResponse(
        path=str(path),
        media_type="application/octet-stream",
        filename=backup_id,
    )
