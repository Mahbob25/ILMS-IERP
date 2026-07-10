# Section Lifecycle Complete — Implementation Plan

**Date:** 2026-07-10
**Status:** Draft for Review
**Author:** Technical Team

---

## Architectural Directive: Startup-Driven Pattern

The physical server is powered down at night and manually booted each morning. **No time-based scheduler exists.** All daily checks run immediately in the FastAPI `lifespan` startup event. Key principles:

| Principle | Implementation |
|-----------|---------------|
| **No cron/APScheduler/Celery** | Zero scheduling dependencies. The lifespan event is the only trigger. |
| **Boot-time execution** | Checks run the moment uvicorn starts. No timers, no "wait until midnight". |
| **Idempotency via `daily_jobs_log`** | Each job runs at most once per calendar date. Mid-day reboots are safe. |
| **Date-based scanning** | Queries use `WHERE end_date <= get_today()` — catches ALL overdue sections regardless of how many days the server was offline. |
| **Institute-local timezone** | All date calculations use `get_today()` from `app.core.timezone` (Asia/Riyadh), not `date.today()`. |

---

## 1. Problem Statement

The system currently has 3 section statuses (`pending` → `active` → `completed`) with no automated lifecycle management and only soft-delete as a stop mechanism. Several critical gaps exist:

#### 1.1 No Duration Expiry Handling
`start_date` and `end_date` are purely cosmetic — used only in certificate display text. There is **no cron job, scheduler, or background task** that checks these dates. Sections past their end date remain `active` indefinitely until a human manually triggers completion.

**Impact:** Teachers continue accruing payment shares on past-due sections. No certificates are auto-generated. Managers must manually track and close every section.

#### 1.2 No Grade Enforcement
Section completion does not require final grades to be entered unless a teacher contract exists. Without a contract, `complete_section()` completes the section with zero grade checks.

**Impact:** Students can receive certificates without having a final score recorded. Educational records are incomplete.

#### 1.3 No Payment Enforcement
Section completion has no relationship to student payment status. A section with students owing outstanding balances can be completed and certificates issued.

**Impact:** The institute loses leverage to collect unpaid fees. There is no automated reminder or blocking mechanism for unpaid enrollments on completed sections.

#### 1.4 No Cancelled Status — Only Soft-Delete
The only way to stop a section is soft-delete (`deleted_at`), which:
- Hides all section data from reports
- Leaves orphaned financial records (teacher wallet credits, student payments)
- Provides no audit trail (who deleted, why, what state it was in)
- Cannot be distinguished from "completed" in historical data
- Offers no refund pathway for students who paid

#### 1.5 No Deactivation (Undo Accidental Activation)
Once a section is `active`, it cannot return to `pending`. There is no way to correct an accidental activation without deleting the section entirely.

#### 1.6 No Automated Reminders or Warnings
There is no system to:
- Warn managers when a section is approaching its end date without grades submitted
- Alert secretaries about unpaid enrollments
- Flag overdue sections that need attention
- Notify teachers about pending grade submission deadlines

---

## 2. Objectives

### Primary Objective
Implement a complete section lifecycle management system that:

1. **Detects duration expiry on server startup** — The server checks for overdue sections the moment it boots up in the morning using the FastAPI lifespan event.

2. **Flags sections as "Ready for Completion"** — Instead of auto-settling contracts (which would mutate financial ledgers without an authenticated user), the startup job surfaces overdue sections to managers for manual completion.

3. **Enforces grade completeness with NULL vs. 0 distinction** — Only missing grades (NULL) block completion. A valid failing grade (0) is accepted as a complete record.

4. **Integrates payment status** — Warn/block completion for sections with outstanding balances; provide payment deadline reminders.

5. **Replaces soft-delete with formal cancellation** — A `cancelled` status that preserves records, reverses teacher wallet entries, provides an optional two-phase student refund pathway (authorization → cashier disbursement), and maintains a full audit trail.

6. **Adds deactivation** — Allow sections to return from `active` to `pending` for accidental activations, with financial safeguards.

7. **Adds proactive notifications** — Dashboard warnings and alerts for sections approaching their end date with incomplete grades or payments.

### Success Metrics
- Zero sections remain `active` past their `end_date` without manager awareness
- 100% of completed sections have final grades for all enrolled students (either a valid score or NULL explicitly resolved)
- All unpaid enrollments are flagged before section completion
- Full audit trail for every cancelled section, every deactivation, and every override (who, when, why)
- Soft-delete is no longer used as a stop mechanism; all stopped sections are visible with a `cancelled` status

