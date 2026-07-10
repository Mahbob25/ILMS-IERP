# Agent Prompts — Section Lifecycle Implementation

Use these prompts to instruct each agent. Each prompt is self-contained: give it to the agent and they have everything they need.

---

## Prompt for Phase 1 Agent (Foundation)

```markdown
You are implementing Phase 1 — Foundation: Data Models & Schema for the Section Lifecycle project.

## Context
This is the FIRST phase. All other phases depend on your output. You are creating the database schema, SQLAlchemy models, Alembic migrations, and the shared API contract document.

## What to Read
Read `docs/plans/section-lifecycle/phase-01-foundation-data-models.md` — it contains every table definition, column, enum, and model you need to create.

## Tasks
1. Add `ready_for_completion` and `cancelled` to the `coursestatus` PostgreSQL enum
2. Add `DEACTIVATION_REVERSAL` and `REFUND_DISBURSEMENT` to the `ledgerentrytype` enum
3. Add columns to `course_sections`: `flags JSONB`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
4. Create new SQLAlchemy models: `SectionCancellation`, `PendingRefund`, `Refund`, `DailyJobsLog`, `SectionCompletionOverride`, `SectionLifecycleConfig`
5. Update the `CourseSection` model with new columns and relationships
6. Generate an Alembic migration for all the above
7. Create `docs/plans/section-lifecycle/api-contract.json` with all new/modified endpoint definitions

## Output Contract (what downstream phases expect)
After you finish, these must work:
```python
from app.modules.academic.models import (
    CourseSection,  # has .flags, .cancelled_at, .cancelled_by, .cancellation_reason
    SectionCancellation,
    PendingRefund,
    Refund,
    DailyJobsLog,
    SectionCompletionOverride,
    SectionLifecycleConfig,
)
from app.modules.lms.models import LedgerEntryType  # has DEACTIVATION_REVERSAL, REFUND_DISBURSEMENT
```

## Independent Boundary
- Do NOT write any business logic
- Do NOT modify service.py, router.py, or any existing business logic files
- Pure data layer only: models, enums, migrations, API contract

## Verification
- [ ] All new tables exist in the database after migration
- [ ] `coursestatus` enum includes `ready_for_completion`, `cancelled`
- [ ] `ledgerentrytype` enum includes `DEACTIVATION_REVERSAL`, `REFUND_DISBURSEMENT`
- [ ] All SQLAlchemy models are importable with correct relationships
- [ ] `api-contract.json` published to `docs/plans/section-lifecycle/`

## Merge Instructions
- Create a branch named `phase-01-foundation`
- Push all changes
- Create a PR for review
```

---

## Prompt for Phase 2 Agent (Startup Daily Checks)

```markdown
You are implementing Phase 2 — Startup Daily Checks for the Section Lifecycle project.

## Context
Phase 1 (Foundation) is COMPLETE. The database schema, models, and migrations are already applied. You can assume:
- All new tables exist: `section_cancellations`, `pending_refunds`, `refunds`, `daily_jobs_log`, `section_completion_overrides`, `section_lifecycle_config`
- All new columns exist on `course_sections`: `flags`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
- All SQLAlchemy models are importable
- The API contract is at `docs/plans/section-lifecycle/api-contract.json`

## What to Read
Read `docs/plans/section-lifecycle/phase-02-startup-daily-checks.md` — it contains all the implementation details for this phase.

Also read `docs/plans/section-lifecycle/api-contract.json` for endpoint shapes.

## Your Phase Details
- **Estimate:** 1.25 days
- **Files to create:** `backend/app/modules/academic/section_startup_checks.py`
- **Files to edit:** `backend/app/main.py` (wire lifespan call)

## Key Rules
1. **Do NOT touch files owned by other parallel phases.** Your phase owns specific files — only modify those.
2. **Add routes to the END of router.py** — do not insert in the middle of the file (avoids merge conflicts).
3. **Add new functions after existing ones** in service.py — do not inline-edit existing functions unless explicitly specified for your phase.
4. **Import models from Phase 1** — do NOT create new tables or columns.
5. **Follow the api-contract.json** for request/response shapes. If the contract is wrong, update it and notify the team.

## Independent Boundary
Do NOT modify:
- `service.py`, `ledger_service.py`, `cancellation_service.py`, `cashier_service.py` (no business logic mutations)
- Do NOT create API endpoints
- Do NOT perform financial mutations (read-only flag updates only)

## Merge Instructions
- Branch name: `phase-02-startup-daily-checks`
- Work on your branch independently
- Create a PR when done
- Do NOT wait for other parallel phases
```

