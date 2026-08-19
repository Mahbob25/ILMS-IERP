# Phase-Dependency Inventory

Every audit item mapped to exactly one fixing phase. No item is fixed by two phases.

## Stress Test Scenarios (S01–S32)

| ID | Description | Phase | Fix Type |
|----|------------|-------|----------|
| S01 | Double-click Save Payment | 5 — Idempotency Keys | Idempotency key middleware |
| S02 | Trailing spaces in student name | 9 — Frontend Resilience | Input sanitization |
| S03 | SQL LIKE wildcards in search | 9 — Frontend Resilience | Input sanitization (escape LIKE params) |
| S04 | Arabic/English mixed input | 9 — Frontend Resilience | Locale validation |
| S05 | Expired session during form fill | 6 — Backend Silent Failures | Fix `new Promise<never>(() => {})` (F04) |
| S06 | Permission denied silent redirect | 9 — Frontend Resilience | User-facing permission message |
| S07 | Existing student code | — | **Already passes** |
| S08 | Cascade delete course with sections | 6 — Backend Silent Failures | Verify RESTRICT behavior, log if ORM bypasses |
| S09 | Network glitch during form save | 6 — Backend Silent Failures | Retry logic + error user feedback |
| S10 | Two tabs enroll same student | — | **Already passes** (UNIQUE constraint) |
| S11 | Dashboard stale after bulk-grade | 9 — Frontend Resilience | Force refetch on navigation |
| S12 | Empty report export | 9 — Frontend Resilience | "No data" handling in report views |
| S13 | Network drops mid-payment creation | 5 — Idempotency Keys | Idempotency key on payment endpoint |
| S14 | Token expires during attendance batch | 6 — Backend Silent Failures | Transactional batch + error re-entry |
| S15 | Server restart during section cancellation | 3 — Conditional UPDATE | Orphaned state transaction fix (O01) |
| S16 | Concurrent payment + day-closure at midnight | 4 — SELECT FOR UPDATE | TOCTOU: advisory lock on daily_closures |
| S17 | Browser back after form submission | 9 — Frontend Resilience | PRG (Post-Redirect-Get) pattern |
| S18 | Token rotation 401 race | 9 — Frontend Resilience | Fix `isRedirectingToLogin` never-reset |
| S19 | Two managers close same day | 4 — SELECT FOR UPDATE | Handle IntegrityError, add audit log |
| S20 | Withdraw before cancellation reversal | 4 — SELECT FOR UPDATE | `balance >= 0` CHECK + wallet lock |
| S21 | Re-enroll after soft-delete unenrollment | 1 — DB Constraints | Partial unique index `WHERE deleted_at IS NULL` |
| S22 | Refresh token rotation during logout | 9 — Frontend Resilience | Coordination between logout + refresh |
| S23 | 50 concurrent enrollments (capacity race) | 4 — SELECT FOR UPDATE | `SELECT FOR UPDATE` on section row |
| S24 | 10 concurrent payments (overpayment race) | 4 — SELECT FOR UPDATE | `SELECT FOR UPDATE` on enrollment payments |
| S25 | Two cashiers disburse same refund | 3 — Conditional UPDATE | `UPDATE ... WHERE status = 'UNCLAIMED'` |
| S26 | Two contracts activated for same section | 4 — SELECT FOR UPDATE | Row-level lock + conditional UPDATE |
| S27 | Grade + section completion race | 3 — Conditional UPDATE | Coordinated status transitions |
| S28 | DB connection pool exhaustion | 7 — Infrastructure | Configure pool size + queue timeout |
| S29 | Certificate number collision at year boundary | 2 — DB Sequences | Year-prefixed DB sequence |
| S30 | Amendment approval + withdrawal race | 4 — SELECT FOR UPDATE | Wallet row lock on amendment |
| S31 | Disk full during PDF generation | 6 — Backend Silent Failures | Pre-check disk space, handle failure gracefully |
| S32 | Two managers approve same unlock request | 4 — SELECT FOR UPDATE | Handle concurrency on closure unlock |