---

## 3. Proposed Solutions

### 3.1 Section Status Model — Extended

```
pending ──► active ──► ready_for_completion ──► completed
  │            │
  │            ├──► deactivated ──► (returns to pending)
  │            │
  │            └──► cancelled (terminal)
  │
  └──► cancelled (terminal, before activation)
```

| Status | Description | Terminal |
|--------|-------------|----------|
| `pending` | Default. Section created, not yet running. | No |
| `active` | Section is running. Attendance, grades, payments allowed. | No |
| `ready_for_completion` | Duration expired, all grades entered. Awaiting manager to complete. | No |
| `completed` | Section finished successfully. Certificates issued. | Yes |
| `cancelled` | Section stopped before completion. Financial entries reversed. | Yes |
| `deactivated` | Temporary. Returns to `pending` after reversal. | No |

**Why `ready_for_completion`?** Financial ledger mutations (contract settlement, holdback unfreeze) must never occur invisibly via a system user. Every financial action must be tied to an authenticated manager session that respects daily closure locks. The ready state makes this explicit: the system flags, the manager executes.

### 3.2 Solution: Startup-Driven Daily Checks (No Cron/APScheduler/Celery)

**Architectural Directive:** The server is powered down at night. Traditional time-based schedulers (cron, APScheduler, Celery) must not be used. Instead, trigger daily checks via the FastAPI `@asynccontextmanager` lifespan event.

**New component:** `backend/app/modules/academic/section_startup_checks.py`

**Logic (runs on every boot, no timer):**

```python
from app.core.timezone import get_today

# Called from FastAPI lifespan event on every server boot
async def run_daily_section_checks(db: AsyncSession):
    today = get_today()  # Institute-local date (Asia/Riyadh)

    # 1. Idempotency gate — check daily_jobs_log
    already_ran = await db.execute(
        select(daily_jobs_log).where(
            daily_jobs_log.job_name == "section_daily_check",
            daily_jobs_log.last_run_date == today,
        )
    )
    if already_ran.scalar_one_or_none():
        return  # Already ran today; skip (safe on mid-day reboot)

    # 2. Find overdue active sections
    # Uses < today (date-based) not datetime-based — catches ALL
    # overdue sections even if server was offline for multiple days.
    overdue_sections = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date < today,
            CourseSection.deleted_at.is_(None),
        )
    )

    for section in overdue_sections.scalars().all():
        # 3. Check grade completeness (NULL vs 0 handled separately — see §3.3)
        ungraded = await count_ungraded_students(db, section.id)

        if ungraded == 0:
            section.status = "ready_for_completion"
        else:
            section.flags = section.flags or {}
            section.flags["overdue"] = True
            section.flags["ungraded_count"] = ungraded

    # 4. Find upcoming deadlines (warning zone)
    warning_date = today + timedelta(days=overdue_warning_days_before)
    upcoming = await db.execute(
        select(CourseSection).where(
            CourseSection.status == "active",
            CourseSection.end_date <= warning_date,
            CourseSection.end_date >= today,
            CourseSection.deleted_at.is_(None),
        )
    )
    for section in upcoming.scalars().all():
        section.flags = section.flags or {}
        section.flags["approaching_end"] = True

    # 5. Record run in daily_jobs_log
    db.add(daily_jobs_log(job_name="section_daily_check", last_run_date=today))
    await db.commit()
```

**Required Changes:**

| File | Change |
|------|--------|
| `backend/app/modules/academic/section_startup_checks.py` | NEW — startup check logic |
| `backend/app/main.py` | Call `run_daily_section_checks()` inside lifespan event |
| `backend/app/modules/academic/models.py` | Add `flags: JSONB` column to `CourseSection` |

**No new dependencies.** Pure Python + PostgreSQL. No APScheduler, no Celery, no Redis, no message brokers.

### 3.3 Solution: Grade Enforcement — NULL vs. 0 Distinction

**Architectural Directive:** The grade query must strictly differentiate between a failing grade (0) and a missing grade (NULL). A student with a score of 0 has a complete record and must not block section completion.

**Query logic in `complete_section()`:**

```sql
-- Count enrolled students (not soft-deleted)
SELECT COUNT(*) FROM enrollments
WHERE section_id = :sid AND deleted_at IS NULL;

-- Count students WITH a final grade (any score, including 0)
SELECT COUNT(*) FROM final_grades
WHERE section_id = :sid;

-- Identify students MISSING grades (NULL = no record)
SELECT s.id, s.full_name
FROM enrollments e
JOIN students s ON s.id = e.student_id
LEFT JOIN final_grades fg ON fg.section_id = e.section_id AND fg.student_id = e.student_id
WHERE e.section_id = :sid
  AND e.deleted_at IS NULL
  AND fg.id IS NULL;  -- Only catches truly missing grades, NOT zero-scores
```

