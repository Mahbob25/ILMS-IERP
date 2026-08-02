# Phase 10: Testing — Unit, Integration, E2E, and Load Tests

**Owner:** QA
**Estimate:** 5 days
**Dependencies:** ALL previous phases (1–9) must be merged into main before this phase begins.

## Audit Items Covered

This phase does NOT fix audit items — it validates that all fixes in Phases 1–9 are correct and regression-free. Covers all items via tests:

- Checks for all 13 CHECK constraints (D01–D13)
- All 4 DB sequences tested (R01–R04)
- All conditional UPDATE patterns tested (R08–R12)
- All SELECT FOR UPDATE patterns tested (R05–R07, R13–R14)
- Idempotency key behavior (S01, S13)
- Silent failure regression tests (F01–F11)
- Infrastructure changes tested (I01–I13)
- Rate limiting + CSRF tested (I04–I06, I08)
- Frontend resilience tested (F04–F09, S02–S06, S17–S18)
- Load tests for enrollment + payment (S23–S24 style scenarios)
- Plus audit items 24–35 from the priority plan

## Tasks

### 10.1 Unit Tests

**File: `backend/tests/unit/test_db_constraints.py`**
- Test that negative payments are rejected at DB level
- Test that negative expenses are rejected
- Test that wallet balance >= 0 is enforced
- Test that discounts > 100% are rejected
- Test that partial unique index allows re-enroll after soft-delete

**File: `backend/tests/unit/test_db_sequences.py`**
- Test `next_certificate_number()` returns expected format
- Test sequence increments on each call
- Test yearly reset (mock current year)

**File: `backend/tests/unit/test_conditional_updates.py`**
- Test contract activation only from ASSIGNED status
- Test contract activation rejected if already ACTIVE
- Test settlement only from ACTIVE
- Test cancellation only from ACTIVE
- Test refund disbursement only from UNCLAIMED

**File: `backend/tests/unit/test_select_for_update.py`**
- (Integration level — see below)

**File: `backend/tests/unit/test_idempotency.py`**
- Test idempotency key rejection on duplicate
- Test TTL cleanup
- Test response replay

**File: `backend/tests/unit/test_logging.py`**
- Test logger.error is called for F01 scenario
- Test logger.error is called for F02 scenario
- Test commit→flush replacements

**File: `backend/tests/unit/test_csrf.py`**
- Test CSRF rejection without token
- Test CSRF pass with valid token

**File: `backend/tests/unit/test_rate_limit.py`**
- Test rate limit enforcement
- Test X-Forwarded-For parsing

### 10.2 Integration Tests

**File: `backend/tests/integration/test_enrollment_concurrency.py`**
- Start 10 concurrent enrollment requests for a section with capacity 5
- Verify only 5 succeed
- Verify enrolled_count = capacity after test

**File: `backend/tests/integration/test_payment_concurrency.py`**
- Start 10 concurrent payment requests for a single enrollment balance of 1000 SAR
- Verify total paid <= 1000 SAR
- Verify no overpayment

**File: `backend/tests/integration/test_contract_activation.py`**
- Start 5 concurrent activation requests for same contract
- Verify exactly 1 activation succeeds
- All others fail with appropriate error

**File: `backend/tests/integration/test_refund_disbursement.py`**
- Start 5 concurrent disbursement requests for same PendingRefund
- Verify exactly 1 disbursement succeeds
- Verify wallet credited exactly once

**File: `backend/tests/integration/test_cancel_section_transaction.py`**
- Mock a failure after wallet reversal
- Verify wallet reversal is rolled back
- Verify no orphaned PendingRefund records

**File: `backend/tests/integration/test_orphaned_states.py`**
- Test each orphaned state scenario (O01–O08)
- Simulate mid-operation failure
- Verify no partial writes remain

**File: `backend/tests/integration/test_idempotency_e2e.py`**
- POST to /payments with idempotency key
- Replay same request
- Verify only 1 payment created
- Verify second response is cached

**File: `backend/tests/integration/test_db_constraints_integration.py`**
- Attempt inserts that violate each constraint
- Verify constraint violations are raised

### 10.3 E2E Tests (Playwright)

