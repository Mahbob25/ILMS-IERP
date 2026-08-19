# Agent Prompts — QA & Chaos Engineering Remediation

Use these prompts to instruct each agent. Each prompt is self-contained: give it to the agent and they have everything they need.

---

## Prompt for Phase 1 Agent (DB Constraints)

```markdown
You are implementing Phase 1 — DB CHECK Constraints + Partial Unique Index.

## Context
This is the FIRST phase. It sets the Alembic migration head that Phases 2 and 5 depend on. You are adding 13 CHECK constraints and 1 partial unique index. NO business logic changes.

## Audit Items Covered
D01–D13, S21

## What to Read
- `docs/qa-chaos-audit.md` (Section 2D — Database-Level Integrity Gaps, lines 147–163)
- `docs/plans/qa-chaos-remediation/phase-01-db-constraints.md` (detailed tasks)

## Your Phase Details
- **Estimate:** 1 day
- **Files to create:** 1 Alembic migration
- **Files to edit:** None

## Tasks
1. Create an Alembic migration that adds these 13 CHECK constraints:
   - `payments`: `CHECK (amount > 0)`
   - `expenses`: `CHECK (amount > 0)`
   - `pending_refunds`: `CHECK (amount > 0)`
   - `refunds`: `CHECK (amount > 0)`
   - `teacher_wallets`: `CHECK (balance >= 0)`
   - `teacher_wallets`: `CHECK (frozen_balance >= 0)`
   - `teacher_wallets`: `CHECK (frozen_balance <= balance)`
   - `ledger_entries`: `CHECK (available_delta + frozen_delta = total_amount)`
   - `enrollments`: `CHECK (0 <= admin_discount AND admin_discount <= 100)`
   - `final_grades`: `CHECK (0 <= final_score AND final_score <= 100)`
   - `grades`: `CHECK (score >= 0)`
   - `course_sections`: `CHECK (price >= 0)`
   - `section_contracts`: `CHECK (0 <= holdback_rate AND holdback_rate <= 1)`

2. Add partial unique index:
   ```sql
   CREATE UNIQUE INDEX uq_enrollments_active
     ON enrollments (student_id, section_id)
     WHERE deleted_at IS NULL;
   ```

3. Before adding constraints, scan each table for violating rows and fix/report them.

4. Use `NOT VALID` + `VALIDATE CONSTRAINT` pattern for large tables.

5. Note the migration revision ID — it becomes the head that Phases 2 and 5 reference.

## Key Rules
1. Do NOT modify any SQLAlchemy models — these are DB-level only.
2. Do NOT modify any business logic.
3. Do NOT create any new tables.

## Independent Boundary
- Do NOT modify `academic/service.py`, `lms/financial_service.py`, or any business logic files
- Do NOT touch frontend code

## Acceptance Criteria
- [ ] All 13 constraints exist and validate on insert/update
- [ ] `uq_enrollments_active` index exists and allows re-enrollment after soft-delete
- [ ] Migration revision ID documented

## Merge Instructions
- Branch name: `fix-qa-phase-01-check-constraints`
- Create branch FROM main
- Work ONLY on this branch
- Create a PR for review when done, then stop
- Rebase on main before PR: `git rebase main`
```

---

## Prompt for Phase 2 Agent (DB Sequences)

```markdown
You are implementing Phase 2 — DB Sequences for Receipt, Voucher, and Certificate Numbers.

## Context
Phase 1 is COMPLETE and MERGED. You need Phase 1's migration revision ID as your `down_revision`. You are creating 4 DB sequences and a certificate numbering function. NO business logic changes.

## Audit Items Covered
R01–R04, S29

## What to Read
- `docs/qa-chaos-audit.md` (Section 2B — Race Condition Inventory, lines 107–122)
- `docs/plans/qa-chaos-remediation/phase-02-db-sequences.md` (detailed tasks)

## Your Phase Details
- **Estimate:** 1 day
- **Files to create:** 1 Alembic migration (depends on Phase 1 head)
- **Files to edit:** None

## Tasks
1. Create 4 DB sequences:
   - `seq_receipt_number` — for payment receipts (PAY-YYYYMMDD-NNNNNN)
   - `seq_voucher_number` — for expense vouchers (EXP-YYYYMMDD-NNNNNN)
   - `seq_refund_receipt_number` — for refund receipts (RFD-YYYYMMDD-NNNNNN)
   - `seq_certificate_number` — for certificates (CERT-YYYY-NNNNNN)

2. Create `certificate_sequence_tracker` table with `year VARCHAR(4) PK` and `created_at`.

3. Create `next_certificate_number()` PL/pgSQL function:
   - Reads current year
   - Restarts sequence if year changed
   - Returns `CERT-YYYY-NNNNNN`

## Key Rules
1. Migration must use Phase 1's head revision as `down_revision`.
2. Do NOT modify any business logic files — the code to USE these sequences will be added by Phases 3 and 4.
3. Do NOT create CHECK constraints.

## Independent Boundary
- Do NOT touch `academic/service.py`, `lms/financial_service.py`, or any business logic
- Do NOT touch frontend

## Acceptance Criteria
- [ ] All 4 sequences exist in the database
- [ ] `next_certificate_number()` returns `CERT-2026-XXXXXX` format
- [ ] Migration depends on Phase 1 head revision

## Merge Instructions
- Branch name: `fix-qa-phase-02-db-sequences`
- Create branch FROM main
- Work ONLY on this branch
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 3 Agent (Conditional UPDATE Patterns)

```markdown
You are implementing Phase 3 — Conditional UPDATE Patterns + Orphaned State Transactions.