**Changes to `complete_section()` in `academic/service.py`:**

```
current behavior:
  if contract exists AND contract.status == GRADES_SUBMITTED → proceed
  if no contract → proceed (NO GRADE CHECK)

proposed behavior:
  enrolled_count = count enrollments where deleted_at IS NULL
  graded_count = count final_grades for this section (every row counts, score can be 0)
  if enrolled_count > graded_count:
    ungraded = list of student names with NULL grade
    → raise HTTPException with list of ungraded students
  → proceed (regardless of contract existence)
```

### 3.4 Solution: Payment Integration & Enforcement

**A) Completion Block in `complete_section()`:**

```
for each enrollment with deleted_at IS NULL:
  net_price = agreed_price - (agreed_price * admin_discount / 100) if admin_discount else agreed_price
  total_paid = sum(payments for this enrollment)
  balance = net_price - total_paid
  if balance > 0:
    → add to warnings list with student name and amount

if warnings list is non-empty AND block_completion_if_unpaid is true:
  if force == false:
    → raise HTTPException listing outstanding balances
  else:
    → log override in section_completion_overrides table
    → proceed
```

**B) Payment Deadline Awareness in Startup Checks:**

```
in section_startup_checks.py:
  for each active section where end_date - today <= payment_due_before_end_days:
    for each enrollment where balance_remaining > 0:
      section.flags["has_unpaid_students"] = True
      section.flags["unpaid_count"] = count
      section.flags["total_outstanding"] = sum
```

**C) Configuration (in `section_lifecycle_config` table):**
- `payment_due_before_end_days` — Days before end date payment is considered due (default: 14)
- `block_completion_if_unpaid` — Block or just warn (default: true)

### 3.5 Solution: Cancelled Status + Financial Reversal + Refund Pathway

#### 3.5.1 New Concepts

| Concept | Description |
|---------|-------------|
| **Cancelled Status** | New terminal status for `CourseSection` — distinct from `completed` and from soft-delete. |
| **Section Cancellation** | Audit record of the cancellation event: reason, refund policy, financial summary. |
| **PendingRefund (Student Credit)** | An authorized-but-undisbursed refund liability recorded against the institute at cancellation time. Statuses: `UNCLAIMED`, `CLAIMED`, `FORFEITED`. |
| **Refund (Final Receipt)** | Actual cash disbursement record generated only when the student physically arrives and the cashier hands over the money. Linked to its `PendingRefund` and the cashier's shift. |
| **Deactivation Reversal** | A lightweight ledger entry type that reverses only the activation credit (not payment shares). |

#### 3.5.2 Manager Cancel Flow

```
Manager clicks "Cancel Section"
        │
        ▼
  [Impact Preview Screen]
  - Teacher wallet reversal: 5,000 EGP
  - Enrolled students: 15 (12 with payments)
  - Total payments collected: 30,000 EGP
  - Warnings: Has attendance records
        │
        ▼
  [Refund Decision]
  ○ Authorize refunds — converts payments to PendingRefund (student liability)
  ○ No refund — students handled manually (transfer, forfeit, etc.)
        │
        ▼
  [Reason & Confirm]
  - Required reason text
  - Summary of all actions
  - Confirm / Cancel
        │
        ▼
  Section → cancelled
  Contract → reversed via cancel_contract()
  Teacher wallet → all entries reversed (activation + payment shares)
  Student payments → PendingRefund records created (if authorized)
  No final receipts generated at this stage
  Audit → saved
```

#### 3.5.3 Cashier Disbursement Flow (Asynchronous)

```
Student arrives at institute → requests refund
        │
        ▼
  Cashier searches student profile
        │
        ▼
  System shows active UNCLAIMED PendingRefund flag
  - Amount authorized, cancellation reference, date of cancellation
        │
        ▼
  Cashier clicks "Disburse Funds"
  - Hands physical cash to student
  - System prompts for confirmation
        │
        ▼
  [Confirmation]
  - "Are you sure you want to disburse 2,500 EGP to [Student Name]?"
  - Optional: receipt notes
        │
        ▼
  Cashier confirms
        │
        ▼
  Official Refund receipt generated (sequential number RFD-YYYYMMDD-NNNN)
  PendingRefund → CLAIMED
  Daily cash ledger updated → expense recorded under cashier's shift
  Student financial status → REFUNDED
```

