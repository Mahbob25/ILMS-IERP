# Phase 1: Foundation — Data Models & Schema

**Owner:** Data Engineer  
**Estimate:** 2.75 days  
**Dependencies:** None (this is the foundation)  
**Output consumed by:** All other phases

## Scope

Database schema changes, SQLAlchemy models, Alembic migrations, and the shared API contract document. No business logic.

---

## Tasks

### 1.1 PostgreSQL Enum Changes

```sql
ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'ready_for_completion';
ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'DEACTIVATION_REVERSAL';
ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'REFUND_DISBURSEMENT';
```

### 1.2 CourseSection Column Additions

```sql
ALTER TABLE course_sections
  ADD COLUMN flags JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by UUID REFERENCES users(id),
  ADD COLUMN cancellation_reason TEXT;
```

### 1.3 New Tables

**section_cancellations** — Audit trail for every cancellation.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| section_id | UUID FK→course_sections | |
| cancelled_by | UUID FK→users | |
| cancelled_at | TIMESTAMPTZ | DEFAULT timezone('utc'::text, now()) |
| reason | TEXT NOT NULL | |
| refund_policy | VARCHAR(20) NOT NULL | 'authorize_refunds' or 'no_refund' |
| teacher_wallet_reversal_amount | NUMERIC(12,2) DEFAULT 0 | |
| total_payments_collected | NUMERIC(12,2) DEFAULT 0 | |
| total_refund_authorized | NUMERIC(12,2) DEFAULT 0 | |
| enrolled_student_count | INT DEFAULT 0 | |
| has_attendance_records | BOOLEAN DEFAULT false | |
| has_final_grades | BOOLEAN DEFAULT false | |
| has_certificates | BOOLEAN DEFAULT false | |

**pending_refunds** — Authorized-but-undisbursed refund liability.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| enrollment_id | UUID FK→enrollments | |
| section_cancellation_id | UUID FK→section_cancellations | |
| amount | NUMERIC(12,2) NOT NULL | |
| status | pending_refund_status | DEFAULT 'UNCLAIMED' |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| expires_at | TIMESTAMPTZ | NULL = no expiry |

```sql
CREATE TYPE pending_refund_status AS ENUM ('UNCLAIMED', 'CLAIMED', 'FORFEITED');
```

**refunds** — Final receipt generated at cash disbursement.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| pending_refund_id | UUID FK→pending_refunds | |
| receipt_number | VARCHAR(50) UNIQUE NOT NULL | RFD-YYYYMMDD-NNNN |
| amount | NUMERIC(12,2) NOT NULL | |
| disbursed_at | TIMESTAMPTZ | DEFAULT now() |
| disbursed_by | UUID FK→users | |
| notes | TEXT | |

**daily_jobs_log** — Idempotency guard for startup checks.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| job_name | VARCHAR(100) NOT NULL | |
| last_run_date | DATE NOT NULL | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| UNIQUE(job_name, last_run_date) | | |

**section_completion_overrides** — Audit log when `force=true` bypasses checks.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| section_id | UUID FK→course_sections | |
| overridden_by | UUID FK→users | |
| overridden_at | TIMESTAMPTZ | DEFAULT now() |
| bypass_grade_check | BOOLEAN DEFAULT false | |
| bypass_payment_check | BOOLEAN DEFAULT false | |
| reason | TEXT NOT NULL | |
| ungraded_students | JSONB | Snapshot at override time |
| unpaid_students | JSONB | Snapshot at override time |

**section_lifecycle_config** — Configurable thresholds.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| key | VARCHAR(100) UNIQUE NOT NULL | |
| value | VARCHAR(255) NOT NULL | |
| description | TEXT | |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

```sql
INSERT INTO section_lifecycle_config (key, value, description) VALUES
('overdue_warning_days_before', '7', 'Days before end_date to start showing warnings'),
('payment_due_before_end_days', '14', 'Days before end date that payment is considered due'),
('block_completion_if_unpaid', 'true', 'Whether to block completion if students have balances'),
('block_completion_if_ungraded', 'true', 'Whether to block completion if grades are missing');
```

### 1.4 SQLAlchemy Models

Create new model classes in `backend/app/modules/academic/models.py`:

- `SectionCancellation` — Maps to `section_cancellations`
- `PendingRefund` — Maps to `pending_refunds` (add `pending_refund_status` enum)
- `Refund` — Maps to `refunds`
- `DailyJobsLog` — Maps to `daily_jobs_log`
- `SectionCompletionOverride` — Maps to `section_completion_overrides`
- `SectionLifecycleConfig` — Maps to `section_lifecycle_config`