## Race Conditions (R01–R14)

| ID | Description | Phase | Fix Type |
|----|------------|-------|----------|
| R01 | Receipt number duplicate | 2 — DB Sequences | `CREATE SEQUENCE` for payment receipts |
| R02 | Voucher number duplicate | 2 — DB Sequences | `CREATE SEQUENCE` for expense vouchers |
| R03 | Refund receipt number duplicate | 2 — DB Sequences | `CREATE SEQUENCE` for refund receipts |
| R04 | Certificate number duplicate | 2 — DB Sequences | `CREATE SEQUENCE` with year prefix |
| R05 | Payment overpayment | 4 — SELECT FOR UPDATE | Lock enrollment's payments before computing balance |
| R06 | Over-enrollment | 4 — SELECT FOR UPDATE | Lock section row before capacity check |
| R07 | Double wallet creation | 4 — SELECT FOR UPDATE | `INSERT ... ON CONFLICT DO NOTHING` |
| R08 | Double contract activation | 3 — Conditional UPDATE | `UPDATE SET status='ACTIVE' WHERE status='ASSIGNED'` |
| R09 | Double contract settlement | 3 — Conditional UPDATE | `UPDATE SET status='SETTLED' WHERE status='ACTIVE'` |
| R10 | Double contract cancellation | 3 — Conditional UPDATE | `UPDATE SET status='CANCELLED' WHERE status='ACTIVE'` |
| R11 | Double refund disbursement | 3 — Conditional UPDATE | `UPDATE pending_refunds SET status='CLAIMED' WHERE status='UNCLAIMED'` |
| R12 | Double amendment approval | 3 — Conditional UPDATE | Conditional UPDATE + row lock on contract |
| R13 | Email uniqueness race | 4 — SELECT FOR UPDATE | UNIQUE constraint + handle IntegrityError |
| R14 | Payment on closed day | 4 — SELECT FOR UPDATE | Advisory lock or serializable isolation |

## Orphaned States (O01–O08)

| ID | Operation | Phase | Fix |
|----|-----------|-------|-----|
| O01 | `cancel_section` | 3 — Conditional UPDATE | Wrap in DB transaction, use flush not commit |
| O02 | `disburse_refund` | 3 — Conditional UPDATE | Atomic: status update + ledger entry in single transaction |
| O03 | `complete_section` | 3 — Conditional UPDATE | Status + contract + ledger + certificates in single transaction |
| O04 | `set_final_grades_bulk` | 3 — Conditional UPDATE | Grades + contract status + ledger finalize in single transaction |
| O05 | `close_day` | 3 — Conditional UPDATE | Wrap all validations + closure status in single transaction |
| O06 | Enrollment + payment flow | 3 — Conditional UPDATE | Payment and enrollment in same transaction |
| O07 | `run_daily_section_checks` | 6 — Backend Silent Failures | Idempotency guard via daily_jobs_log |
| O08 | Refund expense tracking | 3 — Conditional UPDATE | Expense + ledger entry in single transaction |

## Silent Failures (F01–F11)

| ID | File:Line | Phase | Fix |
|----|-----------|-------|-----|
| F01 | `academic/service.py:352` | 6 — Backend Silent Failures | Add `logger.warning()` before `continue` |
| F02 | `academic/service.py:754` | 6 — Backend Silent Failures | Add `logger.error()` before `pass` |
| F03 | `lms/financial_service.py:84` | 6 — Backend Silent Failures | Add audit logging for failed payment attempts |
| F04 | `apps/erp/frontend/lib/api.ts:45` | 9 — Frontend Resilience | `new Promise<never>(() => {})` → `Promise.reject()` |
| F05 | `AuthContext.tsx:85` | 9 — Frontend Resilience | Fix logout error handling, clear server session |
| F06 | Students page | 9 — Frontend Resilience | Add user-facing error toast/alert on API failure |
| F07 | Sections page | 9 — Frontend Resilience | Replace `.catch(() => null)` with proper error UI |
| F08 | Sections page | 9 — Frontend Resilience | Handle contract fetch failure, show fallback |
| F09 | `apps/erp/frontend/lib/api.ts` | 9 — Frontend Resilience | Differentiate 401 vs network error vs 500 |
| F10 | `cancellation_service.py:292` | 6 — Backend Silent Failures | `commit()` → `flush()` |
| F11 | `academic/service.py:404` | 6 — Backend Silent Failures | `commit()` → `flush()` |

