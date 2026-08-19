# Unenrollment & Refund — Implementation Plan

**Date:** 2026-07-11
**Status:** Draft for Review
**Author:** Technical Team

---

## 1. Problem Statement

The system currently has two mechanisms for removing a student from a section, neither of which handles individual unenrollment with refund properly:

#### 1.1 Soft-Delete Enrollment (Current — Defective)

`DELETE /academic/enrollments/{id}` performs a soft-delete (`deleted_at = now()`), decrements `enrolled_count`, but:

- **Silent financial orphaning** — Payments remain linked to a soft-deleted enrollment with no reversal, refund, or audit. Teacher's `PAYMENT_SHARE` entries are never reversed.
- **No teacher ledger reversal** — `PAYMENT_SHARE` entries remain in the teacher's wallet, creating accounting discrepancies.
- **No refund** — Paid students lose their money with zero recourse.
- **No audit trail** — No record of who unenrolled the student, why, or what financial state existed at the time.

#### 1.2 Full Section Cancellation (Correct, but Wrong Scope)

`POST /academic/course-sections/{id}/cancel` handles refunds properly (teacher wallet reversal, `PendingRefund` creation, audit trail), but is a **section-level** operation. It cannot be used to unenroll a single student while leaving the section running.

#### 1.3 Gaps Summary

| Gap | Severity | Impact |
|-----|----------|--------|
| No individual unenrollment with refund | HIGH | Paid students cannot leave a section without financial loss |
| Soft-delete silently orphans financial records | HIGH | Teacher overpaid, student unreimbursed, no audit trail |
| Teacher wallet retains unearned shares after unenrollment | HIGH | Overpays teachers for work not delivered |
| No audit trail for individual unenrollments | MEDIUM | Cannot trace who, when, or why |
| No refund receipt for individual unenrollment | MEDIUM | Student has no paper record of refund |

---

## 2. Objectives

### Primary Objective
Implement individual student unenrollment with optional refund processing:

1. **Graceful unenrollment** — Replace the broken soft-delete with a formal unenrollment flow that handles all edge cases (with/without payments, with/without attendance, with/without grades).

2. **Refund authorization** — When a student with payments is unenrolled, the secretary/manager can authorize a refund (full or partial) that creates a `PendingRefund` liability.

3. **Teacher wallet reversal** — Reverse `PAYMENT_SHARE` ledger entries for the unenrolled student proportionally. The teacher's balance must reflect that the student is no longer in the section.

4. **Audit trail** — Every unenrollment records: who, when, which student, which section, reason, financial snapshot (total paid, refund authorized), and whether refund was authorized.

5. **Existing cashier disbursement flow reuse** — Refund authorizations from individual unenrollment flow into the same `PendingRefund` → `disburse` pipeline used for section cancellation refunds.

### Success Metrics
- 100% of unenrollments with payments either authorize a refund or record a deliberate "no refund" decision with reason
- Teacher wallet balance is always consistent after unenrollment (total shares = sum across current enrollments only)
- No enrollment is soft-deleted without a corresponding audit record and teacher reversal
- Full audit trail for every unenrollment event

---

## 3. Proposed Solutions

### 3.1 Unenrollment vs Cancel — Clarification

| Concept | Scope | Terminal? | Use Case |
|---------|-------|-----------|----------|
| **Cancel Section** | Entire section | Yes | Section stops permanently. All students removed. Full financial handling. |
| **Unenroll Student** | Single student | Yes | One student leaves. Section continues. Partial financial handling. |
| **Deactivate Section** | Entire section | No | Accidental activation undone. Section returns to pending. |

**Unenrollment is the individual-level analogue of section cancellation.**

### 3.2 Unenrollment Financial Logic

The financial impact depends on the student's payment state:

#### Case A: Student Has NOT Paid
- No financial action needed
- `enrolled_count` decremented
- `deleted_at` set
- Audit record created (zero financial entries)

#### Case B: Student Has Paid (Refund Authorized)
1. Capture financial snapshot before mutation:
   - Total amount paid by this student for this enrollment
   - Teacher's share of those payments (section's teacher_percentage × payments)
   - Remaining section balance (agreed_price - admin_discount - total_paid)