---

## Prompt for Phase 3 Agent (Grade & Payment Enforcement)

```markdown
You are implementing Phase 3 — Grade & Payment Enforcement for the Section Lifecycle project.

## Context
Phase 1 (Foundation) is COMPLETE. The database schema, models, and migrations are already applied. You can assume:
- All new tables exist: `section_cancellations`, `pending_refunds`, `refunds`, `daily_jobs_log`, `section_completion_overrides`, `section_lifecycle_config`
- All new columns exist on `course_sections`: `flags`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
- All SQLAlchemy models are importable
- The API contract is at `docs/plans/section-lifecycle/api-contract.json`

## What to Read
Read `docs/plans/section-lifecycle/phase-03-grade-payment-enforcement.md` — it contains all the implementation details for this phase.

Also read `docs/plans/section-lifecycle/api-contract.json` for endpoint shapes.

## Your Phase Details
- **Estimate:** 1.75 days
- **Files to create:** None
- **Files to edit:** `backend/app/modules/academic/service.py` (edit `complete_section()`), `backend/app/modules/academic/router.py` (add force/reason params, restrict DELETE)

## Key Rules
1. **Do NOT touch files owned by other parallel phases.** Your phase owns specific files — only modify those.
2. **Add routes to the END of router.py** — do not insert in the middle of the file (avoids merge conflicts).
3. **Add new functions after existing ones** in service.py — do not inline-edit existing functions unless explicitly specified for your phase.
4. **Import models from Phase 1** — do NOT create new tables or columns.
5. **Follow the api-contract.json** for request/response shapes. If the contract is wrong, update it and notify the team.

## Independent Boundary
Do NOT modify:
- `section_startup_checks.py` (Phase 2 concern)
- `cancellation_service.py`, `cashier_service.py` (Phase 4 concern)
- `ledger_service.py` (Phase 5 concern)
- Do NOT add new API endpoints (only modify existing ones)

## Merge Instructions
- Branch name: `phase-03-grade-payment-enforcement`
- Work on your branch independently
- Create a PR when done
- Do NOT wait for other parallel phases
```

---

## Prompt for Phase 4 Agent (Cancellation Backend)

```markdown
You are implementing Phase 4 — Cancellation Backend for the Section Lifecycle project.

## Context
Phase 1 (Foundation) is COMPLETE. The database schema, models, and migrations are already applied. You can assume:
- All new tables exist: `section_cancellations`, `pending_refunds`, `refunds`, `daily_jobs_log`, `section_completion_overrides`, `section_lifecycle_config`
- All new columns exist on `course_sections`: `flags`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
- All SQLAlchemy models are importable
- The API contract is at `docs/plans/section-lifecycle/api-contract.json`

## What to Read
Read `docs/plans/section-lifecycle/phase-04-cancellation-backend.md` — it contains all the implementation details for this phase.

Also read `docs/plans/section-lifecycle/api-contract.json` for endpoint shapes.

## Your Phase Details
- **Estimate:** 4.25 days
- **Files to create:** `backend/app/modules/academic/cancellation_service.py`, `backend/app/modules/lms/cashier_service.py`
- **Files to edit:** `backend/app/modules/academic/router.py` (append 3 manager endpoints), `backend/app/modules/lms/router.py` (append 4 cashier endpoints)

## Key Rules
1. **Do NOT touch files owned by other parallel phases.** Your phase owns specific files — only modify those.
2. **Add routes to the END of router.py** — do not insert in the middle of the file (avoids merge conflicts).
3. **Add new functions after existing ones** in service.py — do not inline-edit existing functions unless explicitly specified for your phase.
4. **Import models from Phase 1** — do NOT create new tables or columns.
5. **Follow the api-contract.json** for request/response shapes. If the contract is wrong, update it and notify the team.

## Independent Boundary
Do NOT modify:
- `section_startup_checks.py` (Phase 2 concern)
- `service.py` → `complete_section()` (Phase 3 concern)
- `ledger_service.py` deactivation code (Phase 5 concern)
- Do NOT modify grade/payment enforcement logic
- Do NOT touch frontend

## Merge Instructions
- Branch name: `phase-04-cancellation-backend`
- Work on your branch independently
- Create a PR when done
- Do NOT wait for other parallel phases
```

