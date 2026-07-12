# QA & Chaos Engineering Audit — LIMS v1.7

**Date:** 2026-07-12  
**Auditor:** QA Lead / Chaos Engineer  
**Scope:** Full-stack ERP (FastAPI + Next.js + PostgreSQL)  
**Status:** 🔴 NOT PRODUCTION-READY — 20 CRITICAL + 16 HIGH findings  

---

## Executive Summary

This audit evaluates the LIMS MVP across **stress test scenarios**, **logical gaps**, **concurrency vulnerabilities**, **silent failures**, and **data integrity** for the financial, academic, and identity modules. The system has foundational architecture strengths (proper FK RESTRICT on financial tables, JWT auth, i18n, role-based access) but contains **20 CRITICAL** and **16 HIGH** issues that must be resolved before launch.

**TL;DR: Do not deploy to production until these are addressed:**
1. **13 race conditions** in financial/academic operations — users can overpay, double-refund, and over-enroll
2. **No database backups or WAL archiving** — complete data loss risk
3. **Zero unit tests** outside section-lifecycle domain — 3 of 4 modules uncovered
4. **Backend container runs as root** — container breakout risk
5. **No CSRF, no CSP, no security headers in Caddy** — XSS and CSRF vectors open

---

## Task 1: Stress Test Scenarios by Probability

### 🔴 HIGH PROBABILITY — The Daily Grind

Standard real-world usage patterns that will happen daily. These must be handled gracefully.

| ID | Scenario | What the User Does | What Should Happen | Current Gap |
|----|----------|-------------------|-------------------|-------------|
| S01 | **Double-click Save Payment** | Clicks "Add Payment" button twice rapidly | First call processes, second is rejected (idempotency key or button disabled) | No `submitting` state on any form button. Two payments will be created for the same enrollment. **CRITICAL** |
| S02 | **Enroll student with trailing spaces in name** | Pastes name with leading/trailing spaces: `"  أحمد محمد  "` | Spaces trimmed before DB insert | No input sanitization in API layer. Space-containing names stored as-is. **MEDIUM** |
| S03 | **Search with special characters** | Types `%` or `_` in search box (SQL LIKE wildcards) | Search treats input as literal string, not pattern | Raw input passed to SQL queries; `%`/`_` could match unintended records. **HIGH** |
| S04 | **Arabic/English mixed input** | Enters student name mixing Arabic + English: `"محمد John"` | Stored and displayed correctly | No validation for locale-appropriate name fields. Arabic names may be truncated if field encoding is insufficient. **MEDIUM** |
| S05 | **Expired session during form fill** | Fills out a 10-field form for 30+ minutes, clicks Save | Session refresh occurs silently, form submits | Axios interceptor has `new Promise<never>(() => {})` on refresh failure — the promise **never settles**, the form hangs forever. **CRITICAL** |
| S06 | **User without permission clicks Admin link** | Secretary clicks "Manage Users" from their sidebar | Redirect with "access denied" message | Middleware checks role but UI doesn't communicate *why* the redirect happened. Route silently bounces back. **LOW** |
| S07 | **Create student with existing student code** | Secretary enters a student code that already exists | 409 Conflict with clear message "Student code already exists" | This IS handled (tested in E2E). **PASS** |
| S08 | **Delete a course that has active sections** | Manager tries to delete a course with enrolled students | Blocked with "Course has active sections" error | Cascade delete at DB level (CASCADE on course_sections FK) could silently delete enrolled students' sections. DB-level RESTRICT protects, but ORM may surprise. **MEDIUM** |
| S09 | **500ms network glitch during form save** | User clicks Save, packet drops momentarily | Retry 1-2 times transparently, then show error | No retry logic in `api.ts`. The request fails immediately, user sees no feedback (`.catch` swallows errors). **HIGH** |
| S10 | **Open two browser tabs, enroll same student in same section** | User opens tab A + tab B, clicks "Enroll" in both | Second enrollment returns "Already enrolled" (409) | UNIQUE constraint `(student_id, section_id)` at DB level protects this. **PASS** (DB-level protection works) |
| S11 | **Bulk-grade a section, then immediately view dashboard** | Teacher submits all grades, navigates to dashboard | Dashboard shows up-to-date grade counts | Revenue/dashboard queries are not in a read-after-write consistent snapshot. Could show stale data. **MEDIUM** |
| S12 | **Export a report for an empty period** | Manager exports revenue report for a month with no data | Clean report with "No data for this period" message | The `get_revenue_overview` function with `asyncio.gather` queries may return inconsistent empty sets. **MEDIUM** |