2. Reverse teacher `PAYMENT_SHARE` entries for this student's payments
   - Create `REVERSAL` ledger entries matching the total teacher share
   - Teacher wallet may go negative — no balance check required
3. Create `PendingRefund` for the full amount paid (or partial, as authorized)
4. Set `enrollment.deleted_at = now()`
5. Decrement `section.enrolled_count`
6. Create `UnenrollmentRecord` audit entry

#### Case C: Student Has Paid (No Refund — Deliberate Decision)
1. No `PendingRefund` created
2. Teacher share may or may not be reversed (manager decision captured in reason)
3. Set `enrollment.deleted_at = now()`
4. Decrement `section.enrolled_count`
5. Create `UnenrollmentRecord` audit entry with "no_refund" policy + reason

### 3.3 Teacher Wallet Reversal Details

**Current invariant:** Every `PAYMENT_SHARE` entry has a `reference_id` pointing to the `Payment` record. This makes it possible to identify all shares attributable to a specific enrollment's payments.

**Reversal query:**
```sql
-- Find all PAYMENT_SHARE entries linked to payments for this enrollment
SELECT le.* FROM ledger_entries le
JOIN payments p ON p.id = le.reference_id
WHERE p.enrollment_id = :enrollment_id
  AND le.type = 'PAYMENT_SHARE';
```

**Reversal constraint:** None. Teacher wallets may go negative after reversal. This is expected — the teacher received funds for a student who later left, and negative tracking ensures the ledger reflects the true liability. Teacher wallets should be reconciled periodically (e.g., at settlement or term-end) rather than blocking individual unenrollments.

### 3.4 `REFUND_DISBURSEMENT` Ledger Entry

The existing `LedgerEntryType.REFUND_DISBURSEMENT` enum value exists but is **never written**. This plan activates it:

At the moment of disbursement (cashier hands cash), a ledger entry is created:
```python
LedgerEntry(
    wallet_id=institute_wallet_id,  # Or institute revenue account
    type=REFUND_DISBURSEMENT,
    total_amount=-amount,  # Negative: money leaving the institute
    available_delta=-amount,
    reference_type="pending_refund",
    reference_id=pending_refund.id,
    narrative=f"Refund disbursement for unenrolled student {student_name}",
)
```

This ensures the ledger always reflects the true revenue position.

---

## 4. New Data Model Changes

### 4.1 UnenrollmentRecord Table (Audit Trail)

```sql
CREATE TYPE unenrollment_refund_policy AS ENUM ('authorize_refund', 'no_refund');

CREATE TABLE unenrollment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id),
    section_id UUID NOT NULL REFERENCES course_sections(id),
    student_id UUID NOT NULL REFERENCES students(id),
    unenrolled_by UUID NOT NULL REFERENCES users(id),
    unenrolled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reason TEXT NOT NULL,
    refund_policy unenrollment_refund_policy NOT NULL,
    total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
    teacher_share_reversed NUMERIC(12, 2) NOT NULL DEFAULT 0,
    refund_authorized_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    has_attendance_records BOOLEAN NOT NULL DEFAULT false,
    has_grades BOOLEAN NOT NULL DEFAULT false,
    notes TEXT
);
```

### 4.2 UnenrollmentOverride Table (Force Audit)

```sql
CREATE TABLE unenrollment_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unenrollment_record_id UUID NOT NULL REFERENCES unenrollment_records(id),
    overridden_by UUID NOT NULL REFERENCES users(id),
    overridden_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    override_type VARCHAR(50) NOT NULL,  -- 'force_unenroll_with_grades'
    reason TEXT NOT NULL,
    teacher_wallet_balance_before NUMERIC(12, 2) NOT NULL,
    reversal_amount NUMERIC(12, 2) NOT NULL
);
```

### 4.3 PendingRefund Enhancement

Add `source` column to distinguish refund origin:

```sql
ALTER TYPE refund_source ADD VALUE IF NOT EXISTS 'unenrollment';
ALTER TABLE pending_refunds ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'cancellation';
ALTER TABLE pending_refunds ADD COLUMN unenrollment_record_id UUID REFERENCES unenrollment_records(id);
```