---

## Prompt for Phase 5 Agent (Deactivation)

```markdown
You are implementing Phase 5 — Deactivation for the Section Lifecycle project.

## Context
Phase 1 (Foundation) is COMPLETE. The database schema, models, and migrations are already applied. You can assume:
- All new tables exist: `section_cancellations`, `pending_refunds`, `refunds`, `daily_jobs_log`, `section_completion_overrides`, `section_lifecycle_config`
- All new columns exist on `course_sections`: `flags`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
- All SQLAlchemy models are importable
- The API contract is at `docs/plans/section-lifecycle/api-contract.json`

## What to Read
Read `docs/plans/section-lifecycle/phase-05-deactivation.md` — it contains all the implementation details for this phase.

Also read `docs/plans/section-lifecycle/api-contract.json` for endpoint shapes.

## Your Phase Details
- **Estimate:** 1.25 days
- **Files to create:** None
- **Files to edit:** `backend/app/modules/lms/ledger_service.py` (add `deactivate_contract()`), `backend/app/modules/academic/service.py` (append `deactivate_section()`), `backend/app/modules/academic/router.py` (append deactivate endpoint)

## Key Rules
1. **Do NOT touch files owned by other parallel phases.** Your phase owns specific files — only modify those.
2. **Add routes to the END of router.py** — do not insert in the middle of the file (avoids merge conflicts).
3. **Add new functions after existing ones** in service.py — do not inline-edit existing functions unless explicitly specified for your phase.
4. **Import models from Phase 1** — do NOT create new tables or columns.
5. **Follow the api-contract.json** for request/response shapes. If the contract is wrong, update it and notify the team.

## Independent Boundary
Do NOT modify:
- `section_startup_checks.py` (Phase 2 concern)
- `complete_section()` function in service.py (Phase 3 concern — append new functions only)
- `cancellation_service.py`, `cashier_service.py` (Phase 4 concern)

## Merge Instructions
- Branch name: `phase-05-deactivation`
- Work on your branch independently
- Create a PR when done
- Do NOT wait for other parallel phases
```

---

## Prompt for Phase 6 Agent (Frontend)

```markdown
You are implementing Phase 6 — Frontend for the Section Lifecycle project.

## Context
Phase 1 (Foundation) is COMPLETE. The database schema, models, and migrations are already applied. You can assume:
- All new tables exist: `section_cancellations`, `pending_refunds`, `refunds`, `daily_jobs_log`, `section_completion_overrides`, `section_lifecycle_config`
- All new columns exist on `course_sections`: `flags`, `cancelled_at`, `cancelled_by`, `cancellation_reason`
- All SQLAlchemy models are importable
- The API contract is at `docs/plans/section-lifecycle/api-contract.json`

## What to Read
Read `docs/plans/section-lifecycle/phase-06-frontend.md` — it contains all the implementation details for this phase.

Also read `docs/plans/section-lifecycle/api-contract.json` for endpoint shapes.

## Your Phase Details
- **Estimate:** 5.75 days
- **Files to create:** All new UI components (see phase doc for full list)
- **Files to edit:** Existing section list/detail pages, student profile, i18n translation files

## Key Rules
1. **Do NOT touch files owned by other parallel phases.** Your phase owns specific files — only modify those.
2. **Add routes to the END of router.py** — do not insert in the middle of the file (avoids merge conflicts).
3. **Add new functions after existing ones** in service.py — do not inline-edit existing functions unless explicitly specified for your phase.
4. **Import models from Phase 1** — do NOT create new tables or columns.
5. **Follow the api-contract.json** for request/response shapes. If the contract is wrong, update it and notify the team.

## Independent Boundary
Do NOT modify:
- Do NOT create or modify any backend API endpoints
- Do NOT modify database schema or models
- Do NOT touch any Python backend file
- Work against the API contract from Phase 1; use mock data if backends aren't ready yet

## Merge Instructions
- Branch name: `phase-06-frontend`
- Work on your branch independently
- Create a PR when done
- Do NOT wait for other parallel phases
```