#### 3.5.4 Backend Services for Cancellation

| Service Function | Description |
|-----------------|-------------|
| `can_cancel_section()` | Validation helper — checks preconditions (not completed, no certificates, no grades) |
| `preview_cancellation_impact()` | Returns full consequence preview (teacher reversal, enrollment/payment totals, student list) |
| `cancel_section()` | Orchestrates cancellation: validates preconditions, reverses teacher wallet via `cancel_contract()`, optionally creates `PendingRefund` records, sets section → `cancelled`, saves audit record. Does NOT generate final refund receipts. |
| `disburse_pending_refund()` | Cashier service: validates PendingRefund is UNCLAIMED, generates sequential receipt number, creates Refund record, sets status → CLAIMED, records disbursement in daily cash ledger |
| `get_student_pending_refunds()` | Returns unclaimed refunds for a student |
| `get_pending_refunds_queue()` | Returns all UNCLAIMED refunds for cashier dashboard |

### 3.6 Solution: Deactivation

**What:** Lightweight undo for accidental activation. Returns section to `pending`.

**New functions:** `deactivate_section()` in `academic/service.py`, `deactivate_contract()` in `ledger_service.py`

**Deactivation Flow:**

```
Manager clicks "Deactivate"
        │
        ▼
  [Validation]
  - Section is active ✓
  - Contract is active ✓
  - Teacher has NOT withdrawn funds ✓
        │
        ▼
  [Optional: Force if payments exist]
  - If students have paid, manager must provide reason
        │
        ▼
  Activation credit reversed from teacher wallet
  Section → pending
  Contract → assigned
```

**Safety guards:**
- Block if teacher wallet balance < activation credit to reverse (prevent negative wallet)
- Block if any student payments have been recorded (force param required with reason)
- Log full audit record

### 3.7 Solution: Accountability — Audit Overrides

**Architectural Directive:** The `force=true` parameter to bypass missing grades or outstanding payments is approved, but every invocation must be audited.

**Logic in `complete_section()`:**

```
if force == true:
    db.add(SectionCompletionOverride(
        section_id=section.id,
        overridden_by=current_user.id,
        bypass_grade_check=has_ungraded,
        bypass_payment_check=has_unpaid,
        reason=force_reason,
        ungraded_students=list_of_ungraded_students,  # snapshot
        unpaid_students=list_of_unpaid_students,        # snapshot
    ))
    # Then proceed with completion
```

### 3.8 Solution: Dashboard & Notification System

**New dashboard endpoint:** `GET /sections/overdue-summary`

```json
{
  "ready_for_completion": [
    {
      "section_id": "...",
      "course_name": "...",
      "end_date": "2026-07-01",
      "teacher_name": "...",
      "ungraded_students": 0
    }
  ],
  "overdue_sections": [
    {
      "section_id": "...",
      "course_name": "...",
      "teacher_name": "...",
      "end_date": "2026-07-01",
      "days_past_end": 9,
      "ungraded_students": 3,
      "unpaid_students": 2,
      "total_outstanding": 5000.00
    }
  ],
  "upcoming_deadlines": [
    {
      "section_id": "...",
      "course_name": "...",
      "end_date": "2026-07-15",
      "days_until_end": 5,
      "missing_grades": true,
      "outstanding_payments": true
    }
  ]
}
```

**Dashboard UI:**
- Badge on sections page showing count of `ready_for_completion` and `overdue` sections
- Distinct visual states: green (active), yellow (ready for completion), red (overdue), grey (completed/cancelled)
- Section detail page shows warnings (red banner for past end date, yellow for approaching)
- Ready for Completion sections get a prominent "Complete Section" button
- Overdue sections show missing grades count and outstanding payment totals
- Cancelled sections show the cancellation reason and refund status

---

## 4. New Data Model Changes

### 4.1 CourseSection Table

```sql
ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'ready_for_completion';
ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE course_sections ADD COLUMN flags JSONB DEFAULT '{}'::jsonb;
ALTER TABLE course_sections ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE course_sections ADD COLUMN cancelled_by UUID REFERENCES users(id);
ALTER TABLE course_sections ADD COLUMN cancellation_reason TEXT;
```

### 4.2 SectionCancellation Table (Audit Trail)

