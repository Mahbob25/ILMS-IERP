# Phase 8: System Testing

**Owner:** QA Agent  
**Estimate:** 6.75 days  
**Dependencies:** All phases 1-7 merged into main. All features deployed to test environment with real database.  
**Sequential:** Runs last — requires complete feature set.

## Scope

Comprehensive integration tests and E2E tests covering all section lifecycle flows. Tests the system end-to-end: startup checks, completion enforcement, cancellation, deactivation, cashier disbursement, reconciliation, and edge cases.

---

## Tasks

### 8.1 Integration Tests — Startup Checks

**Test file:** `tests/integration/section_lifecycle/test_startup_checks.py`

| Test | Description |
|------|-------------|
| `test_idempotency_prevents_double_run` | Run checks twice on same date — second run skips |
| `test_overdue_section_becomes_ready_for_completion` | Past end_date, all grades entered → `ready_for_completion` |
| `test_overdue_section_with_ungraded_students` | Past end_date, missing grades → remains `active`, `flags.overdue=True` |
| `test_overdue_section_with_zero_scores` | Student has score=0 → treated as graded, section → `ready_for_completion` |
| `test_upcoming_deadline_warning` | Within warning window → `flags.approaching_end=True` |
| `test_no_change_for_future_sections` | end_date far in future → no flags set |
| `test_payment_deadline_flag` | Within payment_due_before_end_days, unpaid enrollments → `flags.has_unpaid_students=True` |
| `test_skips_soft_deleted_sections` | Section with `deleted_at` set → ignored |
| `test_skips_completed_and_cancelled` | Already `completed` or `cancelled` → ignored |

### 8.2 Integration Tests — Grade & Payment Enforcement

**Test file:** `tests/integration/section_lifecycle/test_complete_section.py`

| Test | Description |
|------|-------------|
| `test_complete_section_all_graded` | All students graded (including score=0) → completes |
| `test_complete_section_blocked_ungraded` | Missing grades → 400 with student names |
| `test_complete_section_blocked_unpaid` | Outstanding balances → 400 with amounts |
| `test_force_override_bypasses_grade_check` | `force=true` + `reason` → completes, creates override record |
| `test_force_override_bypasses_payment_check` | `force=true` + `reason` → completes despite unpaid |
| `test_force_requires_reason` | `force=true` without `reason` → 400 |
| `test_override_audit_log_created` | Verify `SectionCompletionOverride` record with correct snapshot |
| `test_daily_closure_blocks_completion` | Closed financial day → 400 |
| `test_complete_section_without_contract` | No teacher contract → grade check still enforced |

### 8.3 Integration Tests — Cancellation

**Test file:** `tests/integration/section_lifecycle/test_cancellation.py`

| Test | Description |
|------|-------------|
| `test_cancel_section_happy_path` | Full cancel flow: impact preview → cancel with refund → verify | |
| `test_cancel_section_no_refund` | Cancel with `no_refund` → no PendingRefund created | |
| `test_cancel_section_authorize_refund` | Cancel with `authorize_refunds` → PendingRefund for paying students | |
| `test_cancel_already_completed_fails` | Completed section → 400 | |
| `test_cancel_with_certificates_fails` | Section has certificates → blocked | |
| `test_cancel_reverses_teacher_wallet` | Verify wallet entries reversed after cancellation | |
| `test_cancel_within_single_transaction` | Force failure mid-cancel → no partial state (verify rollback) | |
| `test_preview_shows_correct_impact` | Verify impact preview numbers match actual data | |
| `test_cancel_saves_audit_record` | Verify `SectionCancellation` record with all fields | |

### 8.4 Integration Tests — Disbursement

**Test file:** `tests/integration/section_lifecycle/test_disbursement.py`

| Test | Description |
|------|-------------|
| `test_disburse_happy_path` | Cancel → authorize → disburse → receipt generated | |
| `test_receipt_number_format` | Verify pattern: `RFD-YYYYMMDD-NNNN` with sequential numbering | |
| `test_duplicate_disbursement_blocked` | Disburse same PendingRefund twice → 400 | |
| `test_disburse_on_closed_day_blocked` | Closed financial day → 400 | |
| `test_disburse_updates_pending_refund_status` | UNCLAIMED → CLAIMED after disbursement | |
| `test_disburse_records_daily_ledger` | Verify expense recorded under cashier's shift | |
| `test_claim_forfeited_refund_fails` | FORFEITED PendingRefund → 400 | |
| `test_cashier_refund_history` | Verify history endpoint returns correct data for cashier's shift | |