## Context
This phase fixes race conditions in status transitions and orphaned states from partial failures. You are modifying backend service files only. NO schema changes. You share `academic/service.py` with Phase 4 — you own `complete_section()`, `set_final_grades_bulk()`, and `cancel_section()`.

## Audit Items Covered
R08–R12, O01–O06, O08, S15, S25, S27

## What to Read
- `docs/qa-chaos-audit.md` (Sections 2A, 2B, and Task 1 scenarios)
- `docs/plans/qa-chaos-remediation/phase-03-conditional-updates.md` (detailed tasks)
- Read the specific source files before editing

## Your Phase Details
- **Estimate:** 3 days
- **Files to create:** None
- **Files to edit:**
  - `apps/erp/backend/app/modules/lms/ledger_service.py` — `activate_contract()`, `settle_contract()`, `cancel_contract()`, `approve_amendment()`
  - `apps/erp/backend/app/modules/lms/cashier_service.py` — `disburse_refund()`
  - `apps/erp/backend/app/modules/academic/cancellation_service.py` — `cancel_section()`
  - `apps/erp/backend/app/modules/lms/compensation_service.py` — amendment approval
  - `apps/erp/backend/app/modules/academic/service.py` — `complete_section()`, `set_final_grades_bulk()`, `deactivate_section()`, enrollment+payment flow

## Tasks
1. **Contract status transitions (R08–R10):** Replace read-then-mutate with `UPDATE ... WHERE status = 'expected' RETURNING *` in all contract status transitions.
2. **Refund disbursement (R11):** Replace read-then-mutate with `UPDATE pending_refunds SET status = 'CLAIMED' WHERE id = X AND status = 'UNCLAIMED'`.
3. **Amendment approval (R12):** Add conditional status transition on contract + amendment rows.
4. **Cancel section transaction (O01, S15):** Wrap wallet reversal, section_cancellations record, and pending_refunds creation in a single DB transaction using `flush()` not `commit()`. Roll back on any failure.
5. **Disburse refund transaction (O02):** Atomic PendingRefund status update + ledger entry + Refund record.
6. **Complete section transaction (O03, S27):** Atomic section status + contract settlement + ledger finalize + certificates.
7. **Set final grades transaction (O04):** Atomic grades insertion + contract status + ledger finalize.
8. **Close day transaction (O05):** Atomic validations + closure record.
9. **Enrollment+payment transaction (O06):** Atomic enrollment + payment creation.
10. **Refund expense tracking (O08):** Atomic expense + ledger entry.
11. **Replace `commit()` with `flush()`** at `cancellation_service.py:292` and `service.py:404`.

## Key Rules
1. Add new functions AFTER existing ones — do not inline-edit unless specified.
2. Follow existing code patterns (SQLAlchemy async session usage).
3. Do NOT touch `academic/service.py` enrollment capacity or payment balance functions (Phase 4 owns those).

## Independent Boundary
- Do NOT modify DB schema or migrations
- Do NOT add SELECT FOR UPDATE (Phase 4 concern)
- Do NOT create idempotency keys (Phase 5 concern)
- Do NOT modify `lms/financial_service.py`
- Do NOT modify frontend files

## Acceptance Criteria
- [ ] All contract status transitions use `WHERE status = 'old_status'`
- [ ] `cancel_section()` is fully transactional — any step failure rolls back all steps
- [ ] All orphaned state operations (O01–O06, O08) are atomic
- [ ] No premature `commit()` calls remain inside service functions

## Merge Instructions
- Branch name: `fix-qa-phase-03-conditional-updates`
- Create branch FROM main
- Work ONLY on this branch
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 4 Agent (SELECT FOR UPDATE)