### 4.4 No FK Constraint Change Needed

The existing `Payment.enrollment_id` FK with `ondelete="RESTRICT"` is safe. The current soft-delete is an `UPDATE` (`SET deleted_at = now()`), not a `DELETE` — PostgreSQL FK constraints only fire on actual row deletion. The `RESTRICT` constraint stays unchanged.

### 4.5 Partial Unique Index for Re-Enrollment

If a student who was unenrolled needs to re-enroll in the same section, the current unique constraint `uq_enrollments_student_section` on `(student_id, section_id)` blocks it because the soft-deleted row still exists. Instead of a workaround table, replace the constraint with a **PostgreSQL Partial Unique Index**:

```sql
-- Drop the existing unique constraint
ALTER TABLE enrollments DROP CONSTRAINT uq_enrollments_student_section;

-- Create a partial unique index — only active enrollments count toward uniqueness
CREATE UNIQUE INDEX uq_active_enrollment
    ON enrollments (student_id, section_id)
    WHERE deleted_at IS NULL;
```

This elegantly allows unlimited soft-deleted (unenrolled) records for a student/section pair while guaranteeing only one active enrollment at any time. The `name_identification` logic must be updated to filter `deleted_at IS NULL` when matching existing enrollments.

---

## 5. State & Flow Diagrams

### 5.1 Unenrollment State Machine

```
┌──────────────┐     Unenroll Student     ┌──────────────────┐
│   Enrolled   │ ───────────────────────► │  Unenrolled (sd) │
│  (active)    │                          │  deleted_at=now  │
└──────────────┘                          └──────────────────┘
       │                                         │
       │                                         │
       ▼                                         ▼
  [Check Payments]                       [Audit Record Created]
       │                                    unenrollment_records
       │
       ├── Has Payments ──► [Refund Decision]
       │                          │
       │                     ├── Authorize ──► PendingRefund (UNCLAIMED)
       │                     │                    │
       │                     │               [Cashier Disburses]
       │                     │                    │
       │                     │               PendingRefund → CLAIMED
       │                     │               Refund receipt generated
       │                     │               Ledger: REFUND_DISBURSEMENT entry
       │                     │
       │                     └── No Refund ──► Record reason
       │
       └── No Payments ──► Soft-delete only
```

### 5.2 Unenrollment Flow — Detailed

```
Secretary/Manager clicks "Unenroll"
         │
         ▼
   [Search & Select Student]
   - Search by name, phone, or student code
   - Select the enrollment to unenroll
         │
         ▼
   [Unenrollment Preview Screen]
   - Student name, section, course
   - Financial summary:
     * Agreed price: 5,000 EGP
     * Admin discount: 10% (500 EGP)
     * Net price: 4,500 EGP
     * Total paid: 3,000 EGP
     * Remaining balance: 1,500 EGP
   - Warnings: Has attendance records, has grades
         │
         ▼
   [Refund Decision]
   ○ Authorize refund — creates PendingRefund for 3,000 EGP
   ○ No refund — student handled manually
         │
         ▼
   [Teacher Wallet Reversal]
   - Teacher share from this student: 1,200 EGP
   - Teacher wallet balance: 5,000 EGP
   - Reversal entries created (balance may go negative)
         │
         ▼
   [Reason & Confirm]
   - Required reason text
   - Summary of all actions
   - Confirm / Cancel
         │
         ▼
   Enrollment → deleted_at = now()
   Teacher wallet → PAYMENT_SHARE reversed (1,200 EGP reversal entry)
   Student payments → PendingRefund created (3,000 EGP, source: 'unenrollment')
   section.enrolled_count -= 1
   Audit → UnenrollmentRecord saved
```

---

## 6. Backend Service Design

### 6.1 New Services

#### `apps/erp/backend/app/modules/academic/unenrollment_service.py`

