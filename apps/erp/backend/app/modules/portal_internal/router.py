import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.modules.identity.service import create_audit_log

from . import service
from .dependencies import verify_service_key
from .schemas import (
    AttendanceDTO,
    GradeDTO,
    LinkedStudentDTO,
    PaymentDTO,
    PortalMeResponse,
    ProfileUpdateRequest,
    SectionDTO,
)

logger = logging.getLogger(__name__)

internal_router = APIRouter(prefix="/internal/portal", tags=["internal-portal"])


async def _write_audit(
    db: AsyncSession,
    action: str,
    actor_id: str,
    path: str,
    ok: bool,
) -> None:
    """Best-effort inline audit write — never let auditing break the request.

    Uses the request's own session so the row commits with the request
    transaction. The actor is a portal.users.id which does NOT exist in the
    ERP users table (audit_logs.user_id FK), so it is recorded in the JSONB
    payload and user_id is left null.
    """
    try:
        await create_audit_log(
            db,
            action=action,
            user_id=None,
            payload={"path": path, "ok": ok, "actor_id": actor_id},
        )
    except Exception:
        logger.warning("audit write failed for %s", action, exc_info=True)


def _require_actor(actor_id: str) -> str:
    if not actor_id:
        raise HTTPException(status_code=401, detail="X-Actor-Id header required")
    return actor_id


async def _verify_student_access(db: AsyncSession, actor_id: str, student_id: str) -> None:
    student = await service.get_student(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if not await service.student_is_linked(db, actor_id, student_id):
        raise HTTPException(status_code=403, detail="Actor not linked to student")
    return None


@internal_router.get("/me", response_model=PortalMeResponse)
async def internal_me(
    request: Request,
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    students = await service.get_linked_students(db, actor)
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return PortalMeResponse(
        actor_id=actor,
        linked_students=[LinkedStudentDTO(**s) for s in students],
    )


@internal_router.get("/grades", response_model=list[GradeDTO])
async def internal_grades(
    request: Request,
    student_id: str = Query(...),
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    await _verify_student_access(db, actor, student_id)
    rows = await service.get_grades(db, student_id)
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return [GradeDTO(**r) for r in rows]


@internal_router.get("/attendance", response_model=list[AttendanceDTO])
async def internal_attendance(
    request: Request,
    student_id: str = Query(...),
    section_id: str | None = Query(None),
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    await _verify_student_access(db, actor, student_id)
    rows = await service.get_attendance(db, student_id, section_id)
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return [AttendanceDTO(**r) for r in rows]


@internal_router.get("/payments", response_model=list[PaymentDTO])
async def internal_payments(
    request: Request,
    student_id: str = Query(...),
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    await _verify_student_access(db, actor, student_id)
    rows = await service.get_payments(db, student_id)
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return [PaymentDTO(**r) for r in rows]


@internal_router.get("/sections", response_model=list[SectionDTO])
async def internal_sections(
    request: Request,
    student_id: str = Query(...),
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    await _verify_student_access(db, actor, student_id)
    rows = await service.get_sections(db, student_id)
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return [SectionDTO(**r) for r in rows]


@internal_router.post("/profile", status_code=200)
async def internal_profile_update(
    request: Request,
    body: ProfileUpdateRequest,
    student_id: str = Query(...),
    actor_id: str = Depends(verify_service_key),
    db: AsyncSession = Depends(get_db),
):
    actor = _require_actor(actor_id)
    try:
        student = await service.update_profile(
            db, actor, student_id, phone=body.phone, locale_pref=body.locale_pref
        )
    except PermissionError as e:
        await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, False)
        raise HTTPException(status_code=409, detail=str(e))
    if student is None:
        await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, False)
        raise HTTPException(status_code=404, detail="Student not found or actor not linked")
    await _write_audit(db, "INTERNAL_PORTAL_ACCESS", actor, request.url.path, True)
    return {"updated": True, "student": student}


@internal_router.get("/context")
async def internal_context(
    request: Request,
    section_id: str = Query(None),
    query: str = Query(...),
    actor_id: str = Depends(verify_service_key),
):
    """RAG read-path stub — pgvector chunk search ships with the AI pipeline (Phase 5.0)."""
    return {"detail": "Context search not implemented yet — ships with AI pipeline", "status": 501}


@internal_router.post("/ai/ingest")
@limiter.limit("100/minute")
async def internal_ai_ingest(
    request: Request,
    actor_id: str = Depends(verify_service_key),
):
    """ERP enqueue shim for ai:ingestion — wired to the queue in Phase 1."""
    return {"detail": "AI ingestion not implemented yet — queue wiring ships in Phase 1", "status": 501}