```markdown
You are implementing Phase 4 — SELECT FOR UPDATE + Concurrency Locks.

## Context
This phase adds pessimistic locking to prevent race conditions in enrollment capacity, payment remaining-balance, wallet operations, and day-closure TOCTOU. You share `academic/service.py` with Phase 3 — you own the enrollment capacity and payment balance functions only.

## Audit Items Covered
R05–R07, R13–R14, S16, S19–S20, S23–S24, S26, S30, S32

## What to Read
- `docs/qa-chaos-audit.md` (Section 2B — Race Conditions, Task 1 scenarios especially S23, S24, S26, S30)
- `docs/plans/qa-chaos-remediation/phase-04-select-for-update.md` (detailed tasks)
- Read the specific source files before editing

## Your Phase Details
- **Estimate:** 2.5 days
- **Files to create:** None
- **Files to edit:**
  - `apps/erp/backend/app/modules/academic/service.py` — Enrollment function (capacity check section)
  - `apps/erp/backend/app/modules/lms/financial_service.py` — Payment creation function (remaining balance)
  - `apps/erp/backend/app/modules/lms/ledger_service.py` — `approve_amendment()` wallet lock, contract activation lock
  - User creation endpoint — `grant_access()` IntegrityError handler
  - Closure/payment endpoint — advisory lock for TOCTOU
  - Unlock approval endpoint — SELECT FOR UPDATE + audit

## Tasks
1. **Enrollment capacity (R06, S23):** Add `with_for_update()` when reading the `CourseSection` row before checking `enrolled_count < capacity`.
2. **Payment remaining balance (R05, S24):** Add `with_for_update()` when reading enrollment's payments before computing remaining balance.
3. **Wallet upsert (R07):** Replace read-check-create with `INSERT ... ON CONFLICT DO NOTHING` for wallet creation.
4. **Email uniqueness (R13):** Ensure UNIQUE constraint on `users.email` + handle `IntegrityError` in `grant_access()` with 409 response.
5. **Day closure TOCTOU (R14, S16):** Add `pg_advisory_xact_lock(hashtext('daily_closure:' || date))` before payment creation and day closure operations.
6. **Amendment wallet lock (S30):** Add `with_for_update()` on wallet row in `approve_amendment()`.
7. **Contract activation lock (S26):** Add `with_for_update()` on contract row before status transition.
8. **Closure unlock concurrency (S32):** Add `SELECT FOR UPDATE` + audit logging on unlock approval.

## Key Rules
1. In `academic/service.py`, only touch the enrollment capacity function — do NOT touch `complete_section()`, `set_final_grades_bulk()`, or `cancel_section()`.
2. In `ledger_service.py`, only touch `approve_amendment()` and wallet functions — do NOT touch contract status transition functions.
3. Follow existing SQLAlchemy async patterns: `stmt = select(Model).where(...).with_for_update(); result = await db.execute(stmt)`.

## Independent Boundary
- Do NOT modify DB schema or migrations
- Do NOT modify conditional UPDATE status transition patterns (Phase 3 concern)
- Do NOT create idempotency keys (Phase 5 concern)
- Do NOT modify frontend files

## Acceptance Criteria
- [ ] Every capacity check locks the section row with `SELECT FOR UPDATE`
- [ ] Every payment balance check locks the enrollment with `SELECT FOR UPDATE`
- [ ] Wallet creation uses `INSERT ... ON CONFLICT DO NOTHING`
- [ ] Advisory lock protects all payment + closure operations on the same date
- [ ] Email uniqueness has both DB constraint + `IntegrityError` handler
- [ ] Amendment approval locks the wallet row

## Merge Instructions
- Branch name: `fix-qa-phase-04-select-for-update`
- Create branch FROM main
- Work ONLY on this branch
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 5 Agent (Idempotency Keys)

```markdown
You are implementing Phase 5 — Idempotency Key Middleware.

## Context
This phase adds idempotency key support to prevent duplicate processing when users double-click or network drops mid-request. You create a new table, middleware, service layer, and integrate into all POST endpoints. Phase 1 must be merged before you start.

## Audit Items Covered
S01, S13

## What to Read
- `docs/qa-chaos-audit.md` (S01, S13 scenario descriptions)
- `docs/plans/qa-chaos-remediation/phase-05-idempotency-keys.md` (detailed tasks)
- Read `apps/erp/backend/app/main.py` and a sample `router.py` to understand middleware registration

## Your Phase Details
- **Estimate:** 2 days
- **Files to create:**
  - `apps/erp/backend/app/middleware/idempotency.py` — FastAPI middleware
  - `apps/erp/backend/app/modules/lms/idempotency_service.py` — CRUD + cleanup
  - Alembic migration — `idempotency_keys` table (depends on Phase 1 head)
