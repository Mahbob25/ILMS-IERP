# Phase 5: Deactivation

**Owner:** Backend Agent D  
**Estimate:** 1.25 days  
**Dependencies:** Phase 1 (models exist, `CourseSection.flags` exists)  
**Parallel-safe:** Yes — adds new functions to `ledger_service.py` and `service.py` without modifying existing functions. Adds a single new endpoint to `router.py`.

## Scope

Lightweight undo for accidental activation. Returns section from `active` to `pending` with financial safeguards. Does NOT touch cancellation, grade enforcement, or startup checks.

---

## Tasks

### 5.1 Add `deactivate_contract()` to Ledger Service

In `backend/app/modules/lms/ledger_service.py`:

```python
async def deactivate_contract(db: AsyncSession, contract: Contract, reason: str) -> Contract:
    """
    Reverse only the activation credit from teacher wallet.
    Does NOT reverse payment shares (those were never paid for a deactivated section).

    Returns the contract with updated status.
    """

    # Safety: check teacher hasn't withdrawn the activation credit
    activation_credit = contract.activation_amount  # or however it's tracked
    teacher_wallet = await get_teacher_wallet(db, contract.teacher_id)

    if teacher_wallet.balance < activation_credit:
        raise HTTPException(
            status_code=400,
            detail="Cannot deactivate: teacher has withdrawn funds. "
                   "Activation credit cannot be recovered from wallet."
        )

    # Create reversal ledger entry
    await create_ledger_entry(
        db,
        teacher_id=contract.teacher_id,
        amount=-activation_credit,
        entry_type=LedgerEntryType.DEACTIVATION_REVERSAL,
        reference_id=contract.id,
        description=f"Deactivation reversal: {reason}",
    )

    # Reset contract status (implementation-specific)
    contract.status = "ASSIGNED"  # or appropriate pre-activation status
    await db.commit()
    return contract
```

**Safety guard:** Block if teacher wallet balance < activation credit to reverse (prevents negative wallet).

### 5.2 Add `deactivate_section()` to Academic Service

In `backend/app/modules/academic/service.py` (appended as new function, NOT inline edit):

```python
async def deactivate_section(
    db: AsyncSession,
    section_id: UUID,
    current_user: User,
    reason: str | None = None,
) -> CourseSection:
    """
    Deactivate an active section: return to pending status.
    Requires: section is active, contract is active, teacher hasn't withdrawn.
    If students have made payments, `reason` is required.
    """

    section = await db.get(CourseSection, section_id)
    if not section or section.deleted_at:
        raise HTTPException(status_code=404, detail="Section not found")

    if section.status != "active":
        raise HTTPException(status_code=400, detail="Only active sections can be deactivated")

    # Check for student payments
    has_payments = await _section_has_payments(db, section_id)
    if has_payments and not reason:
        raise HTTPException(
            status_code=400,
            detail="Reason required: section has student payments recorded. "
                   "Provide a reason for deactivation."
        )

    # Get and deactivate contract
    contract = await get_section_contract(db, section_id)
    if contract and contract.status == "ACTIVE":
        await deactivate_contract(db, contract, reason or "Manager deactivation")

    # Update section status
    section.status = "pending"
    await db.commit()
    await db.refresh(section)
    return section
```

### 5.3 Add Deactivation Endpoint to Router

Append to `backend/app/modules/academic/router.py`:

```python
@router.post("/course-sections/{id}/deactivate")
async def deactivate_section_endpoint(
    id: UUID,
    body: DeactivateRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["superadmin", "manager"])),
):
    return await deactivate_section(
        db, id, current_user, reason=body.reason
    )
```

With request model:

```python
class DeactivateRequest(BaseModel):
    reason: str | None = None
```

### 5.4 Helper: `_section_has_payments()`

```python
async def _section_has_payments(db: AsyncSession, section_id: UUID) -> bool:
    """Check if any enrollment in this section has payment records."""
    result = await db.execute(
        select(exists().where(
            Payment.enrollment_id == Enrollment.id,
            Enrollment.section_id == section_id,
            Enrollment.deleted_at.is_(None),
        ))
    )
    return result.scalar() or False
```

---

## Files Touched

| File | Action |
|------|--------|
| `backend/app/modules/lms/ledger_service.py` | **EDIT** — add `deactivate_contract()` function |
| `backend/app/modules/academic/service.py` | **EDIT** — append `deactivate_section()` and `_section_has_payments()` (new functions, no inline changes) |
| `backend/app/modules/academic/router.py` | **EDIT** — append deactivate endpoint (new route, no inline changes) |

## Independent Boundary

This phase does NOT:
- Modify `complete_section()` (Phase 3 concern)
- Touch `cancellation_service.py`, `cashier_service.py` (Phase 4 concerns)
- Touch `section_startup_checks.py` (Phase 2 concern)
- Create any new database tables or models

## Verification

- [ ] Active section → deactivate → status becomes `pending`
- [ ] Contract activation credit reversed via `DEACTIVATION_REVERSAL` ledger entry
- [ ] Teacher wallet balance decreases by activation amount
- [ ] Deactivation blocked if teacher has withdrawn activation funds
- [ ] Section with student payments: deactivation requires `reason`, fails without it
- [ ] `pending` or `completed` section returns 400 "Only active sections can be deactivated"
- [ ] Full audit trail available via ledger entries
