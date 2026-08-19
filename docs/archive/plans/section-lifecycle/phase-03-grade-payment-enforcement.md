# Phase 3: Grade & Payment Enforcement

**Owner:** Backend Agent B  
**Estimate:** 1.75 days  
**Dependencies:** Phase 1 (models exist: `SectionCompletionOverride`, `CourseSection.flags`), Timezone module (`get_today()` from `app.core.timezone`)  
**Parallel-safe:** Yes — edits `complete_section()` in `service.py` and adds params to existing endpoint in `router.py`. Does NOT touch `section_startup_checks.py`, cancellation, or deactivation code.

## Scope

Modify `complete_section()` to enforce grade completeness (NULL vs 0 distinction) and payment balance checks before allowing section completion. Add `force=true` override with full audit trail. Respect daily closure checks.

---

## Tasks

### 3.1 Grade Completeness Check (NULL vs 0)

Replace current grade check with:

```python
from app.core.timezone import get_today

async def complete_section(db: AsyncSession, section_id: UUID, current_user: User,
                           force: bool = False, force_reason: str | None = None) -> CourseSection:
    section = await db.get(CourseSection, section_id)
    # ... existing validation ...

    # === NEW: Grade completeness check ===
    enrolled_count = await _count_enrolled_students(db, section_id)

    graded_count = await db.scalar(
        select(func.count()).select_from(final_grades).where(
            final_grades.c.section_id == section_id
        )
    )

    if enrolled_count > (graded_count or 0):
        ungraded = await _get_ungraded_students(db, section_id)
        # ^ Uses LEFT JOIN with fg.id IS NULL (catches NULL only, NOT zero-scores)

        if not force:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Section has ungraded students",
                    "ungraded_students": [s["full_name"] for s in ungraded],
                }
            )
        # force=true: will create override audit record later
```

**Key query — `_get_ungraded_students()`:**
```python
SELECT s.id, s.full_name
FROM enrollments e
JOIN students s ON s.id = e.student_id
LEFT JOIN final_grades fg
  ON fg.section_id = e.section_id AND fg.student_id = e.student_id
WHERE e.section_id = :sid
  AND e.deleted_at IS NULL
  AND fg.id IS NULL  -- Only catches truly missing grades, NOT zero-scores
```

### 3.2 Payment Balance Check

After the grade check (or skipped via force), add:

```python
    # === NEW: Payment balance check ===
    unpaid_students = []
    enrollments = await db.execute(
        select(Enrollment).where(
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        )
    )

    for enrollment in enrollments.scalars().all():
        net_price = _calculate_net_price(enrollment)
        total_paid = await _sum_payments_for_enrollment(db, enrollment.id)
        balance = net_price - total_paid

        if balance > 0:
            student = await db.get(Student, enrollment.student_id)
            unpaid_students.append({
                "student_id": student.id,
                "student_name": student.full_name,
                "balance": float(balance),
            })

    block_unpaid = await _get_config_bool(db, "block_completion_if_unpaid", True)
    if unpaid_students and block_unpaid and not force:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Section has unpaid students",
                "unpaid_students": unpaid_students,
            }
        )
```

### 3.3 Force Override Audit

When `force=True` and bypasses occur:

```python
    if force and (ungraded or unpaid_students):
        db.add(SectionCompletionOverride(
            section_id=section.id,
            overridden_by=current_user.id,
            bypass_grade_check=bool(ungraded),
            bypass_payment_check=bool(unpaid_students),
            reason=force_reason or "No reason provided",
            ungraded_students=[s["full_name"] for s in (ungraded or [])],
            unpaid_students=[s["student_name"] for s in (unpaid_students or [])],
        ))
```

### 3.4 Daily Closure Check

Before proceeding with completion:

```python
    # Daily closure check: block if today is a closed financial day
    # Uses get_today() for institute-local date consistency
    if await _is_date_closed(db, get_today()):
        raise HTTPException(
            status_code=400,
            detail="Cannot complete section on a closed financial day. "
                   "Ask a manager to unlock the day first."
        )
```

### 3.5 Router Changes

In `apps/erp/backend/app/modules/academic/router.py`, update the complete endpoint:

```python
@router.post("/course-sections/{id}/complete")
async def complete_section_endpoint(
    id: UUID,
    force: bool = Body(False),
    reason: str = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    if force and not reason:
        raise HTTPException(status_code=400, detail="reason is required when force=true")
    return await complete_section(db, id, current_user, force=force, force_reason=reason)
```

Also restrict existing DELETE to superadmin only:

```python
@router.delete("/course-sections/{id}")
async def delete_section(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_auth),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can delete sections")
    # ... existing delete logic ...
```

---

## Files Touched

| File | Action |
|------|--------|
| `apps/erp/backend/app/modules/academic/service.py` | **EDIT** — rewrite `complete_section()` with grade check, payment check, override audit, daily closure |
| `apps/erp/backend/app/modules/academic/router.py` | **EDIT** — add `force`/`reason` params to complete endpoint; restrict DELETE to superadmin |

## Independent Boundary

This phase does NOT:
- Touch startup checks, cancellation, or deactivation code
- Create new service files
- Modify ledger_service.py
- Create any new tables or models

## Verification

- [ ] Section with all graded students (including score=0) → completes normally
- [ ] Section with ungraded students (NULL) → blocks with list of student names
- [ ] Section with unpaid students → blocks with list of amounts when `block_completion_if_unpaid=true`
- [ ] `force=true` + `reason` → bypasses checks and creates `SectionCompletionOverride` record
- [ ] `force=true` without `reason` → 400 error
- [ ] Completion on closed financial day → blocked with clear message
- [ ] DELETE restricted to superadmin; 403 for other roles