| Function | Description |
|----------|-------------|
| `can_unenroll_student(db, enrollment_id)` | Validation — checks enrollment exists, not already deleted, section not completed/cancelled |
| `preview_unenrollment_impact(db, enrollment_id)` | Returns financial snapshot: total paid, teacher share, balance, attendance/grades flags |
| `calculate_reversal_amount(db, enrollment_id)` | Queries all PAYMENT_SHARE entries linked to this enrollment's payments, sums them |
| `unenroll_student(db, enrollment_id, ...)` | Orchestrator: validate → preview internally → reverse teacher wallet → PendingRefund (if authorized) → soft-delete → audit |
| `get_student_unenrollment_history(db, student_id)` | Returns all unenrollment records for a student |
| `get_section_unenrollment_history(db, section_id)` | Returns all unenrollment records for a section |

#### `unenroll_student()` Orchestrator Signature

```python
async def unenroll_student(
    db: AsyncSession,
    enrollment_id: UUID,
    unenrolled_by: UUID,
    reason: str,
    refund_policy: Literal["authorize_refund", "no_refund"],
    refund_amount: Decimal | None = None,  # Full amount if None, partial if specified
    force: bool = False,  # Allows unenrollment when grades exist
    force_reason: str | None = None,
) -> UnenrollmentRecord:
```

**Validation Pre-Checks:**
1. Enrollment exists and `deleted_at IS NULL` ✓
2. Section is `active` or `pending` (cannot unenroll from `completed` or `cancelled`)
3. No certificates issued for this enrollment
4. If `force=False` and grades exist → warn (force to proceed)

**Transaction Flow (single DB transaction with row-level locking):**

```python
async with db.begin_nested():
    # 1. Capture snapshot
    enrollment = await db.get(Enrollment, enrollment_id)
    payments = await get_enrollment_payments(db, enrollment_id)
    total_paid = sum(p.amount for p in payments)
    teacher_share = await calculate_reversal_amount(db, enrollment_id)

    # 2. Reverse teacher wallet (no balance check — wallets may go negative)
    if teacher_share > 0:
        await ledger_service.reverse_teacher_shares(
            db,
            enrollment_id=enrollment_id,
            amount=teacher_share,
            reversed_by=unenrolled_by,
        )

    # 3. Create PendingRefund (if authorized)
    if refund_policy == "authorize_refund":
        actual_refund = refund_amount or total_paid
        pending_refund = PendingRefund(
            enrollment_id=enrollment_id,
            amount=actual_refund,
            status="UNCLAIMED",
            source="unenrollment",
        )
        db.add(pending_refund)

    # 4. Soft-delete enrollment
    enrollment.deleted_at = func.now()
    section = await db.get(CourseSection, enrollment.section_id)
    section.enrolled_count = func.greatest(section.enrolled_count - 1, 0)

    # 5. Audit
    record = UnenrollmentRecord(
        enrollment_id=enrollment_id,
        section_id=enrollment.section_id,
        student_id=enrollment.student_id,
        unenrolled_by=unenrolled_by,
        reason=reason,
        refund_policy=refund_policy,
        total_paid=total_paid,
        teacher_share_reversed=teacher_share,
        refund_authorized_amount=actual_refund if refund_policy == "authorize_refund" else 0,
        has_attendance_records=has_attendance,
        has_grades=has_grades,
    )
    db.add(record)
```

**Note on concurrency:** No `SELECT ... FOR UPDATE` or balance check is needed. The reversal always creates `REVERSAL` ledger entries regardless of the current wallet balance. A concurrent teacher withdrawal during unenrollment is harmless — both operations succeed and the negative balance (if any) is tracked by the ledger as an institutional receivable.

### 6.2 Ledger Service Changes

**New function in `ledger_service.py`:**

```python
async def reverse_teacher_shares(
    db: AsyncSession,
    enrollment_id: UUID,
    amount: Decimal,
    reversed_by: UUID,
) -> list[LedgerEntry]:
    """
    Reverse all PAYMENT_SHARE ledger entries attributable to
    payments belonging to this enrollment.

    Creates REVERSAL entries that mirror the original PAYMENT_SHARE
    entries with negative deltas.

    No balance check — teacher wallets may go negative. Negative
    balances are reconciled periodically (e.g., at settlement or term-end).

    Pre-condition: enrollment has payments
    """
```

