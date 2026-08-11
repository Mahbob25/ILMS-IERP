import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import User
from app.modules.academic import service as academic_service
from app.modules.lms import financial_service
from app.modules.search.schemas import SearchHit


def _page_search_allowed(user: User, permission: str) -> bool:
    if user.is_superadmin:
        return True
    role = (user.role.name if user.role else "") or ""
    mapping: dict[str, list[str]] = {
        "page_students": ["superadmin", "manager", "secretary", "teacher"],
        "page_courses": ["superadmin", "manager", "secretary", "teacher"],
        "page_sections": ["superadmin", "manager", "secretary", "teacher"],
        "page_enrollments": ["superadmin", "manager", "secretary", "teacher"],
        "page_payments": ["superadmin", "manager", "secretary", "teacher"],
        "page_expenses": ["superadmin", "manager", "secretary"],
    }
    return role in mapping.get(permission, [])


async def search_grouped(
    db: AsyncSession,
    query: str,
    user: User,
    limit_per_type: int = 5,
    locale: str = "ar",
) -> dict:
    results: dict[str, list[SearchHit]] = {}
    total = 0

    q = query.strip()
    if len(q) < 2:
        return {"query": q, "total": 0, "results": {}}

    prefix = f"/{locale}/dashboard"

    if _page_search_allowed(user, "page_students"):
        res = await academic_service.list_students(db, search=q, skip=0, limit=limit_per_type)
        hits = []
        for s in res["items"]:
            hits.append(SearchHit(
                id=str(s.id),
                type="student",
                label=f"{s.full_name} ({s.student_code})",
                sublabel=s.email or "",
                href=f"{prefix}/students/{s.id}",
            ))
        if hits:
            results["students"] = hits
            total += len(hits)

    if _page_search_allowed(user, "page_courses"):
        res = await academic_service.list_courses(db, search=q, skip=0, limit=limit_per_type)
        hits = []
        for c in res["items"]:
            hits.append(SearchHit(
                id=str(c.id),
                type="course",
                label=f"{c.name} ({c.code})",
                sublabel="",
                href=f"{prefix}/courses",
            ))
        if hits:
            results["courses"] = hits
            total += len(hits)

    if _page_search_allowed(user, "page_sections"):
        teacher_id = user.employee_id if (user.role and user.role.name == "teacher") else None
        res = await academic_service.list_course_sections(db, teacher_id=teacher_id, search=q, skip=0, limit=limit_per_type)
        hits = []
        for sec in res["items"]:
            sub = f"{sec.status} · {sec.enrolled_count}/{sec.capacity}"
            hits.append(SearchHit(
                id=str(sec.id),
                type="section",
                label=str(sec.course_id)[:8],
                sublabel=sub,
                href=f"{prefix}/sections/{sec.id}",
            ))
        if hits:
            results["sections"] = hits
            total += len(hits)

    if _page_search_allowed(user, "page_enrollments"):
        res = await academic_service.list_enrollments(db, search=q, skip=0, limit=limit_per_type)
        hits = []
        for e in res["items"]:
            student_name = getattr(e.student, "full_name", "") if hasattr(e, "student") else ""
            hits.append(SearchHit(
                id=str(e.id),
                type="enrollment",
                label=student_name or str(e.id)[:8],
                sublabel=str(e.section_id)[:8],
                href=f"{prefix}/enrollments",
            ))
        if hits:
            results["enrollments"] = hits
            total += len(hits)

    if _page_search_allowed(user, "page_payments"):
        payments = await financial_service.list_payments(db, receipt_number=q if q else None)
        payments = payments[:limit_per_type] if isinstance(payments, list) else []
        hits = []
        for p in payments:
            hits.append(SearchHit(
                id=str(p.id),
                type="payment",
                label=f"{p.receipt_number} · {float(p.amount)}",
                sublabel=str(p.date),
                href=f"{prefix}/payments",
            ))
        if hits:
            results["payments"] = hits
            total += len(hits)

    if _page_search_allowed(user, "page_expenses"):
        expenses = await financial_service.list_expenses(db, receipt_number=q if q else None, recipient_name=q)
        expenses = expenses[:limit_per_type] if isinstance(expenses, list) else []
        hits = []
        for ex in expenses:
            hits.append(SearchHit(
                id=str(ex.id),
                type="expense",
                label=f"{ex.receipt_number} · {float(ex.amount)}",
                sublabel=ex.recipient_name or "",
                href=f"{prefix}/expenses",
            ))
        if hits:
            results["expenses"] = hits
            total += len(hits)

    return {"query": q, "total": total, "results": results}