## Database CHECK Constraints (D01–D13)

| ID | Table | Constraint | Phase |
|----|-------|-----------|-------|
| D01 | `payments` | `CHECK (amount > 0)` | 1 — DB Constraints |
| D02 | `expenses` | `CHECK (amount > 0)` | 1 — DB Constraints |
| D03 | `pending_refunds` | `CHECK (amount > 0)` | 1 — DB Constraints |
| D04 | `refunds` | `CHECK (amount > 0)` | 1 — DB Constraints |
| D05 | `teacher_wallets` | `CHECK (balance >= 0)` | 1 — DB Constraints |
| D06 | `teacher_wallets` | `CHECK (frozen_balance >= 0)` | 1 — DB Constraints |
| D07 | `teacher_wallets` | `CHECK (frozen_balance <= balance)` | 1 — DB Constraints |
| D08 | `ledger_entries` | `CHECK (available_delta + frozen_delta = total_amount)` | 1 — DB Constraints |
| D09 | `enrollments` | `CHECK (0 <= admin_discount <= 100)` | 1 — DB Constraints |
| D10 | `final_grades` | `CHECK (0 <= final_score <= 100)` | 1 — DB Constraints |
| D11 | `grades` | `CHECK (score >= 0)` | 1 — DB Constraints |
| D12 | `course_sections` | `CHECK (price >= 0)` | 1 — DB Constraints |
| D13 | `section_contracts` | `CHECK (0 <= holdback_rate <= 1)` | 1 — DB Constraints |

## Infrastructure Gaps (I01–I13)

| ID | Gap | Phase | Fix |
|----|-----|-------|-----|
| I01 | No CI/CD pipeline | 7 — Infrastructure | GitHub Actions workflow |
| I02 | No database backup strategy | 7 — Infrastructure | `pg_dump` cron + offsite storage |
| I03 | Backend container runs as root | 7 — Infrastructure | Add `USER` directive to Dockerfile |
| I04 | No CSRF protection | 8 — Security & Rate Limiting | CSRF middleware or double-submit cookie |
| I05 | No CSP headers in Caddy | 8 — Security & Rate Limiting | Content-Security-Policy in Caddyfile |
| I06 | No rate limiting on financial endpoints | 8 — Security & Rate Limiting | Slowapi limits on all non-auth endpoints |
| I07 | No error monitoring (Sentry) | 7 — Infrastructure | `sentry-sdk` on backend + frontend |
| I08 | IP-based rate limiting broken behind proxy | 8 — Security & Rate Limiting | Parse `X-Forwarded-For` header |
| I09 | No log retention/rotation | 7 — Infrastructure | Configure logrotate or log shipping |
| I10 | Caddy uses `tls internal` | 7 — Infrastructure | Switch to Let's Encrypt |
| I11 | No structured logging | 7 — Infrastructure | Replace `print()`/`console.log()` with structured format |
| I12 | No Docker health checks | 7 — Infrastructure | Add `HEALTHCHECK` to Dockerfiles |
| I13 | Hardcoded DB password in test script | 7 — Infrastructure | Remove hardcoded creds, use env vars |

## Items NOT Requiring a Fix

| ID | Reason |
|----|--------|
| S07 | Already passes (student code uniqueness handled) |
| S10 | Already passes (UNIQUE constraint protects) |