**Existing function to update:** No changes to `cancel_contract()` — it handles section-level reversals. The new function is enrollment-specific.

### 6.3 PendingRefund Source Tracking

The existing `PendingRefund` model and cashier disbursement flow is reused. The only addition is the `source` column and optional `unenrollment_record_id` FK:

| PendingRefund.source | Origin | Disbursement flow |
|---------------------|--------|-------------------|
| `cancellation` | Section cancelled | Same cashier dashboard |
| `unenrollment` | Student unenrolled | Same cashier dashboard |

The cashier dashboard filter should show both sources.

---

## 7. API Endpoints

### 7.1 New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/academic/enrollments/{id}/unenroll-preview` | secretary/manager | Preview unenrollment impact (financial snapshot, warnings) |
| `POST` | `/academic/enrollments/{id}/unenroll` | secretary/manager | Execute unenrollment with refund decision |
| `GET` | `/academic/enrollments/unenrollment-history` | manager/superadmin | All unenrollment records (paginated, filterable) |
| `GET` | `/academic/students/{id}/unenrollment-history` | secretary/manager | Student's unenrollment history |
| `GET` | `/academic/sections/{id}/unenrollment-history` | secretary/manager | Section's unenrollment history |
| `GET` | `/academic/unenrollments/{id}` | secretary/manager | Single unenrollment record detail |

### 7.2 Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `DELETE /academic/enrollments/{id}` | Deprecated — replaced by `POST .../unenroll`. Keep for backward compatibility but add warning response. Restrict to superadmin only, or remove. |

### 7.3 Existing Cashier Endpoints (No Change — Reused)

| Method | Path | Reused For |
|--------|------|------------|
| `GET` | `/lms/cashier/pending-refunds` | Shows unenrollment-origin refunds too |
| `POST` | `/lms/cashier/pending-refunds/{id}/disburse` | Same disbursement flow |
| `GET` | `/lms/cashier/refunds` | Includes unenrollment-origin refunds |

---

## 8. Frontend Changes

### 8.1 Enrollment List Page (`/dashboard/enrollments`)

| Change | Description |
|--------|-------------|
| **Replace delete button** | "Delete" becomes "Unenroll" with a warning icon |
| **Add column** | "Actions" with "Unenroll" button (disabled for already-deleted enrollments) |
| **Search enhancement** | Add student phone and code to enrollment search |

### 8.2 Unenroll Modal (New — Multi-Step)

**Step 1 — Student & Enrollment Selection:**
- Student info (name, phone, code)
- Section info (name, course, dates)
- Payment summary (agreed price, discounts, total paid, balance)

**Step 2 — Impact Preview:**
- Financial impact summary:
  - Total paid by student: 3,000 EGP
  - Teacher share to reverse: 1,200 EGP
  - Teacher wallet balance: 5,000 EGP (will decrease by 1,200 EGP)
  - Refund to authorize: 3,000 EGP
- Warnings:
  - ⚠ Student has attendance records
  - ⚠ Student has entered grades

**Step 3 — Refund Decision:**
- ○ Full refund (3,000 EGP) [default]
- ○ Partial refund (specify amount)
- ○ No refund

**Step 4 — Reason & Confirm:**
- Reason text (required)
- Notes (optional)
- Force override checkbox (if grades exist)
- Force reason text (required if force checked)
- Confirm/Cancel buttons

### 8.3 Section Detail Page Changes

| Change | Description |
|--------|-------------|
| **Student row action** | "Unenroll" button in the enrolled students table |
| **Unenrollment history** | Collapsible section showing past unenrollments for this section |
| **Enrolled count** | Shows active enrolled count (excluding deleted) |

### 8.4 Student Profile Page Changes

| Change | Description |
|--------|-------------|
| **Unenrollment history** | Tab or section showing past unenrollments with reason, refund status |
| **Pending refund badge** | Already exists — works for unenrollment-origin refunds too |
| **Re-enroll button** | If unenrolled from a section, allow re-enrollment (partial unique index allows a new active record) |

### 8.5 Manager Dashboard

