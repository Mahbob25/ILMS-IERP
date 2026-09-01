import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.core import storage
from app.db.session import get_db
from app.modules.identity.dependencies import RoleChecker
from app.modules.identity.models import User
from app.modules.lessonforge.schemas import (
    LessonForgeCreate,
    LessonForgeResourceResponse,
    LessonForgeJobStatus,
)
from app.modules.lessonforge import service as lessonforge_service

lessonforge_router = APIRouter(prefix="/lessonforge", tags=["lessonforge"])


@lessonforge_router.post("/resources", response_model=LessonForgeJobStatus)
@limiter.limit("10/minute")
async def create_resource(
    request: Request,
    body: LessonForgeCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    row = await lessonforge_service.create_job(
        db, teacher_id=current_user.employee_id, payload=body.model_dump()
    )
    return {"job_id": row.job_id, "status": row.status}


@lessonforge_router.get("/jobs/{job_id}", response_model=LessonForgeJobStatus)
async def job_status(
    job_id: str,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    result = await lessonforge_service.poll_job(db, teacher_id=current_user.employee_id, job_id=job_id)
    if result["status"] == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return result


@lessonforge_router.get("/resources", response_model=list[LessonForgeResourceResponse])
async def list_resources(
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    return await lessonforge_service.list_resources(db, teacher_id=current_user.employee_id)


@lessonforge_router.get("/resources/{resource_id}/html")
async def get_resource_html(
    resource_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    row = await lessonforge_service.get_owned_resource(
        db, teacher_id=current_user.employee_id, resource_id=resource_id
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    if row.status != "completed" or not row.file_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resource is not ready")
    path = storage.get_file_path(row.file_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource file missing")
    return FileResponse(path=str(path), media_type="text/html", filename=f"{row.title or 'resource'}.html")


@lessonforge_router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: uuid.UUID,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db),
):
    deleted = await lessonforge_service.delete_resource(
        db, teacher_id=current_user.employee_id, resource_id=resource_id
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