### 🟡 MEDIUM PROBABILITY — The Occasional Hiccup

Happens to 1-10% of users but causes disproportionate damage when it does.

| ID | Scenario | What Happens | Current Gap |
|----|----------|-------------|-------------|
| S13 | **Network drops mid-payment creation** | Client sends POST /payments, server processes it, writes to DB, but TCP ACK is lost | Payment IS created (payment processed, receipt generated) but client shows an error. User retries, creating a **second payment**. | **CRITICAL** — No idempotency key on payment endpoint |
| S14 | **Expired auth token during attendance marking** | Teacher marks 30 students present. Token expires on student #15. | First 15 records save. Remaining 15 are lost. Teacher has to redo the batch. | Partial write is committed to DB. The `set_attendance_records` function saves an incomplete batch. **HIGH** |
| S15 | **Server restart during section cancellation** | Server process dies mid-way through cancel_section | Wallet reversal completed (written to DB), but SectionCancellation and PendingRefund records NOT created. Students can't claim refunds, teacher wallet is reversed. | **CRITICAL** — No distributed transaction or saga pattern. Partial failure causes orphaned financial state. |
| S16 | **Concurrent payment + day-closure at midnight** | Two users: User A creates a payment, User B closes the day simultaneously | Payment created AFTER day is closed, or payment is created on a "closed" day with no validation | **HIGH** — TOCTOU race: `is_date_closed` check passes, then day is closed, then payment writes to the closed day |
| S17 | **Browser back button after successful form submission** | User creates a student, sees success, clicks browser Back | Form shows stale data or resubmits | Standard PRG (Post-Redirect-Get) pattern is NOT followed. Back-button could cause duplicate submissions. **MEDIUM** |
| S18 | **Session token rotation causes brief 401** | Two API calls fire in parallel; the first triggers a token refresh, the second uses the now-stale token | Second call gets 401, Axios interceptor queues it for retry | The "queue while refreshing" logic uses a single `Promise`, but only one caller gets the refreshed token; others get stale. **MEDIUM** |
| S19 | **Two managers close the same day** | Manager A and Manager B both click "Close Day" for today | Both see "closed" but no audit log of who closed it first | `daily_closures` has `date` as PK; second close returns 500 (IntegrityError on duplicate PK) — unhandled. **MEDIUM** |
| S20 | **Teacher withdraws wallet balance just before cancellation** | Section is being cancelled, teacher's wallet is reversed as part of cancellation | If teacher withdraws balance between the cancellation request and wallet reversal, the reversal creates a negative balance | `balance >= 0` CHECK is MISSING at DB level. Negative wallet balance is possible. **CRITICAL** |
| S21 | **Student re-enrolls days after being unenrolled** | Student was unenrolled (soft-deleted enrollment), then re-added to the same section | Second enrollment blocked by UNIQUE constraint on `(student_id, section_id)` — but `deleted_at` is not part of the constraint | Soft-deleted enrollment blocks re-enrollment. Need partial unique index: `UNIQUE (student_id, section_id) WHERE deleted_at IS NULL`. **HIGH** |
| S22 | **Refresh token rotation during logout** | User clicks logout while token refresh is in progress | Race between `logout` (which sets cookies to expire) and `refresh` (which writes new cookies) | No coordination between logout and refresh flows. User could end up with a new refresh token after "logging out". **MEDIUM** |

### 🟢 LOW PROBABILITY — The Chaos Edge Cases

Rare but catastrophic. These are the "once a quarter" scenarios.