| Change | Description |
|--------|-------------|
| **Unenrollment log** | New card/widget showing recent unenrollments |
| **Pending refunds count** | Include unenrollment-origin in badge count |

### 8.6 Cashier Dashboard (No Change)

The existing cashier dashboard already handles `PendingRefund` records regardless of source. Unenrollment-origin refunds appear automatically.

---

## 9. Implementation Phases

### Phase 1: Database Schema & Models

| Task | Estimate |
|------|----------|
| Create `UnenrollmentRecord` model + `unenrollment_refund_policy` enum | 0.5 day |
| Create `UnenrollmentOverride` model | 0.25 day |
| Add `source` column and `unenrollment_record_id` FK to `PendingRefund` | 0.25 day |
| Add `REFUND_SOURCE_UNENROLLMENT` to enum | 0.1 day |
| Drop `uq_enrollments_student_section` constraint, create partial unique index `uq_active_enrollment` | 0.25 day |
| Alembic migrations for all the above | 0.5 day |
| **Subtotal** | **1.6 days** |

### Phase 2: Backend — Unenrollment Service

| Task | Files | Estimate |
|------|-------|----------|
| Implement `can_unenroll_student()` validation | `apps/erp/backend/app/modules/academic/unenrollment_service.py` | 0.25 day |
| Implement `calculate_reversal_amount()` — sum PAYMENT_SHARE by enrollment payments | `unenrollment_service.py` | 0.25 day |
| Implement `preview_unenrollment_impact()` — financial snapshot + warnings | `unenrollment_service.py` | 0.5 day |
| Implement `reverse_teacher_shares()` in ledger service | `apps/erp/backend/app/modules/lms/ledger_service.py` | 0.5 day |
| Implement `unenroll_student()` orchestrator (validate → reverse → PendingRefund → soft-delete → audit) | `unenrollment_service.py` | 1 day |
| Implement `get_student_unenrollment_history()`, `get_section_unenrollment_history()` | `unenrollment_service.py` | 0.25 day |
| Write `REFUND_DISBURSEMENT` ledger entry in cashier `disburse_pending_refund()` | `apps/erp/backend/app/modules/lms/cashier_service.py` | 0.25 day |
| **Subtotal** | | **3 days** |

### Phase 3: Backend — API Endpoints

| Task | Files | Estimate |
|------|-------|----------|
| `GET /academic/enrollments/{id}/unenroll-preview` | `apps/erp/backend/app/modules/academic/router.py` | 0.5 day |
| `POST /academic/enrollments/{id}/unenroll` | `router.py` | 0.5 day |
| `GET /academic/enrollments/unenrollment-history` | `router.py` | 0.25 day |
| `GET /academic/students/{id}/unenrollment-history` | `router.py` | 0.25 day |
| `GET /academic/sections/{id}/unenrollment-history` | `router.py` | 0.25 day |
| `GET /academic/unenrollments/{id}` | `router.py` | 0.1 day |
| Deprecate `DELETE /academic/enrollments/{id}` | `router.py` | 0.25 day |
| Add `source` filter to cashier pending-refunds endpoint | `apps/erp/backend/app/modules/lms/router.py` | 0.25 day |
| **Subtotal** | | **2.35 days** |

### Phase 4: Frontend — Unenroll Modal

| Task | Estimate |
|------|----------|
| Step 1: Student & enrollment info display | 0.5 day |
| Step 2: Impact preview with financial snapshot + warnings | 0.5 day |
| Step 3: Refund decision (full, partial, none) | 0.5 day |
| Step 4: Reason, force override, confirm | 0.5 day |
| API integration (preview call, execute call, error handling) | 0.5 day |
| **Subtotal** | **2.5 days** |

### Phase 5: Frontend — Pages & Components

| Task | Estimate |
|------|----------|
| Replace delete button with Unenroll in enrollment list | 0.25 day |
| Unenrollment history section in section detail page | 0.5 day |
| Unenrollment history tab in student profile | 0.5 day |
| Re-enroll flow handling (partial unique index allows re-enrollment) | 0.25 day |
| Manager dashboard: unenrollment log widget | 0.5 day |
| Bilingual (ar/en) support for all new UI strings | 0.5 day |
| **Subtotal** | **2.75 days** |

