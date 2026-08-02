# Section Completion → Contract Settlement Fix

## Problem Summary

When a section passes its end_date and all students are graded, two bugs prevent the contract from reaching SETTLED:

1. **Status gate rejects `ready_for_completion`** — The startup checks auto-transition overdue fully-graded sections from `"active"` to `"ready_for_completion"`. The `complete_section()` endpoint rejects any status except `"active"`, so the section can never be completed through the normal flow.

2. **Settlement only matches `GRADES_SUBMITTED`** — Even if a section manages to complete, the settlement block only fires when `contract.status == ContractStatus.GRADES_SUBMITTED`. Contracts still at `ASSIGNED` or `ACTIVE` are skipped entirely — teacher's frozen money is never credited.

## Root Cause

`backend/app/modules/academic/service.py:254-359` — `complete_section()` function:

- **Line 261**: `if section.status != "active": return None` — rejects `ready_for_completion`
- **Lines 334-339**: Only calls `ledger_settle_contract` if contract is already `GRADES_SUBMITTED` — no chain to progress ASSIGNED → ACTIVE → GRADES_SUBMITTED first

## Why Some Sections Work (and Others Don't)

**Working sections** followed this path:
1. Admin manually activated contract (ASSIGNED → ACTIVE) via LMS
2. Grades finalized via LMS endpoint (ACTIVE → GRADES_SUBMITTED)
3. Section completed → contract settled (GRADES_SUBMITTED → SETTLED)

**Broken sections** share this profile:
- Contract was never activated (still ASSIGNED) — section likely lacked price/start_date/class_time early on
- OR grades were never finalized via the LMS endpoint
- Section passed end_date → startup checks set section.status = "ready_for_completion"
- Complete button is blocked by the status gate

## Fix Plan

### Phase 1: Accept `ready_for_completion` in `complete_section()`

**File**: `backend/app/modules/academic/service.py`, line 261

**Change**: Replace single-status gate with multi-status acceptance:
```python
if section.status not in ("active", "ready_for_completion"):
    return None
```

**Why**: The startup checks already verified all students are graded before setting this status. The complete endpoint should trust that signal.

**Risk**: Low — this widens the gate, not restricts it.

---

### Phase 2: Chain contract lifecycle on completion

**File**: `backend/app/modules/academic/service.py`, lines 333-339

**Change**: Replace the single `GRADES_SUBMITTED` check with a chained lifecycle block that progresses the contract step by step:

```python
# Chain contract through required lifecycle
if section.contract and current_user.id:
    try:
        if section.contract.status == ContractStatus.ASSIGNED:
            await ledger_activate_contract(
                db, section.contract.id, activated_by=current_user.id
            )

        if section.contract.status == ContractStatus.ACTIVE:
            await ledger_finalize_grades(db, section_id=section.id)

        if section.contract.status == ContractStatus.GRADES_SUBMITTED:
            await ledger_settle_contract(
                db, section.contract.id, settled_by=current_user.id
            )
    except ValueError:
        pass
```

**Why**: This automatically progresses the contract from wherever it is (ASSIGNED/ACTIVE/GRADES_SUBMITTED) to SETTLED when the section is completed. If preconditions for any step are missing (no price, ungraded students, etc.), the ValueError is caught and the section still completes — financial settlement can be resolved separately.

**Edge cases handled**:
- Contract is DRAFT/CANCELLED — no status match, section completes without settlement (correct)
- Contract has no teacher_id — activate_contract raises ValueError, caught by except block
- Section has no contract — the `if section.contract` guard prevents execution
- Missing activation preconditions (no price, start_date, class_time) — ValueError caught, section still completes

---

### Phase 3: Hide overdue banner for completed sections

**File**: `frontend/app/[locale]/(dashboard)/dashboard/sections/[sectionId]/page.tsx`, line 552

**Change**: Add completed status check alongside the existing cancelled check:
```tsx
if (section.status === "cancelled" || section.status === "completed") return null;
```

**Why**: A completed section should not show "X days past end date" warnings.

**Risk**: Low

---

### Phase 4: Remediate existing stuck records

**Problem**: Sections already at `"completed"` with contracts at `ASSIGNED` need retroactive settlement.

**Action**: Run a one-time script or expose an admin endpoint that:
1. Finds all sections with `status = "completed"` AND contract status IN (`"assigned"`, `"active"`)
2. Chains the contract lifecycle (same logic as Phase 2)
3. Logs results (settled vs skipped with reason)

**SQL to find stuck records**:
```sql
SELECT cs.id, cs.name, sc.status as contract_status
FROM course_sections cs
JOIN section_contracts sc ON sc.section_id = cs.id
WHERE cs.status = 'completed'
  AND sc.status IN ('assigned', 'active');
```

## Verification

### Before/After
| Scenario | Before | After |
|----------|--------|-------|
| Section past end, all graded, contract ASSIGNED | Complete returns None | Section completes, contract → SETTLED |
| Section past end, all graded, contract ACTIVE | Settlement skipped | Section completes, contract → SETTLED |
| Section past end, all graded, contract GRADES_SUBMITTED | Works | Works (unchanged) |
| Section active, not past end | Works | Works (unchanged) |
| Completed section overdue banner | Shows warning | Hidden |
| Contract DRAFT/CANCELLED on complete | No change | No change (correct) |

### Manual test
1. Create section, set end_date to yesterday, assign all grades
2. Verify startup checks set status to `ready_for_completion`
3. Click Complete — section should complete and contract should become SETTLED
4. Verify teacher wallet shows unfrozen credited amount
5. Verify overdue warning banner is gone