| ID | Scenario | What Happens | Current Gap |
|----|----------|-------------|-------------|
| S23 | **50 concurrent enrollment requests for the same section** | During peak registration, 50 users simultaneously enroll in the same 20-capacity section | All 50 pass the `enrolled_count < capacity` check. Section ends up with 70 students for a capacity of 20. | **CRITICAL** — `enrolled_count` is read without `SELECT FOR UPDATE`. No pessimistic lock. |
| S24 | **10 concurrent payment requests for the same enrollment** | Student or admin submits 10 simultaneous payment URLs for the same balance | Each payment passes the `remaining_balance` check independently. Student is overpaid by 10x. | **CRITICAL** — No `SELECT FOR UPDATE` on payments before computing remaining balance. |
| S25 | **Two cashiers try to disburse $500 to the same student** | Two secretaries simultaneously click "Disburse" on the same pending refund | Both read `status = "UNCLAIMED"`, both create Refund records, both set `status = "CLAIMED"`. Student receives $1,000 instead of $500. | **CRITICAL** — No atomic `UPDATE ... WHERE status = 'UNCLAIMED'` pattern. |
| S26 | **Two contracts activated for the same section** | Section assignment contract activated concurrently | Both see `status = "ASSIGNED"`, both create ledger entries (double wallet credit), both set status to `"ACTIVE"` (second overwrites first). Teacher wallet credited twice. | **CRITICAL** — No row-level lock on contract before status transition. |
| S27 | **Grade submission + section completion race** | Teacher submits final grades while completion cron runs | Grade submission passes, completion check still sees "no grades" (or vice versa) | **HIGH** — `set_final_grades_bulk` and `complete_section` are not coordinated. Both could succeed, or both could fail from each other's perspective. |
| S28 | **Database connection pool exhaustion** | 31 concurrent requests hit the API simultaneously | Pool has 30 max connections (10 pool + 20 overflow). 31st request hangs waiting for a connection. | No connection timeout or queue size limit configured. 31st request hangs indefinitely (default behavior). **MEDIUM** |
| S29 | **Certificate number collision at year boundary** | Two certificates generated on Dec 31 23:59:59 and Jan 1 00:00:01 | Year-based counter resets; both get `CERT-2026-000001` | **CRITICAL** — Only `count` is checked, not `year + count`. Same cert number issued twice if clock ticks over between the read and the write. |
| S30 | **Concurrent amendment approval + teacher withdrawal** | AmendmentA approval adds 500 SAR to wallet. WithdrawalW deducts 300 SAR. Both run concurrently. | Amendment reads balance = 1000, computes new balance = 1500. Withdrawal reads balance = 1000, approves because 1000 >= 300. Final balance = 1200 instead of 700. Teacher withdrew money they shouldn't have. | **HIGH** — Amendment approval does NOT lock the wallet row before reading the balance. |
| S31 | **Disk full during voucher/PDF generation** | Server disk fills up while generating a payment receipt PDF | PDF generation fails, but payment is already committed to DB | No disk space check before file operations. Payment exists in DB but receipt PDF is missing. **MEDIUM** |
| S32 | **Simultaneous manager unlock-approval races** | Two managers both approve the same unlock request | Both lookups see `unlock_requested` status, both approve, both set `status = "pending"` | No concurrency guard on closure state transition. Double-approve is harmless (second overwrites first), but no audit trail of who actually approved. **LOW** |

---

## Task 2: Logical Gap & Codebase Analysis

### 2A: Orphaned States — Partial Failure Without Rollback

These are operations that write to MULTIPLE tables within a single request but lack proper transactional rollback if a downstream step fails.