- **Files to edit:**
  - `apps/erp/backend/app/main.py` — wire middleware
  - `apps/erp/backend/app/modules/models.py` — add `IdempotencyKey` model
  - `apps/erp/frontend/lib/api.ts` — add idempotency-key request interceptor (NEW interceptor, do NOT modify existing ones)

## Tasks
1. Create `idempotency_keys` table: `id UUID PK`, `idempotency_key VARCHAR(255)`, `endpoint VARCHAR(100)`, `response_status INT`, `response_body JSONB`, `created_at TIMESTAMPTZ`, UNIQUE(key, endpoint).
2. Create `IdempotencyKey` SQLAlchemy model in `models.py`.
3. Create `IdempotencyMiddleware` in `middleware/idempotency.py` that:
   - Checks `Idempotency-Key` header on POST/PATCH/PUT
   - Returns cached response if key exists with `X-Idempotency-Replayed: true`
   - Stores response after successful processing
   - Does NOT cache 5xx responses
4. Wire in `main.py` with `app.add_middleware(IdempotencyMiddleware)`.
5. Add request interceptor in `apps/erp/frontend/lib/api.ts` that generates a UUID and attaches `Idempotency-Key` header to all mutating requests.
6. Add cleanup function that deletes keys older than 24h.

## Key Rules
1. In `api.ts`, add a NEW interceptor — do NOT touch existing ones (Phase 9 owns the error handler and promise fix).
2. Add middleware after CORS but before route handlers.

## Independent Boundary
- Do NOT modify any business logic service files
- Do NOT modify DB CHECK constraints or sequences
- Do NOT modify conditional UPDATE patterns
- Do NOT add SELECT FOR UPDATE
- Do NOT modify individual POST endpoint logic — middleware applies globally

## Acceptance Criteria
- [ ] First request with idempotency key → processed normally
- [ ] Second request with same key → returns cached response with replay header
- [ ] 5xx responses are NOT cached
- [ ] Expired keys cleaned up daily
- [ ] Frontend generates and sends idempotency keys automatically

## Merge Instructions
- Branch name: `fix-qa-phase-05-idempotency-keys`
- Create branch FROM main
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 6 Agent (Backend Silent Failures)

```markdown
You are implementing Phase 6 — Backend Silent Failures: Logging & Error Propagation.

## Context
This phase fixes 5 locations where exceptions are silently swallowed, 1 partial batch write, 1 idempotency gap in startup checks, and 1 disk space gap. Backend-only — no schema or frontend changes.

## Audit Items Covered
F01–F03, F10–F11, S14, O07, S31

## What to Read
- `docs/qa-chaos-audit.md` (Section 2C — Silent Failures, lines 131–143)
- `docs/plans/qa-chaos-remediation/phase-06-backend-silent-failures.md` (detailed tasks)
- Read the specific source files and lines listed below

## Your Phase Details
- **Estimate:** 1.5 days
- **Files to create:** None
- **Files to edit:**

| File | Line(s) | Change |
|------|---------|--------|
| `apps/erp/backend/app/modules/academic/service.py` | 352–356 | Add `logger.error()` before `continue` (F01) |
| `apps/erp/backend/app/modules/academic/service.py` | 754–758 | Add `logger.error()` before `pass` (F02) |
| `apps/erp/backend/app/modules/academic/service.py` | 404 | `commit()` → `flush()` (F11) |
| `apps/erp/backend/app/modules/lms/financial_service.py` | 84–86 | Add `logger.warning()` for missing enrollment (F03) |
| `apps/erp/backend/app/modules/academic/cancellation_service.py` | 292 | `commit()` → `flush()` (F10) |
| `apps/erp/backend/app/modules/academic/service.py` | Attendance handler | Transactional batch save (S14) |
| Startup checks file | `run_daily_section_checks()` | Add idempotency guard via `DailyJobsLog` (O07) |
| PDF/service generation | Receipt/certificate service | Add disk space check before file ops (S31) |

## Tasks
1. **F01 (line 352):** Replace bare `continue` — add `logger.error("Certificate failed for student %s: %s", student_id, e)` before `raise`.
2. **F02 (line 754):** Replace bare `pass` — add `logger.error("Ledger finalize failed: %s", e)` before `raise`.
3. **F03 (line 84):** Add `logger.warning("Payment attempt on non-existent enrollment %s", enrollment_id)` before returning error.
4. **F10 (line 292):** Replace `await db.commit()` with `await db.flush()`.
5. **F11 (line 404):** Replace `await db.commit()` with `await db.flush()`.
6. **S14:** Wrap attendance batch in try/except — `db.rollback()` on failure, `raise HTTPException` with retry message.
7. **O07:** Check `DailyJobsLog` for today's date before running checks. Log and skip if already ran.
8. **S31:** Add `shutil.disk_usage()` check before PDF/receipt generation — raise if < 100MB free.

## Key Rules
1. In `academic/service.py`, only touch lines 352–356, 404, 754–758, and the attendance handler.
2. Use the existing logger from the module (`import logging; logger = logging.getLogger(__name__)`).
3. Do NOT add try/except that swallows — errors should propagate to the caller with logging.

## Independent Boundary
- Do NOT modify DB schema or migrations
- Do NOT add conditional UPDATE or SELECT FOR UPDATE
- Do NOT modify frontend files
- Do NOT touch `router.py` files

## Acceptance Criteria
- [ ] Certificate failures logged at ERROR level
- [ ] Ledger finalize failures logged at ERROR level
- [ ] Payment audit logging for missing enrollments
- [ ] No premature `commit()` calls remain
- [ ] Attendance batch is transactional
- [ ] Startup checks are idempotent
- [ ] Disk space checked before PDF generation

## Merge Instructions
- Branch name: `fix-qa-phase-06-silent-failures`
- Create branch FROM main
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 7 Agent (Infrastructure)

```markdown
You are implementing Phase 7 — Infrastructure & Deployment.