```sql
CREATE TABLE section_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id),
    cancelled_by UUID NOT NULL REFERENCES users(id),
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reason TEXT NOT NULL,
    refund_policy VARCHAR(20) NOT NULL,  -- 'authorize_refunds' or 'no_refund'
    teacher_wallet_reversal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_payments_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_refund_authorized NUMERIC(12, 2) NOT NULL DEFAULT 0,
    enrolled_student_count INT NOT NULL DEFAULT 0,
    has_attendance_records BOOLEAN NOT NULL DEFAULT false,
    has_final_grades BOOLEAN NOT NULL DEFAULT false,
    has_certificates BOOLEAN NOT NULL DEFAULT false
);
```

### 4.3 PendingRefund Table (Liability)

```sql
CREATE TYPE pending_refund_status AS ENUM ('UNCLAIMED', 'CLAIMED', 'FORFEITED');

CREATE TABLE pending_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id),
    section_cancellation_id UUID NOT NULL REFERENCES section_cancellations(id),
    amount NUMERIC(12, 2) NOT NULL,
    status pending_refund_status NOT NULL DEFAULT 'UNCLAIMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ
);
```

### 4.4 Refund Table (Final Receipt)

```sql
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pending_refund_id UUID NOT NULL REFERENCES pending_refunds(id),
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    disbursed_by UUID NOT NULL REFERENCES users(id),
    notes TEXT
);
```

### 4.5 daily_jobs_log Table (Idempotency)

```sql
CREATE TABLE daily_jobs_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name VARCHAR(100) NOT NULL,
    last_run_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(job_name, last_run_date)
);
```

### 4.6 section_completion_overrides Table (Force Audit)

```sql
CREATE TABLE section_completion_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES course_sections(id),
    overridden_by UUID NOT NULL REFERENCES users(id),
    overridden_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    bypass_grade_check BOOLEAN NOT NULL DEFAULT false,
    bypass_payment_check BOOLEAN NOT NULL DEFAULT false,
    reason TEXT NOT NULL,
    ungraded_students JSONB,
    unpaid_students JSONB
);
```

### 4.7 section_lifecycle_config Table

```sql
CREATE TABLE section_lifecycle_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

INSERT INTO section_lifecycle_config (key, value, description) VALUES
('overdue_warning_days_before', '7', 'Days before end_date to start showing warnings'),
('payment_due_before_end_days', '14', 'Days before end date that payment is considered due'),
('block_completion_if_unpaid', 'true', 'Whether to block section completion if students have balances'),
('block_completion_if_ungraded', 'true', 'Whether to block section completion if grades are missing');
```

### 4.8 LedgerEntryType Enum Additions

```sql
ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'DEACTIVATION_REVERSAL';
ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'REFUND_DISBURSEMENT';
```

---

## 5. API Endpoints

### 5.1 Manager Endpoints (superadmin, manager)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/academic/course-sections/{id}` | Section detail (includes flags, cancellation info) |
| `GET` | `/academic/sections/overdue-summary` | Dashboard: ready, overdue, upcoming sections |
| `GET` | `/academic/course-sections/{id}/cancel-preview` | Impact preview before cancellation |
| `POST` | `/academic/course-sections/{id}/cancel` | Execute cancellation with refund decision |
| `POST` | `/academic/course-sections/{id}/deactivate` | Execute deactivation (return to pending) |
| `GET` | `/academic/course-sections/{id}/cancellation` | View cancellation audit record |

### 5.2 Cashier Endpoints (cashier role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lms/cashier/pending-refunds` | Queue of all UNCLAIMED refunds (searchable) |
| `GET` | `/lms/students/{id}/pending-refunds` | Student's pending refunds |
| `POST` | `/lms/cashier/pending-refunds/{id}/disburse` | Execute disbursement, generate receipt |
| `GET` | `/lms/cashier/refunds` | Disbursement history for cashier's shift |

### 5.3 Existing Endpoint Changes

| Endpoint | Change |
|----------|--------|
| `POST /academic/course-sections/{id}/complete` | Add grade check (NULL vs 0), payment check, `force` + `reason` params, override audit |
| `POST /academic/course-sections/{id}/activate` | No change (preconditions already enforced) |
| `DELETE /academic/course-sections/{id}` | Restrict to superadmin only |
| `PUT /academic/sections/{section_id}/final-grades` | No change (already has grade count auto-finalize) |

---

## 6. Frontend Changes

### 6.1 Manager Section