**File: `frontend/tests/e2e/qa-chaos/double-click-prevention.spec.ts`**
- Navigate to payment form
- Rapidly click submit button
- Verify only one payment created (or API returns idempotency response)

**File: `frontend/tests/e2e/qa-chaos/input-sanitization.spec.ts`**
- Submit form with trailing spaces
- Verify spaces trimmed before display

**File: `frontend/tests/e2e/qa-chaos/search-wildcards.spec.ts`**
- Search with `%` or `_` characters
- Verify search returns expected results (literal match)

**File: `frontend/tests/e2e/qa-chaos/permission-denied.spec.ts`**
- Login as secretary
- Navigate to admin-only page
- Verify "access denied" message shown

**File: `frontend/tests/e2e/qa-chaos/empty-report.spec.ts`**
- Export report for empty period
- Verify "No data for this period" message

**File: `frontend/tests/e2e/qa-chaos/token-refresh.spec.ts`**
- Simulate token expiration mid-session
- Verify form data is preserved
- Verify user is redirected to login if refresh fails

**File: `frontend/tests/e2e/qa-chaos/error-display.spec.ts`**
- Simulate API failure on students/sections page
- Verify user-facing error message is shown

**File: `frontend/tests/e2e/qa-chaos/prg-pattern.spec.ts`**
- Submit a form
- Click browser back button
- Verify no form resubmission

### 10.4 Load Tests

**File: `backend/tests/load/test_enrollment.py`** (k6 or Locust)
- 50 concurrent virtual users enrolling in 1 section with capacity 20
- Verify enrolled_count never exceeds capacity
- Measure response times (p95 < 500ms)

**File: `backend/tests/load/test_payment.py`**
- 20 concurrent virtual users paying for 1 enrollment
- Verify total payments never exceed balance
- Measure response times

**File: `backend/tests/load/test_mixed_workload.py`**
- Mix of enrollments, payments, refunds, and searches
- Verify no deadlocks
- Verify response times under load

### 10.5 Visual Regression Tests (Playwright)

**File: `frontend/tests/e2e/qa-chaos/visual/error-states.spec.ts`**
- Screenshot each error state: network error, server error, permission denied, empty data
- Compare against baseline

**File: `frontend/tests/e2e/qa-chaos/visual/form-submitting.spec.ts`**
- Screenshot form in submitting state
- Verify disabled button styling

### 10.6 Accessibility Tests

**File: `frontend/tests/e2e/qa-chaos/a11y/form-errors.spec.ts`**
- Run aXe on error states
- Verify error announcements are accessible

### 10.7 Attack Surface Regression Tests

**File: `backend/tests/integration/test_security_headers.py`**
- Verify CSP headers returned
- Verify HSTS headers returned
- Verify X-Frame-Options returned

**File: `backend/tests/integration/test_csrf.py`**
- Verify POST without CSRF token returns 403
- Verify POST with valid CSRF token succeeds

**File: `backend/tests/integration/test_rate_limit_headers.py`**
- Verify `X-RateLimit-*` headers present on all endpoints
- Verify 429 returned after exceeding limit

## Files to CREATE

- All test files listed above (approximately 25+ test files)

## Files to EDIT

- Test configuration files (conftest.py, playwright.config.ts) if needed for new test setup
- `backend/tests/conftest.py` — add fixtures for concurrent testing (if needed)

## Independent Boundary

- Do NOT modify any production code
- Do NOT modify DB schema or create migrations
- Do NOT modify Caddyfile or infrastructure config
- All changes are TEST-ONLY

## Acceptance Criteria

- [ ] All unit tests pass (80%+ coverage)
- [ ] All integration tests pass (including concurrency tests)
- [ ] All E2E tests pass across Chromium, Firefox, and WebKit
- [ ] Load tests show no deadlocks under 2x expected load
- [ ] Visual regression tests pass (no unexpected UI changes)
- [ ] Accessibility tests pass (no aXe violations on error states)
- [ ] Security regression tests pass (CSP, CSRF, rate limiting)
- [ ] Coverage meets 80%+ for all modules
- [ ] Each test file is independently runnable with clean fixtures
- [ ] No test pollution between runs