## Context
This phase adds CI/CD, database backups, container security, Sentry monitoring, structured logging, health checks, and fixes other infrastructure gaps. Broad scope but each change is independent.

## Audit Items Covered
I01–I03, I07, I09–I13, S28

## What to Read
- `docs/qa-chaos-audit.md` (Section 2E — Infrastructure & Deployment Gaps, lines 165–181)
- `docs/plans/qa-chaos-remediation/phase-07-infrastructure.md` (detailed tasks)

## Your Phase Details
- **Estimate:** 2.5 days
- **Files to create:**
  - `.github/workflows/ci.yml` — CI/CD pipeline
  - `apps/erp/backend/scripts/backup.sh` — pg_dump backup script
  - `apps/erp/backend/app/core/logging.py` — structured logging config
- **Files to edit:**
  - `apps/erp/backend/Dockerfile` — add `USER appuser` + `HEALTHCHECK`
  - `apps/erp/backend/app/main.py` — add Sentry init
  - `apps/erp/backend/app/core/database.py` — configure pool_size, max_overflow, pool_timeout
  - `apps/erp/frontend/app/layout.tsx` — add Sentry init
  - `apps/erp/frontend/lib/api.ts` — add `Sentry.captureException()` in error interceptor
  - `infrastructure/caddy/Caddyfile` — replace `tls internal` with Let's Encrypt config
  - `tests/test_v1_7_full_e2e.py` — remove hardcoded credentials, use env vars
  - All backend service files — replace `print()` with `logging.info()`
  - Frontend components — replace `console.log()` with structured wrapper

## Tasks
1. Create GitHub Actions CI/CD with PostgreSQL service, test run, lint, build.
2. Create `backup.sh` with pg_dump + offsite upload + 30-day retention.
3. Add `USER appuser` to Dockerfile (after package install, before CMD).
4. Add Sentry SDK to backend (`main.py`) and frontend (`layout.tsx`, `api.ts`).
5. Configure DB pool: `pool_size=10`, `max_overflow=20`, `pool_timeout=30`, `pool_pre_ping=True`.
6. Create structured logging module, replace `print()` / `console.log()`.
7. Add `HEALTHCHECK` to Dockerfiles (curl to health endpoint).
8. Replace `tls internal` with Let's Encrypt config in Caddyfile.
9. Remove hardcoded DB password from test script, add `.env.test`.
10. Add logrotate config for application logs.

## Key Rules
1. In `infrastructure/caddy/Caddyfile`, ONLY replace `tls internal` — do NOT add header directives (Phase 8).
2. In `apps/erp/frontend/lib/api.ts`, only add `Sentry.captureException()` — do NOT modify the promise fix (F04), error discrimination (F09), or `isRedirectingToLogin` (Phase 9).
3. Add Sentry init BEFORE other middleware registrations in `main.py`.

## Independent Boundary
- Do NOT modify business logic in service files (beyond logging)
- Do NOT modify DB schema
- Do NOT add CSRF or rate limiting (Phase 8)
- Do NOT modify frontend component behavior or state management (Phase 9)