- **Section list page**: Replace delete button with cancel button; add deactivate button for active sections; add `cancelled` and `ready_for_completion` status badges and filters
- **Section detail page**: Show warnings (red banner for past end date, yellow for approaching); show Ready for Completion with prominent "Complete" button; show overdue status with missing grades count
- **Cancel Section Modal** (multi-step): Step 1 — Impact preview; Step 2 — Refund decision (authorize / skip); Step 3 — Reason and confirm
- **Deactivate Modal**: Validation summary + confirm
- **Completion override modal**: When force=true needed, show reason input field

### 6.2 Cashier Section (New)

- **Pending Refunds dashboard**: Table of all UNCLAIMED refunds with student name/code, amount, cancellation date, section name; search/filter by student name or code; "Disburse" action button
- **Disburse confirmation modal**: Student info, amount, cashier confirms
- **Receipt display**: Printable receipt after successful disbursement
- **Disbursement history**: For current shift

### 6.3 Student Profile

- Prominent UNCLAIMED pending refund flag/badge
- Expandable section showing pending refund details (amount, section, cancellation date)

### 6.4 Shared

- Bilingual (ar/en) support for all new UI strings
- Role-based UI (cashier sees only cashier views; manager sees only manager views)

---

## 7. Implementation Phases

### Phase 1: Database Schema & Models

| Task | Estimate |
|------|----------|
| Add `ready_for_completion` and `cancelled` to `coursestatus` PostgreSQL enum | 0.25 day |
| Add `flags` JSONB, `cancelled_at`, `cancelled_by`, `cancellation_reason` to `course_sections` | 0.25 day |
| Create `SectionCancellation` SQLAlchemy model | 0.25 day |
| Create `PendingRefund` model + `pending_refund_status` enum | 0.25 day |
| Create `Refund` model | 0.25 day |
| Create `daily_jobs_log` model | 0.25 day |
| Create `section_completion_overrides` model | 0.25 day |
| Create `section_lifecycle_config` model | 0.25 day |
| Add `DEACTIVATION_REVERSAL` and `REFUND_DISBURSEMENT` to `LedgerEntryType` enum | 0.25 day |
| Alembic migrations for all the above | 0.5 day |
| **Subtotal** | **2.75 days** |

### Phase 2: Startup-Driven Daily Checks

| Task | Files | Estimate |
|------|-------|----------|
| Create `section_startup_checks.py` with overdue detection + grade completeness check + upcoming deadline warnings + payment deadline awareness | `backend/app/modules/academic/section_startup_checks.py` | 1 day |
| Wire `run_daily_section_checks()` into FastAPI lifespan event | `backend/app/main.py` | 0.25 day |
| **Subtotal** | | **1.25 days** |

### Phase 3: Grade & Payment Enforcement in complete_section()

| Task | Files | Estimate |
|------|-------|----------|
| Update grade check: NULL vs 0 distinction with LEFT JOIN query | `backend/app/modules/academic/service.py` | 0.5 day |
| Add payment balance check for each enrollment | `backend/app/modules/academic/service.py` | 0.5 day |
| Implement `force=true` override with `SectionCompletionOverride` audit logging | `service.py` | 0.5 day |
| Update router to accept `force` and `reason` params | `backend/app/modules/academic/router.py` | 0.25 day |
| **Subtotal** | | **1.75 days** |

### Phase 4: Cancelled Status — Backend Services

| Task | Files | Estimate |
|------|-------|----------|
| Implement `can_cancel_section()` validation helper | `backend/app/modules/academic/cancellation_service.py` | 0.25 day |
| Implement `preview_cancellation_impact()` | `cancellation_service.py` | 0.5 day |
| Implement `cancel_section()` orchestrator (validate → reverse wallet → PendingRefund → audit) | `cancellation_service.py` | 1 day |
| Implement `disburse_pending_refund()` cashier service | `backend/app/modules/lms/cashier_service.py` | 0.75 day |
| Implement `get_student_pending_refunds()` and `get_pending_refunds_queue()` | `cashier_service.py` | 0.5 day |
| Manager API endpoints (cancel-preview, cancel, cancellation detail) | `backend/app/modules/academic/router.py` | 0.5 day |
| Cashier API endpoints (pending-refunds, disburse, refunds history) | `backend/app/modules/lms/router.py` | 0.5 day |
| Restrict existing DELETE to superadmin only | `backend/app/modules/academic/router.py` | 0.25 day |
| **Subtotal** | | **4.25 days** |

### Phase 5: Deactivation