---

## Prompt for Phase 7 Agent (Reconciliation & Monitoring)

```markdown
You are implementing Phase 7 — Reconciliation & Monitoring for the Section Lifecycle project.

## Context
All previous phases (1-6) are COMPLETE and merged into main. This means:
- Database schema, models, migrations are applied (Phase 1)
- Startup daily checks are running on server boot (Phase 2)
- Grade & payment enforcement works in complete_section() (Phase 3)
- Cancellation and cashier disbursement are fully implemented (Phase 4)
- Deactivation is implemented (Phase 5)
- All frontend UI is built (Phase 6)
- All API endpoints from the contract are live

Your job is the consolidation layer: reporting, monitoring, admin audit views, and health checks.

## What to Read
Read `docs/plans/section-lifecycle/phase-07-reconciliation-monitoring.md` — it has all the details.

Also read the relevant existing service files to understand data structures:
- `backend/app/modules/academic/cancellation_service.py`
- `backend/app/modules/lms/cashier_service.py`
- `backend/app/modules/academic/section_startup_checks.py`

## Tasks
1. Create `backend/app/modules/academic/reconciliation_service.py` with daily reconciliation report generator
2. Add admin audit endpoints: cancellation history, override audit log, refund history
3. Add monitoring alert logging for severely overdue sections
4. Add financial impact dashboard endpoint (`GET /sections/financial-impact`)
5. Add health check for startup check system (`GET /health/startup-checks`)

## Key Rules
1. All your additions are READ-ONLY queries and reports. Do NOT modify any core business logic.
2. Add routes to the END of router.py files (avoids merge conflicts).
3. Follow the existing patterns for pagination, sorting, and response format.

## Merge Instructions
- Branch name: `phase-07-reconciliation`
- Create a PR when done
```

---

## Prompt for Phase 8 Agent (Testing)

```markdown
You are implementing Phase 8 — System Testing for the Section Lifecycle project.

## Context
ALL previous phases (1-7) are COMPLETE and merged into main. The entire section lifecycle system is deployed:
- Database schema, models ✅
- Startup daily checks ✅
- Grade & payment enforcement ✅
- Cancellation + cashier disbursement ✅
- Deactivation ✅
- Frontend UI ✅
- Reconciliation & monitoring ✅

Your job is to write comprehensive tests that verify everything works together.

## What to Read
Read `docs/plans/section-lifecycle/phase-08-system-testing.md` — it lists every test you need to write.

Also read all the backend service files to understand how to mock/stub:
- `section_startup_checks.py`
- `service.py` (especially `complete_section()`)
- `cancellation_service.py`
- `cashier_service.py`
- `ledger_service.py` (especially `deactivate_contract()`)

## Tasks
Create these test files with ALL tests listed in the phase document:

1. **Integration tests** — 7 test files covering:
   - Startup checks (8 tests)
   - Grade & payment enforcement (11 tests)
   - Cancellation (9 tests)
   - Disbursement (8 tests)
   - Deactivation (6 tests)
   - Full lifecycle flows (4 tests)
   - Reconciliation (5 tests)

2. **E2E tests** — 1 file covering cashier dashboard flow (5 tests)

## Key Rules
1. Each test file must be independently runnable with its own fixtures
2. Use clean data per test (no test pollution)
3. Mock external services (Supabase, etc.) — not the business logic
4. Test NULL vs 0 grade distinction thoroughly (this is a critical business rule)
5. Test all edge cases: closed days, duplicate disbursement, certificate blocks, teacher withdrawal blocks, force overrides
6. Do NOT skip tests or mark tests as "fixme" without a clear reason

## Merge Instructions
- Branch name: `phase-08-testing`
- Ensure all tests pass before creating the PR
- Run: `pytest tests/integration/section_lifecycle/ -v` and confirm all green
- Run: `npx playwright test tests/e2e/section-lifecycle/` and confirm all green
- Create PR when done
```