## Acceptance Criteria
- [ ] CI/CD runs on push/PR with PostgreSQL service
- [ ] Backup script creates dumps and uploads to offsite storage
- [ ] Docker containers run as non-root user
- [ ] Sentry captures backend and frontend errors
- [ ] DB pool timeout prevents infinite hang on exhausted pool
- [ ] No hardcoded credentials in test scripts
- [ ] HEALTHCHECK configured on all containers
- [ ] TLS uses Let's Encrypt for public domains
- [ ] No `print()` or `console.log()` in production code

## Merge Instructions
- Branch name: `fix-qa-phase-07-infrastructure`
- Create branch FROM main
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 8 Agent (Security & Rate Limiting)

```markdown
You are implementing Phase 8 — Rate Limiting, CSRF, and Security Headers.

## Context
This phase adds security headers to Caddy, CSRF middleware, real IP detection, and rate limiting on all endpoints. These are the last security layer before production deployment.

## Audit Items Covered
I04–I06, I08

## What to Read
- `docs/qa-chaos-audit.md` (Section 2E — I04, I05, I06, I08; Appendix B — Attack Surface)
- `docs/plans/qa-chaos-remediation/phase-08-security-rate-limiting.md` (detailed tasks)

## Your Phase Details
- **Estimate:** 1.5 days
- **Files to create:**
  - `apps/erp/backend/app/middleware/real_ip.py` — X-Forwarded-For parsing
  - `apps/erp/backend/app/middleware/csrf.py` — CSRF token validation
  - `apps/erp/backend/app/core/rate_limit.py` — Rate limiter configuration
- **Files to edit:**
  - `infrastructure/caddy/Caddyfile` — APPEND security headers to server block
  - `apps/erp/backend/app/main.py` — wire RealIP, CSRF, rate limiter
  - `apps/erp/backend/app/modules/lms/router.py` — add `@limiter.limit("10/minute")` to financial endpoints
  - `apps/erp/backend/app/modules/academic/router.py` — add `@limiter.limit("20/minute")` to enrollment endpoints
  - `apps/erp/frontend/lib/api.ts` — add CSRF token interceptor + `getCookie()` utility

## Tasks
1. Add to Caddyfile: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy headers.
2. Create `RealIPMiddleware` that reads `X-Forwarded-For` header and updates `request.scope["client"]`.
3. Create `CSRFMiddleware` that validates `X-CSRF-Token` header against `csrf_token` cookie for all state-changing requests.
4. Create rate limiter with slowapi, using real client IP as the key.
5. Apply rate limits: 10/min financial, 20/min enrollment, 100/min other non-auth.
6. In `api.ts`, add interceptor that attaches CSRF token to mutating requests.

## Key Rules
1. In Caddyfile, APPEND headers at the end — do NOT touch `tls internal` or `tls` block (Phase 7).
2. In `api.ts`, only add the CSRF token interceptor — do NOT touch F04 (promise), F09 (error discrimination), `isRedirectingToLogin`, or idempotency key interceptor.
3. Wire middleware in order: RealIPMiddleware → CSRFMiddleware → rate limiter → IdempotencyMiddleware (if Phase 5 merged).

## Independent Boundary
- Do NOT modify business logic in service files
- Do NOT modify DB schema
- Do NOT modify Dockerfile TLS or health checks

## Acceptance Criteria
- [ ] All security headers present in Caddy response
- [ ] Rate limiter uses real client IP from `X-Forwarded-For`
- [ ] CSRF middleware returns 403 on missing/mismatched token
- [ ] Rate limits applied: 10/min financial, 20/min enrollment, 100/min others
- [ ] Rate limit exceeded returns 429 with `Retry-After`
- [ ] Frontend attaches CSRF token to all mutating requests

## Merge Instructions
- Branch name: `fix-qa-phase-08-security-rate-limit`
- Create branch FROM main
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 9 Agent (Frontend Resilience)

```markdown
You are implementing Phase 9 — Frontend Resilience: UX, Error States, Input Validation.

## Context
This phase fixes all frontend issues from the audit: hung promises, error swallowing, button double-click, PRG pattern, input sanitization, permission messages, and more. Frontend only — no backend changes.

## Audit Items Covered
S02–S06, S09, S11–S12, S17–S18, S22, F04–F09

## What to Read
- `docs/qa-chaos-audit.md` (Section 2C — F04–F09; Task 1 — S02–S06, S09, S11–S12, S17–S18, S22)
- `docs/plans/qa-chaos-remediation/phase-09-frontend-resilience.md` (detailed tasks)
- Read `apps/erp/frontend/lib/api.ts` and `apps/erp/frontend/components/AuthContext.tsx` and relevant page components