| Task | Files | Estimate |
|------|-------|----------|
| Implement `deactivate_contract()` in ledger (activation-only reversal) | `backend/app/modules/lms/ledger_service.py` | 0.5 day |
| Implement `deactivate_section()` in academic service | `backend/app/modules/academic/service.py` | 0.5 day |
| Add API endpoint for deactivation | `backend/app/modules/academic/router.py` | 0.25 day |
| **Subtotal** | | **1.25 days** |

### Phase 6: Frontend

| Task | Estimate |
|------|----------|
| Manager: Cancel Section multi-step modal (Preview → Refund Decision → Reason & Confirm) | 1 day |
| Manager: Replace delete button with cancel; add deactivate button | 0.5 day |
| Manager: Status badges and filters for `ready_for_completion` / `cancelled` | 0.5 day |
| Manager: Dashboard warnings (badges, banners, overdue-summary integration) | 1 day |
| Cashier: Pending Refunds dashboard page with search/filter | 1 day |
| Cashier: Disburse confirmation modal + receipt display | 0.5 day |
| Cashier: Disbursement history view | 0.25 day |
| Student Profile: Pending refund flag/badge | 0.5 day |
| Bilingual (ar/en) support for all new UI strings | 0.5 day |
| **Subtotal** | **5.75 days** |

### Phase 7: Edge Cases & Reconciliation

| Task | Estimate |
|------|----------|
| Block deactivation if teacher has withdrawn funds (prevent negative wallet) | 0.25 day |
| Validate daily closure rules for disbursement (closed day → unlock request) | 0.25 day |
| Block cancellation if certificates or final grades exist | 0.25 day |
| Ensure `cancel_section()` is within a single DB transaction | 0.25 day |
| `disburse_pending_refund()` idempotency guard | 0.25 day |
| Forfeiture policy: expire pending refunds after configurable period | 0.5 day |
| `complete_section()` respects daily closure checks | 0.25 day |
| **Subtotal** | **2 days** |

### Phase 8: Testing

| Task | Estimate |
|------|----------|
| Unit tests: startup check logic (idempotency, overdue detection, grade completeness) | 0.5 day |
| Unit tests: grade enforcement (NULL vs 0 in all edge cases) | 0.5 day |
| Unit tests: payment enforcement | 0.25 day |
| Unit tests: cancellation services (preview, execute, refund authorize) | 0.5 day |
| Unit tests: deactivation (success, blocked cases) | 0.25 day |
| Unit tests: override audit logging | 0.25 day |
| Unit tests: disburse refund (success, duplicate, closed day) | 0.5 day |
| Integration tests: full lifecycle (create → activate → past end_date → ready → complete with grades) | 1 day |
| Integration tests: cancellation flow (enroll → pay → activate → cancel with refund → verify wallet reversal + PendingRefund) | 1 day |
| Integration tests: disbursement flow (cancel → cashier disburses → verify Refund receipt + daily ledger) | 0.5 day |
| Integration tests: deactivation flow (create → activate → deactivate → back to pending) | 0.5 day |
| Integration tests: edge cases (closed day blocks disbursement, certificates block cancellation, force override audited) | 0.5 day |
| E2E tests: cashier dashboard flow | 0.5 day |
| **Subtotal** | **6.75 days** |

---

## 8. Total Estimate

| Phase | Days |
|-------|------|
| Phase 1: Database Schema & Models | 2.75 |
| Phase 2: Startup-Driven Daily Checks | 1.25 |
| Phase 3: Grade & Payment Enforcement | 1.75 |
| Phase 4: Cancelled Status Backend | 4.25 |
| Phase 5: Deactivation | 1.25 |
| Phase 6: Frontend | 5.75 |
| Phase 7: Edge Cases & Reconciliation | 2 |
| Phase 8: Testing | 6.75 |
| **Total** | **~26 days** |

---

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Server restarts mid-day trigger duplicate checks | MEDIUM | `daily_jobs_log` prevents re-execution for the same date |
| Manager completes section on a closed financial day | MEDIUM | `complete_section()` checks daily closure before proceeding |
| Teacher wallet goes negative on deactivation | HIGH | Pre-check available balance; block if insufficient |
| Teacher wallet goes negative on cancellation | HIGH | Pre-check available balance before reversal |
| Partial failure during multi-table cancellation | HIGH | All operations within single DB transaction |
| Existing data has past-due active sections with no grades | MEDIUM | First startup run flags as `overdue` (not `ready_for_completion`). Manager resolves manually. |
| Force override used without legitimate reason | LOW | Audit log captures manager ID, timestamp, reason, and snapshot of bypassed state |
| Server runs startup check before day's data is entered | LOW | Startup checks are read-only flags. No financial mutations occur automatically. Manager reviews before acting. |
| Refund disbursement on a closed day | MEDIUM | Check `is_date_closed()` at disbursement time; cashier must request day unlock first |
| Duplicate disbursement for same PendingRefund | MEDIUM | `disburse_pending_refund()` checks status is UNCLAIMED; idempotency guard |
| Student never claims refund (forfeiture) | LOW | Optional forfeiture policy after configurable period; liability reverts to institute revenue |
| Financial reporting impacted by reversals | HIGH | Distinct `LedgerEntryType` values for filtering; separate Refund model |