| # | Operation | Tables Written | Failure Point | What Gets Orphaned | Severity |
|---|-----------|---------------|---------------|-------------------|----------|
| O01 | `cancel_section` | `course_sections.status`, `teacher_wallets.balance`, `teacher_wallets.frozen_balance`, `ledger_entries`, `section_cancellations`, `pending_refunds` (x N students) | Failure after wallet reversal but before creating PendingRefund records | Teacher wallet reversed, no refund authorizations exist. Students cannot claim refunds. | **CRITICAL** |
| O02 | `disburse_refund` | `pending_refunds.status`, `refunds.transaction_number`, `ledger_entries` | Failure after status update to CLAIMED but before ledger entry | Student is marked refunded, pending balance still shows as available. Account un-reconcilable. | **CRITICAL** |
| O03 | `complete_section` | `course_sections.status`, `section_contracts.status`, `ledger_entries`, `certificates` (x N students) | Failure after status change but before certificates | Section marked complete, contract settled, but certificates not generated. Legal record gap. | **HIGH** |
| O04 | `set_final_grades_bulk` | `final_grades`, `section_contracts.status`, `ledger_entries` | Failure after grades saved but before ledger finalize | Grades visible in UI, but contract stuck at `ACTIVE` instead of `GRADES_SUBMITTED`. The error is **silently swallowed** (line 754-758). | **HIGH** |
| O05 | `close_day` | `daily_closures.status`, potential ledger/refund interactions | Failure while `close_day` checks for pending transactions | Day could be partially closed with some validations run and others not. No atomicity. | **MEDIUM** |
| O06 | Enrollment + payment flow | `enrollments`, `payments` | Failure after enrollments but before payment | Student enrolled with no payment record. Since payment has FK RESTRICT on enrollment, the payment insert fails completely. But the enrollment is committed. | **MEDIUM** |
| O07 | `run_daily_section_checks` (startup) | `course_sections.status`, `daily_jobs_log` | Crash between processing sections and writing the daily log | Sections processed twice on next restart - but operations are idempotent. Low risk but wasted work. | **LOW** |
| O08 | Refund expense tracking | `expenses`, `ledger_entries` | Failure after expense creation but before ledger entry | Refund expense recorded but not reflected in wallet/ledger. Non-reconcilable. | **HIGH** |

### 2B: Concurrency & Rate Limiting — Missing Locks and Idempotency

#### Current State
- **Rate limiting:** Only 2 auth endpoints (`login`, `register`) have rate limits (5/min via slowapi). 
- **IP detection behind proxy:** `request.client.host` returns the proxy IP — rate limiting is **effectively broken** in production.
- **No rate limits** on payments, enrollments, expenses, withdrawals, or any financial endpoint.
- **No idempotency keys** on any endpoint.

#### Race Condition Inventory (CRITICAL — all need immediate fixes)

| # | Race | Endpoint | Pattern | Fix |
|-----|-------|----------|---------|-----|
| R01 | Receipt number dupe | `POST /payments` | Read max→increment→write | Use `CREATE SEQUENCE` or `SELECT FOR UPDATE` on counter table |
| R02 | Voucher number dupe | `POST /expenses` | Same as R01 | Same fix |
| R03 | Refund receipt number dupe | `POST /disburse-refund` | Same as R01 | Same fix |
| R04 | Certificate number dupe | Section complete | Read count→increment→write | Same fix, or use DB sequence with year prefix |
| R05 | Payment overpayment | `POST /payments` | Read balance→check→write payment | `SELECT FOR UPDATE` on enrollment's payments before computing remaining |
| R06 | Over-enrollment | `POST /enrollments` | Read count→check capacity→increment | `SELECT FOR UPDATE` on the section row |
| R07 | Double wallet creation | Any ledger op | Read→not found→create | `INSERT ... ON CONFLICT DO NOTHING` (upsert) |
| R08 | Double contract activation | `POST /activate-contract` | Read status→transition→write | `UPDATE contracts SET status = 'ACTIVE' WHERE status = 'ASSIGNED'` — atomic conditional |
| R09 | Double contract settlement | `POST /settle-contract` | Read status→compute→write | Same pattern: conditional UPDATE |
| R10 | Double contract cancellation | `POST /cancel-contract` | Read status→compute→write | Same pattern: conditional UPDATE |
| R11 | Double refund disbursement | `POST /disburse-refund` | Read status→create→update | `UPDATE pending_refunds SET status = 'CLAIMED' WHERE id = X AND status = 'UNCLAIMED' RETURNING *` |
| R12 | Double amendment approval | `POST /approve-amendment` | Read status→adjust wallet→write | Add `SELECT FOR UPDATE` on contract + amendment rows |
| R13 | Email uniqueness race | `POST /users` (grant_access) | Read→not found→insert | Add UNIQUE constraint on `users.email` at DB level + handle IntegrityError |
| R14 | Payment on closed day | `POST /payments` + `POST /close-day` | TOCTOU on is_date_closed | Use advisory lock or serializable isolation for payment+closure |