### Phase 6: Edge Cases & Reconciliation

| Task | Estimate |
|------|----------|
| Block unenrollment if certificates issued for this enrollment | 0.25 day |
| Handle unenrollment on a closed financial day (daily closure check) | 0.5 day |
| Idempotency guard: prevent double-unenrollment of same enrollment | 0.25 day |
| Handle partial refund: remaining balance vs total paid logic | 0.5 day |
| Ensure `unenroll_student()` is within a single DB transaction | 0.25 day |
| Verify partial unique index allows clean re-enrollment after unenrollment | 0.25 day |
| Update `enrolled_count` consistency check (cron or startup check) | 0.5 day |
| **Subtotal** | **2.5 days** |

### Phase 7: Testing

| Task | Estimate |
|------|----------|
| Unit tests: `can_unenroll_student()` validations (already deleted, completed section, etc.) | 0.25 day |
| Unit tests: `calculate_reversal_amount()` — correct PAYMENT_SHARE aggregation | 0.25 day |
| Unit tests: `reverse_teacher_shares()` — ledger entries created correctly | 0.5 day |
| Unit tests: `unenroll_student()` — no payments case | 0.25 day |
| Unit tests: `unenroll_student()` — with payments, refund authorized | 0.5 day |
| Unit tests: `unenroll_student()` — with payments, no refund | 0.25 day |
| Unit tests: `unenroll_student()` — force override with grades | 0.25 day |
| Unit tests: `REFUND_DISBURSEMENT` ledger entry on disbursement | 0.25 day |
| Integration tests: full unenrollment flow (enroll → pay → unenroll → verify teacher reversal + PendingRefund) | 1 day |
| Integration tests: cashier disburses unenrollment refund → verify receipt + ledger entry | 0.5 day |
| Integration tests: re-enrollment after unenrollment | 0.5 day |
| Integration tests: closed day blocks unenrollment with refund | 0.5 day |
| E2E tests: unenrollment modal flow (steps 1-4) | 0.5 day |
| E2E tests: cashier dashboard shows unenrollment refunds | 0.25 day |
| **Subtotal** | **5.5 days** |

---

## 10. Total Estimate

| Phase | Days |
|-------|------|
| Phase 1: Database Schema & Models | 1.6 |
| Phase 2: Backend — Unenrollment Service | 3.0 |
| Phase 3: Backend — API Endpoints | 2.35 |
| Phase 4: Frontend — Unenroll Modal | 2.5 |
| Phase 5: Frontend — Pages & Components | 2.5 |
| Phase 6: Edge Cases & Reconciliation | 2.5 |
| Phase 7: Testing | 5.5 |
| **Total** | **~20.0 days** |

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Teacher wallet goes negative after PAYMENT_SHARE reversal | LOW | Expected behavior — negative balance represents an institutional receivable. Reconciled periodically at settlement or term-end. |
| Unenrollment on closed financial day | MEDIUM | Check `is_date_closed()` before processing. Block refund authorization if the payment date falls on a closed day. |
| Partial refund miscalculation | MEDIUM | Clear validation: refund amount must be > 0 and <= total_paid. No negative or zero refunds. |
| Double-unenrollment of same enrollment | MEDIUM | Pre-check `deleted_at IS NULL`. Idempotency guard raises clear error. |
| Student re-enrolls after unenrollment — unique constraint | MEDIUM | Partial unique index `WHERE deleted_at IS NULL` naturally allows re-enrollment. Old enrollment stays soft-deleted, new enrollment created. |
| `REFUND_DISBURSEMENT` ledger entry breaks existing reports | LOW | New entry type. Reports must be updated to include it, but existing queries continue to work. |
| Cashier cannot distinguish refund source | LOW | `PendingRefund.source` column added. UI filter available. |
| Section enrolled_count gets out of sync | MEDIUM | `unenroll_student()` decrements atomically. Startup check can audit counts as safety net. |

---

## 12. Dependencies