Update `CourseSection` model:
- Add `flags: Mapped[dict | None]` with JSONB
- Add `cancelled_at`, `cancelled_by`, `cancellation_reason` columns
- Add relationship to `SectionCancellation`

Update LedgerEntryType enum:
- Add `DEACTIVATION_REVERSAL`
- Add `REFUND_DISBURSEMENT`

### 1.5 Alembic Migration

Generate a single migration that:
1. Adds enum values (using `sa.Enum.create()` / `ALTER TYPE`)
2. Creates new tables
3. Adds columns to `course_sections`

### 1.6 API Contract Document

Produce `api-contract.json` in this directory defining every new and modified endpoint. This is the shared contract consumed by all phases.

**New endpoints:**

```json
{
  "GET /academic/sections/overdue-summary": {
    "description": "Dashboard: ready, overdue, upcoming sections",
    "response": { "ready_for_completion": [...], "overdue_sections": [...], "upcoming_deadlines": [...] },
    "auth": "superadmin, manager"
  },
  "GET /academic/course-sections/{id}/cancel-preview": {
    "description": "Impact preview before cancellation",
    "response": { "teacher_reversal_amount": 5000, "enrolled_count": 15, "payments_collected": 30000, "warnings": [...] }
  },
  "POST /academic/course-sections/{id}/cancel": {
    "description": "Execute cancellation",
    "body": { "reason": "string", "refund_policy": "authorize_refunds|no_refund" },
    "response": { "success": true, "section_cancellation_id": "uuid" }
  },
  "POST /academic/course-sections/{id}/deactivate": {
    "description": "Return section from active to pending",
    "body": { "reason": "string (optional, required if payments exist)" },
    "response": { "success": true }
  },
  "GET /academic/course-sections/{id}/cancellation": {
    "description": "View cancellation audit record"
  },
  "GET /lms/cashier/pending-refunds": {
    "description": "Queue of UNCLAIMED refunds"
  },
  "GET /lms/students/{id}/pending-refunds": {
    "description": "Student's pending refunds"
  },
  "POST /lms/cashier/pending-refunds/{id}/disburse": {
    "description": "Execute disbursement, generate receipt",
    "body": { "notes": "string (optional)" },
    "response": { "receipt_number": "RFD-20260710-0001" }
  },
  "GET /lms/cashier/refunds": {
    "description": "Disbursement history for cashier's shift"
  }
}
```

**Modified endpoints:**

```json
{
  "POST /academic/course-sections/{id}/complete": {
    "changes": ["Add force (bool, optional) and reason (string, required if force=true) body params"],
    "new_behavior": ["Grade completeness check (NULL vs 0)", "Payment balance check per enrollment", "Override audit if force=true"]
  },
  "DELETE /academic/course-sections/{id}": {
    "changes": ["Restrict to superadmin only"]
  }
}
```

---

## Files Touched

| File | Action |
|------|--------|
| `backend/app/modules/academic/models.py` | EDIT — add new models, update CourseSection |
| `backend/app/modules/lms/models.py` | EDIT — add LedgerEntryType enum values |
| Alembic migration file | CREATE — auto-generated |
| `docs/plans/section-lifecycle/api-contract.json` | CREATE — shared API contract |

## Verification

- [ ] All new tables exist in the database after migration
- [ ] `coursestatus` enum includes `ready_for_completion`, `cancelled`
- [ ] `ledgerentrytype` enum includes `DEACTIVATION_REVERSAL`, `REFUND_DISBURSEMENT`
- [ ] `CourseSection.flags` column is JSONB, defaults to `{}`
- [ ] All SQLAlchemy models are importable and ORM relationships work
- [ ] `api-contract.json` published and reviewed by all agent leads

## Output Contract (for downstream phases)

After this phase completes, downstream phases can assume:

```python
from app.modules.academic.models import (
    CourseSection,       # has .flags, .cancelled_at, .cancelled_by, .cancellation_reason
    SectionCancellation,  # fully queryable
    PendingRefund,        # fully queryable
    Refund,               # fully queryable
    DailyJobsLog,          # fully queryable
    SectionCompletionOverride,  # fully queryable
    SectionLifecycleConfig,     # fully queryable
)
from app.modules.lms.models import LedgerEntryType  # has DEACTIVATION_REVERSAL, REFUND_DISBURSEMENT
```