### 2C: Silent Failures — Where Errors Disappear

These are code paths where exceptions are caught and swallowed without:
- Logging to a monitoring system
- Notifying the user
- Leaving traceable forensic evidence

| # | File:Line | Code | What's Swallowed | Impact |
|-----|-----------|------|-------------------|--------|
| F01 | `academic/service.py:352-356` | `try: await create_certificate(...) except Exception: continue` | Certificate creation failure for individual students | Section completes, but some students never get certificates. **No one knows.** |
| F02 | `academic/service.py:754-758` | `try: await ledger_finalize_grades(...) except ValueError: pass` | Ledger contract stuck at ACTIVE | Grades saved but contract not moved to GRADES_SUBMITTED. Settlement fails downstream. **No operator alert.** |
| F03 | `lms/financial_service.py:84-86` | `enrollment = ...scalar_one_or_none() if not enrollment: return None` | Payment attempted on non-existent enrollment | No audit log of failed payment attempt. Could be fraud attempt or data bug. **No forensic trail.** |
| F04 | `frontend/lib/api.ts:45` | `return new Promise<never>(() => {})` | Token refresh failure | Caller's promise **never settles**. Memory leak, zombie UI. **User sees loading spinner forever.** |
| F05 | `frontend/components/AuthContext.tsx:85-96` | `catch (error) { // swallowed } finally { window.location.href = ... }` | Logout API failure | Backend session cookie not cleared server-side. **Session lingers.** |
| F06 | Students page | `catch (e) { console.error(e) }` | Save/delete API failure | **User sees zero feedback.** UI stays in the same state. |
| F07 | Sections page | `.catch(() => null)` + `.catch(() => {})` | Course/teacher/student lookup failure | UUIDs leak into UI as student/teacher names. `undefined` values propagate silently. |
| F08 | Sections page | `try { const contract = ... } catch { /* empty */ }` | Contract fetch failure during edit | Form defaults to teacher_default values instead of actual contract. User edits wrong data. |
| F09 | `frontend/api.ts` | Cannot distinguish 401 vs network error vs 500 | Auth failure | User redirected to login for a server-down scenario. **No explanation.** |
| F10 | `academic/cancellation_service.py:292` | `await db.commit()` inside service | Premature commit | If caller wraps in transaction, unexpected early commit. Downstream failure cannot roll back. |
| F11 | `academic/service.py:404` | `await db.commit()` in `deactivate_section` | Same as F10 | Inconsistent with entire codebase which uses `flush()`. Breaks rollback. |

### 2D: Database-Level Integrity Gaps

These are **missing CHECK constraints** at the database level that allow logically impossible data:

| # | Table | Missing Constraint | Risk |
|-----|-------|-------------------|------|
| D01 | `payments` | `CHECK (amount > 0)` | Zero or negative payments can be recorded |
| D02 | `expenses` | `CHECK (amount > 0)` | Zero or negative expenses can be recorded |
| D03 | `pending_refunds` | `CHECK (amount > 0)` | Refunds of zero/negative amounts |
| D04 | `refunds` | `CHECK (amount > 0)` | Zero/negative refund disbursements |
| D05 | `teacher_wallets` | `CHECK (balance >= 0)` | Wallet balance can go negative |
| D06 | `teacher_wallets` | `CHECK (frozen_balance >= 0)` | Frozen balance can go negative |
| D07 | `teacher_wallets` | `CHECK (frozen_balance <= balance)` | Can freeze more than available |
| D08 | `ledger_entries` | `CHECK (available_delta + frozen_delta = total_amount)` | Double-entry accounting integrity not enforced |
| D09 | `enrollments` | `CHECK (0 <= admin_discount <= 100)` | Discount > 100% or negative |
| D10 | `final_grades` | `CHECK (0 <= final_score <= 100)` | Scores outside valid range |
| D11 | `grades` | `CHECK (score >= 0)` | Assignment grades cannot be negative |
| D12 | `course_sections` | `CHECK (price >= 0)` | Prices cannot be negative |
| D13 | `section_contracts` | `CHECK (0 <= holdback_rate <= 1)` | Holdback rate > 100% possible |