| Dependency | For | Status |
|------------|-----|--------|
| Existing `PendingRefund` model + cashier disbursement flow | Refund processing after unenrollment | Already implemented |
| Existing `disburse_pending_refund()` service | Cashier disburses refund | Already implemented (needs `REFUND_DISBURSEMENT` ledger entry) |
| Existing `LedgerEntryType.REFUND_DISBURSEMENT` | Track refund in ledger | Enum exists, not yet used |
| Existing `LedgerEntryType.REVERSAL` | Reverse teacher shares | Already implemented |
| Existing `daily_closures` system | Block unenrollment on closed days | Already implemented |
| New PostgreSQL migrations | All new tables, enums, columns | Pending |
| `get_today()` from `app.core.timezone` | Institute-local date checks | From timezone-proxy infrastructure |

---

## 13. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **New service, not added to existing enrollment service** | Unenrollment has distinct concerns (refund, ledger reversal, audit) that don't belong in basic CRUD. Single Responsibility. |
| **Keep `ondelete="RESTRICT"` unchanged** | The existing FK constraint only fires on a SQL `DELETE`, not an `UPDATE` like `SET deleted_at`. The soft-delete works correctly with RESTRICT. No FK change is needed. |
| **Reuse existing `PendingRefund` → `disburse` pipeline** | Avoids rebuilding the cashier disbursement flow. Unenrollment-origin refunds flow through the same tested pipeline. One code path for all refunds. |
| **`source` column on `PendingRefund`** | Distinguishes unenrollment from cancellation refunds for reporting without separate tables. |
| **Full refund default, partial optional** | Simplifies the common case. Most unenrollment refunds are for the full amount paid. Partial is available as an explicit choice. |
| **Teacher reversal is separate from student refund** | The teacher's share and the student's payment are distinct concepts. Teacher wallet reversal removes unearned compensation. Student refund returns the student's money. They happen in the same operation but are independent values. |
| **No balance check on teacher wallet reversal** | Teacher wallets may go negative. The negative balance is an institutional receivable tracked by the ledger. No `SELECT ... FOR UPDATE` or sufficiency check needed — the reversal is always permitted. Periodic reconciliation at settlement or term-end resolves negative balances. |
| **`force=true` retained for grades override only** | The `force` parameter is kept exclusively for the case where the student has entered grades. Teacher shortfall is no longer a blocking condition, so no force override is needed for it. |
| **Block if certificates exist** | Certificate is a legal/educational record. Cannot auto-revoke. Manager must handle manually first (revoke certificate, then unenroll). |
| **No pro-rata refund calculation** | Unenrollment is student-initiated or secretary-initiated. Pro-rata for partial attendance is a business policy decision, not a technical one. The system supports full or partial fixed amounts. Pro-rata can be added as a calculation rule later. |
| **Partial unique index for re-enrollment** | Replaces the standard unique constraint with `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`. Eliminates the need for a workaround table — the database naturally allows multiple soft-deleted records while enforcing one active enrollment. |

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **Unenroll Student** | Remove a single student from a section with financial handling (teacher reversal, optional refund). Individual-level operation. |
| **Cancel Section** | Stop an entire section. All students removed. Full financial handling at section level. |
| **UnenrollmentRecord** | Audit trail for a single unenrollment event — who, when, why, financial snapshot. |
| **UnenrollmentOverride** | Audit record when a `force=true` override is used to bypass a safety guard (e.g., grades exist on the enrollment). |
| **Teacher Share Reversal** | `REVERSAL` ledger entries that negate the `PAYMENT_SHARE` entries created for a now-unenrolled student's payments. |
| **PendingRefund (source: unenrollment)** | An authorized-but-undisbursed refund liability created during unenrollment. Uses the same cashier disbursement pipeline as cancellation refunds. |
| **Partial Unique Index** | `CREATE UNIQUE INDEX uq_active_enrollment ON enrollments (student_id, section_id) WHERE deleted_at IS NULL`. Allows unlimited soft-deleted records while enforcing one active enrollment per student per section. |
| **REFUND_DISBURSEMENT** | Ledger entry type recording the actual cash outflow when a refund is disbursed. Already defined in enum, now activated. |