## Your Phase Details
- **Estimate:** 3 days
- **Files to create:**
  - `apps/erp/frontend/lib/utils/input.ts` — sanitization and validation
  - `apps/erp/frontend/components/AccessDenied.tsx` — permission denied display
  - `apps/erp/frontend/components/EmptyState.tsx` — empty data display
  - `apps/erp/frontend/app/dashboard/error.tsx` — error boundary
  - `apps/erp/frontend/app/dashboard/loading.tsx` — loading state
- **Files to edit:**
  - `apps/erp/frontend/lib/api.ts` — lines 16, 45, response error interceptor
  - `apps/erp/frontend/components/AuthContext.tsx` — lines 85–96, refresh coordination
  - All frontend form page components — add `submitting` state + disabled buttons
  - All frontend form page components — add PRG redirect after submit
  - All frontend form page components — apply `sanitizeInput()` on text fields
  - Students page component — F06 fix: user-facing error toast
  - Sections page component — F07, F08: proper error UI, UUID leak fix
  - Search components — apply `escapeLikeWildcards()` before search
  - Dashboard component — force refetch after bulk-grade
  - Report views — handle empty data

## Tasks
1. **F04 (api.ts:45):** Replace `new Promise<never>(() => {})` with `Promise.reject(new Error("Session expired"))`.
2. **S18 (api.ts:16):** Add `setTimeout(() => { isRedirectingToLogin = false }, 5000)` after redirect.
3. **F09 (api.ts):** Differentiate 401 (redirect) vs network error (show message) vs 500 (retry) vs 403 (permission).
4. **F05 (AuthContext.tsx):** Fix logout error handling — clear all cookies even if API fails.
5. **S22 (AuthContext.tsx):** Cancel in-flight refresh before proceeding with logout.
6. **Form buttons (all pages):** Add `const [submitting, setSubmitting] = useState(false)`, guard with `if (submitting) return`, set `disabled={submitting}`.
7. **PRG pattern (S17):** After successful form submit, use `router.replace('/success')` to prevent back-button resubmission.
8. **Input sanitization (S02, S03):** Create `sanitizeInput()` (trims spaces) and `escapeLikeWildcards()` (escapes `%_`). Apply on all text inputs.
9. **Permission messages (S06):** Show `AccessDenied` component instead of silent redirect bounce.
10. **Dashboard refetch (S11):** Force dashboard data refetch after bulk-grade operation.
11. **Empty reports (S12):** Show `EmptyState` component for empty data.
12. **Error display (F06, F07, F08):** Replace `console.error(e)` / `.catch(() => null)` with user-facing error messages and `logger.error()`.
13. **error.tsx/loading.tsx:** Add error boundary and loading state for dashboard route group.

## Key Rules
1. In `api.ts`, do NOT touch the idempotency-key interceptor (Phase 5) — only edit lines 16, 45, and the response error handler.
2. Do NOT modify any backend Python files.
3. Do NOT modify DB schema.
4. Create new utility files rather than inlining utilities in components.

## Independent Boundary
- Do NOT modify any backend Python files
- Do NOT modify DB schema or migrations
- Do NOT add CSRF middleware or rate limiting (Phase 8)
- Do NOT modify `infrastructure/` files

## Acceptance Criteria
- [ ] No `new Promise<never>(() => {})` remains
- [ ] `isRedirectingToLogin` resets after timeout
- [ ] Error handler distinguishes 401 vs network error vs 500 vs 403
- [ ] Logout clears session regardless of API result
- [ ] Logout cancels in-flight refresh
- [ ] All form buttons have `disabled={submitting}` state
- [ ] PRG pattern prevents back-button resubmission
- [ ] Input sanitization trims spaces and escapes LIKE wildcards
- [ ] Permission denied shows clear message
- [ ] Dashboard refetches after write operations
- [ ] Empty reports show "No data" message

## Merge Instructions
- Branch name: `fix-qa-phase-09-frontend-resilience`
- Create branch FROM main
- `git rebase main` before creating PR
- Create a PR for review when done
```

---

## Prompt for Phase 10 Agent (Testing)

```markdown
You are implementing Phase 10 — Testing: Unit, Integration, E2E, and Load Tests.

## Context
ALL previous phases (1–9) are COMPLETE and MERGED into main. The entire QA & Chaos Engineering remediation is deployed:
- DB CHECK constraints + partial unique index (Phase 1) ✅
- DB sequences for numbers (Phase 2) ✅
- Conditional UPDATE patterns + orphaned state transactions (Phase 3) ✅
- SELECT FOR UPDATE + concurrency locks (Phase 4) ✅
- Idempotency key middleware (Phase 5) ✅
- Backend silent failures fixed (Phase 6) ✅
- Infrastructure + CI/CD + Sentry + Docker (Phase 7) ✅
- Security headers + CSRF + rate limiting (Phase 8) ✅
- Frontend resilience + error states (Phase 9) ✅