### 2E: Infrastructure & Deployment Gaps

| # | Gap | Severity | Fix Required Before Launch |
|-----|-----|----------|---------------------------|
| I01 | No CI/CD pipeline | **CRITICAL** | GitHub Actions for test → build → deploy |
| I02 | No database backup strategy | **CRITICAL** | `pg_dump` cron + offsite storage |
| I03 | Backend container runs as root | **CRITICAL** | Add `USER` directive to Dockerfile |
| I04 | No CSRF protection | **CRITICAL** | Add CSRF middleware or double-submit cookie |
| I05 | No CSP headers in Caddy | **HIGH** | Add `Content-Security-Policy` to Caddyfile |
| I06 | No rate limiting on financial endpoints | **HIGH** | Add slowapi limits to all non-auth endpoints |
| I07 | No error monitoring (Sentry) | **CRITICAL** | Add sentry-sdk to both frontend and backend |
| I08 | IP-based rate limiting broken behind proxy | **HIGH** | Parse `X-Forwarded-For` header for rate limiting |
| I09 | No log retention/rotation strategy | **HIGH** | Configure logrotate or log shipping |
| I10 | Caddy uses `tls internal` (self-signed) | **MEDIUM** | Switch to Let's Encrypt for production |
| I11 | No structured logging | **HIGH** | Replace `print()`/`console.log()` with structured format |
| I12 | No health check for Docker containers | **MEDIUM** | Add HEALTHCHECK to Dockerfiles |
| I13 | DB password exposed in test script | **HIGH** | Remove hardcoded creds from `test_v1_7_full_e2e.py` |

---

## Vulnerability Heatmap

```
                    Impact
              Low   Med    High   Critical
   High       4     3       6        1        ← Daily Grind
Medium        1     7       3        4        ← Occasional Hiccup
   Low        1     2       1        9        ← Chaos Edge Cases

              6    12      10       14

Most damage comes from LOW-PROBABILITY, CRITICAL-IMPACT scenarios.
These are race conditions that require specific timing to trigger.
```

---

## Priority Remediation Plan

### 🔴 DO NOT DEPLOY WITHOUT (Critical — Week 1)

| Order | Fix | Effort | Files Affected |
|-------|-----|--------|---------------|
| 1 | Add conditional UPDATE pattern to all status transitions (contracts, refunds, closures) | 2 days | `ledger_service.py`, `cashier_service.py`, `cancellation_service.py`, `compensation_service.py` |
| 2 | Add `SELECT FOR UPDATE` to enrollment capacity check and payment remaining-balance check | 1 day | `academic/service.py`, `lms/financial_service.py` |
| 3 | Replace read-then-increment with DB sequences for receipt, voucher, and certificate numbers | 1 day | `lms/financial_service.py`, `lms/cashier_service.py`, `academic/certificate_service.py` |
| 4 | Add 13 missing CHECK constraints to database (payments/expenses/refunds > 0, wallet balance >= 0, etc.) | 1 day | Alembic migration |
| 5 | Implement idempotency key support on E-V-E-R-Y financial endpoint | 2 days | All `POST` routers + new `idempotency_keys` table |
| 6 | Add error monitoring (Sentry) | 0.5 day | `main.py`, `api.ts`, `layout.tsx` |
| 7 | Fix Caddyfile: add CSP, HSTS, rate limiting headers | 0.5 day | `infrastructure/caddy/Caddyfile` |
| 8 | Fix `new Promise<never>(() => {})` → `Promise.reject()` in Axios interceptor | 0.1 day | `frontend/lib/api.ts` |
| 9 | Add `submitting` + `disabled` to every form submit button | 1 day | All frontend page components |
| 10 | Add CI/CD pipeline | 1 day | `.github/workflows/` |

### 🟡 Before User-Facing Launch (High — Week 2)