---

## 10. Dependencies

| Dependency | For | Status |
|------------|-----|--------|
| FastAPI lifespan event | Triggering daily checks on boot | Already available |
| `app.core.timezone.get_today()` | Institute-local date (Asia/Riyadh) instead of `date.today()` | From timezone-proxy infrastructure task |
| Daily Closures System | Preventing completion/disbursement on locked dates | Already implemented |
| Existing `cancel_contract()` in ledger_service | Reversing teacher wallet entries on cancellation | Already implemented |
| New PostgreSQL migrations | All new tables, enums, columns | Pending |

**Zero new runtime dependencies.** No APScheduler, no Celery, no Redis, no message brokers.

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Startup-driven, not cron-driven** | Server powered down at night. Boot is the only reliable trigger. No external scheduler dependencies. |
| **`daily_jobs_log` for idempotency** | Prevents duplicate runs if server restarts mid-day. Simple, no external state. |
| **No auto-settling of contracts** | Financial ledger mutations must never occur via a system user. Every financial action requires an authenticated manager session that respects daily closure locks. |
| **`ready_for_completion` intermediate status** | Makes overdue sections visible and actionable without auto-executing financial flows. Manager must explicitly click "Complete". |
| **NULL vs 0 grade distinction** | A student with a valid 0 (failed) has a complete record. Only truly missing grades (NULL) block completion. |
| **Audit log for `force=true`** | Overrides are legitimate but must be traceable. Records who, when, why, and what was bypassed. |
| **Cancel is distinct from Deactivate** | Cancel is permanent terminal state with full financial handling; Deactivate is lightweight "undo" for accidental activation. |
| **Refund is optional at cancellation** | In some cases (student transfers managerially), refunds are not needed. The choice is recorded for audit. |
| **Two-phase refund: authorization ≠ disbursement** | Cancellation authorizes refunds as liabilities (`PendingRefund`); actual cash payout happens later when student arrives. Protects daily cash reconciliation — disbursement date matches physical cash movement. |
| **Receipt generated at disbursement, not cancellation** | Refund receipt number is sequential and tied to cashier's shift. Generating at cancellation would mismatch receipt date with actual cash event, breaking daily closure accuracy. |
| **PendingRefund is a liability on institute books** | Until student claims the money, the institute owes it. Captured as a liability, not an immediate expense. Expense hits the ledger only at actual disbursement. |
| **Existing `cancel_contract()` reused** | The ledger service already has robust contract cancellation — leverage it rather than reimplementing. |
| **JSONB `flags` column for warnings** | Avoids adding boolean columns for every new warning type. Flexible, queryable, indexable. |
| **Certificates block cancellation** | Certificates are legal/educational records that cannot be auto-revoked. Manager must handle manually first. |
| **Deactivation blocked if teacher withdrew** | Reversing activation credit when teacher has withdrawn money would make wallet negative — must prevent. |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Cancel Section** | Permanently stop a section, reverse financial entries, optionally refund students. Terminal status. |
| **Deactivate Section** | Undo an accidental activation — reverse only the activation credit, return section to pending. |
| **Teacher Wallet** | Ledger tracking teacher compensation (activation credits + payment shares - expenses). |
| **Section Cancellation** | Audit record of a cancellation event. |
| **PendingRefund** | An authorized-but-undisbursed refund liability. Recorded at cancellation time when the manager chooses to authorize refunds. Statuses: UNCLAIMED, CLAIMED, FORFEITED. |
| **Refund** | Final receipt record generated at the moment the cashier physically hands money to the student. Linked to its PendingRefund and the cashier's shift. |
| **Ready for Completion** | Intermediate status set by startup checks when a section is past its end date and all grades are entered. Awaits manager to manually complete. |
| **Override** | Manager bypass of grade or payment enforcement checks using `force=true`. Every override is audited. |
| **Daily Closure** | A date-level lock preventing retroactive financial mutations. Manager must unlock before corrections can be made. |