Your job is to validate ALL fixes with comprehensive tests.

## Audit Items Covered
All audit items, plus items 24–35 from the priority plan (ongoing improvements).

## What to Read
- `docs/qa-chaos-audit.md` (full audit — every S##, R##, O##, F##, D##, I##)
- `docs/plans/qa-chaos-remediation/phase-10-testing.md` (detailed test list)
- All backend service files to understand the implementation

## Your Phase Details
- **Estimate:** 5 days
- **Files to create:** ~25+ test files (see phase doc for full list)
- **Files to edit:** Test config files if needed (conftest.py, playwright.config.ts)

## Test Types to Create

### Unit Tests (pytest)
- `apps/erp/backend/tests/unit/test_db_constraints.py` — 13 constraint enforcement checks
- `apps/erp/backend/tests/unit/test_db_sequences.py` — sequence increment + year reset
- `apps/erp/backend/tests/unit/test_conditional_updates.py` — status transition guards
- `apps/erp/backend/tests/unit/test_idempotency.py` — key rejection, TTL, replay
- `apps/erp/backend/tests/unit/test_logging.py` — silent failure logging verification
- `apps/erp/backend/tests/unit/test_csrf.py` — token validation
- `apps/erp/backend/tests/unit/test_rate_limit.py` — limit enforcement + IP parsing

### Integration Tests (pytest, async)
- `apps/erp/backend/tests/integration/test_enrollment_concurrency.py` — 10 concurrent enrollments, verify capacity respected
- `apps/erp/backend/tests/integration/test_payment_concurrency.py` — 10 concurrent payments, verify no overpayment
- `apps/erp/backend/tests/integration/test_contract_activation.py` — 5 concurrent activations, verify exactly 1 succeeds
- `apps/erp/backend/tests/integration/test_refund_disbursement.py` — 5 concurrent disbursements, verify exactly 1 succeeds
- `apps/erp/backend/tests/integration/test_cancel_section_transaction.py` — mock failure, verify rollback
- `apps/erp/backend/tests/integration/test_orphaned_states.py` — O01–O08, verify no partial writes
- `apps/erp/backend/tests/integration/test_idempotency_e2e.py` — POST + replay, verify single processing
- `apps/erp/backend/tests/integration/test_db_constraints_integration.py` — violate each constraint
- `apps/erp/backend/tests/integration/test_security_headers.py` — CSP, HSTS, XFO verification
- `apps/erp/backend/tests/integration/test_csrf.py` — CSRF pass/fail
- `apps/erp/backend/tests/integration/test_rate_limit_headers.py` — rate limit header verification

### E2E Tests (Playwright)
- `apps/erp/frontend/tests/e2e/qa-chaos/double-click-prevention.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/input-sanitization.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/search-wildcards.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/permission-denied.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/empty-report.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/token-refresh.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/error-display.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/prg-pattern.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/visual/error-states.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/visual/form-submitting.spec.ts`
- `apps/erp/frontend/tests/e2e/qa-chaos/a11y/form-errors.spec.ts`

### Load Tests (k6 or Locust)
- `apps/erp/backend/tests/load/test_enrollment.py` — 50 concurrent enrollments, capacity 20
- `apps/erp/backend/tests/load/test_payment.py` — 20 concurrent payments, single enrollment
- `apps/erp/backend/tests/load/test_mixed_workload.py` — mixed enrollments, payments, refunds, searches

## Key Rules
1. Each test file must be independently runnable with clean fixtures.
2. Use separate databases/test data per test — no test pollution.
3. Mock external services, not business logic.
4. Concurrency tests must use `asyncio.gather` or threading to simulate simultaneous requests.
5. Do NOT modify any production code — test files only.
6. Use `pytest-asyncio` for async test support.

## Independent Boundary
- Do NOT modify any production code
- Do NOT modify DB schema or migrations
- Do NOT modify Caddyfile or infrastructure
- All changes are TEST-ONLY

## Acceptance Criteria
- [ ] All unit tests pass (80%+ coverage)
- [ ] All integration tests pass (including concurrency tests)
- [ ] All E2E tests pass across Chromium, Firefox, WebKit
- [ ] Load tests show no deadlocks under 2x expected load
- [ ] Visual regression tests pass
- [ ] Accessibility tests pass (no aXe violations)
- [ ] Coverage meets 80%+ for all modules

## Merge Instructions
- Branch name: `fix-qa-phase-10-testing`
- Ensure all tests pass before creating the PR
- Run: `pytest -v` and confirm all green
- Run: `npx playwright test` and confirm all green
- `git rebase main` before creating PR
- Create a PR for review when done
```