| Order | Fix | Effort |
|-------|-----|--------|
| 11 | Add database backup config + `pg_dump` cron | 0.5 day |
| 12 | Add CSRF token validation | 1 day |
| 13 | Add user-facing error messages to all form handlers | 1 day |
| 14 | Create `error.tsx`/`loading.tsx` for dashboard route group | 0.5 day |
| 15 | Replace `commit()` with `flush()` in service layer (2 locations) | 0.2 day |
| 16 | Log certificate and ledger finalize failures instead of swallowing | 0.5 day |
| 17 | Add partial unique index on `enrollments (student_id, section_id) WHERE deleted_at IS NULL` | 0.2 day |
| 18 | Fix `isRedirectingToLogin` never-reset bug | 0.1 day |
| 19 | Add `X-Forwarded-For` parsing to rate limiter | 0.3 day |
| 20 | Secure backend Dockerfile with `USER` directive | 0.1 day |
| 21 | Remove hardcoded credentials from test scripts | 0.2 day |
| 22 | Add rate limits to all non-auth endpoints (100/min) | 1 day |
| 23 | Add structured logging | 1 day |

### 🟢 Ongoing Improvements (Week 3+)

| Order | Fix | Effort |
|-------|-----|--------|
| 24 | Add unit tests for identity, LMS, and ledger services | 4 days |
| 25 | Add integration tests using a real test database | 3 days |
| 26 | Add component tests (React Testing Library) for all forms | 2 days |
| 27 | Set up refresh token + audit log cleanup (TTL-based deletion) | 0.5 day |
| 28 | Add N+1 query detection and fix 4 known locations | 1 day |
| 29 | Add Zod response validation on frontend API boundaries | 1 day |
| 30 | Add Playwright visual regression tests | 1 day |
| 31 | Add accessibility (aXe) tests | 0.5 day |
| 32 | Add load testing (k6 or Locust) for enrollment + payment endpoints | 2 days |
| 33 | Audit and fix all `.catch(() => {})` and `console.error(e)` swallow patterns | 0.5 day |
| 34 | Add Redis caching layer for frequently accessed lookups | 2 days |
| 35 | Audit cascade behavior on all FKs (CASCADE vs RESTRICT) | 0.5 day |

---

## Appendix A: Quick Wins (Fix These First — Under 1 Hour Each)

1. `frontend/lib/api.ts:45`: `new Promise<never>(() => {})` → `Promise.reject(new Error("Session expired"))`
2. `academic/service.py:755`: Add `logger.error(...)` before `pass`
3. `academic/service.py:353`: Add `logger.warning(...)` before `continue`
4. All form buttons: Add `disabled={submitting}` + `onClick={() => if (submitting) return}`
5. Caddyfile: Add `header X-Content-Type-Options nosniff` and `header X-Frame-Options DENY`
6. `frontend/lib/api.ts:16`: Reset `isRedirectingToLogin = false` after `window.location.href = "/login"` resolves

## Appendix B: Attack Surface Summary

```
                ┌─────────────────────────────────────┐
                │         CLIENT (Browser)             │
                │  XSS: No CSP headers                 │
                │  CSRF: No CSRF tokens                │
                │  Session: Hung promises, stale state │
                └──────────┬──────────────────────────┘
                           │ HTTPS (self-signed in dev)
                           │ No HSTS
                ┌──────────▼──────────────────────────┐
                │         CADDY (Reverse Proxy)         │
                │  Security headers: NONE               │
                │  Rate limiting: NONE                  │
                │  TLS: self-signed in dev              │
                └──────────┬──────────────────────────┘
                           │
                ┌──────────▼──────────────────────────┐
                │     FASTAPI (Backend)                 │
                │  Rate limiting: Only 2 auth endpoints │
                │  IP detection: Broken behind proxy    │
                │  Race conditions: 13 critical         │
                │  Silent failures: 11 locations        │
                │  Input validation: Raw dicts in 2     │
                │    endpoints (no Pydantic)            │
                └──────────┬──────────────────────────┘
                           │
                ┌──────────▼──────────────────────────┐
                │     POSTGRESQL (Database)             │
                │  Missing CHECK constraints: 13        │
                │  Missing indexes: 8+                  │
                │  No point-in-time recovery            │
                │  No backup strategy                   │
                │  FK CASCADE on financial tables       │
                └─────────────────────────────────────┘
```

---

*Audit generated 2026-07-12. Re-audit recommended after CI/CD pipeline is operational and all CRITICAL items are resolved.*