### 8.5 Integration Tests — Deactivation

**Test file:** `tests/integration/section_lifecycle/test_deactivation.py`

| Test | Description |
|------|-------------|
| `test_deactivate_active_section` | Activate → deactivate → back to `pending` | |
| `test_deactivate_reverses_activation_credit` | Verify `DEACTIVATION_REVERSAL` ledger entry created | |
| `test_deactivate_blocked_if_teacher_withdrew` | Teacher has withdrawn → blocked with message | |
| `test_deactivate_with_payments_requires_reason` | Students have payments → `reason` required | |
| `test_deactivate_non_active_fails` | `pending` or `completed` section → 400 | |
| `test_deactivate_no_contract` | Section without contract → deactivation succeeds without ledger entry | |

### 8.6 Integration Tests — Full Lifecycle Flows

**Test file:** `tests/integration/section_lifecycle/test_full_lifecycle.py`

| Test | Description |
|------|-------------|
| `test_full_successful_lifecycle` | Create → activate → enter grades → section passes end_date → startup check flags ready → manager completes → certificates issued |
| `test_cancellation_flow_full` | Create → activate → enroll → pay → cancel with refund → verify wallet reversal + PendingRefund → cashier disburses → verify Refund receipt + daily ledger |
| `test_deactivation_flow_full` | Create → activate → deactivate → back to pending → verify contract + wallet state |
| `test_force_override_flow` | Create → activate → past end_date with ungraded students → force complete → verify override audit |

### 8.7 Integration Tests — Reconciliation & Monitoring

**Test file:** `tests/integration/section_lifecycle/test_reconciliation.py`

| Test | Description |
|------|-------------|
| `test_daily_reconciliation_report` | Day with cancellations, overrides, disbursements → report has all sections |
| `test_empty_report` | Day with no activity → empty report, no errors |
| `test_health_check_endpoint` | After startup check runs → health check returns last_run_date |
| `test_health_check_never_ran` | Before any startup check → health check returns null, not healthy |
| `test_financial_impact_endpoint` | Returns correct YTD totals |

### 8.8 E2E Tests

**Test file:** `tests/e2e/section_lifecycle/cashier_dashboard.spec.ts`

| Test | Description |
|------|-------------|
| `cashier_views_pending_refunds` | Login as cashier → navigate to pending refunds → see list |
| `cashier_searches_refunds_by_student` | Search by student name → filtered results |
| `cashier_disburses_refund` | Click disburse → confirm → receipt displayed |
| `cashier_prints_receipt` | Disburse → receipt → print button triggers window.print |
| `cashier_views_history` | Navigate to disbursement history → see list |

---

## Files Touched

| File | Action |
|------|--------|
| `tests/integration/section_lifecycle/test_startup_checks.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_complete_section.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_cancellation.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_disbursement.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_deactivation.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_full_lifecycle.py` | **CREATE** |
| `tests/integration/section_lifecycle/test_reconciliation.py` | **CREATE** |
| `tests/e2e/section_lifecycle/cashier_dashboard.spec.ts` | **CREATE** |

## Test Data Setup

Each test file should have its own `pytest.fixture` or `beforeEach` to set up clean data:

```python
@pytest.fixture
async def active_section(db):
    """Create a section with active status, teacher, enrollments."""
    ...

@pytest.fixture
async def graded_section(db, active_section):
    """Active section where all students have final grades (including score=0)."""
    ...

@pytest.fixture
async def overdue_section(db, active_section):
    """Active section with end_date in the past."""
    ...
```

## Verification

- [ ] All integration tests pass (target: 40+ individual tests)
- [ ] All E2E tests pass in Chromium
- [ ] Edge cases covered: NULL vs 0 grades, duplicate disbursement, closed day blocks, certificates block cancellation, force override audit, teacher withdrawal blocks deactivation
- [ ] No test pollution — each test is isolated and cleans up after itself
- [ ] Tests run in CI without external service dependencies (Supabase mocked, etc.)

## Test Execution

```bash
# Run all integration tests for section lifecycle
pytest tests/integration/section_lifecycle/ -v

# Run E2E tests
npx playwright test tests/e2e/section-lifecycle/

# Run with coverage
pytest tests/integration/section_lifecycle/ --cov=app/modules/academic --cov=app/modules/lms
```
