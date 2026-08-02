# Phase 3: Conditional UPDATE Patterns + Orphaned State Transactions

**Owner:** Backend A
**Estimate:** 3 days
**Dependencies:** None (no schema dependency — works with existing DB schema)

## Audit Items Covered

- **R08:** Double contract activation — `UPDATE SET status='ACTIVE' WHERE status='ASSIGNED'`
- **R09:** Double contract settlement — `UPDATE ... WHERE status='ACTIVE'`
- **R10:** Double contract cancellation — `UPDATE ... WHERE status='ACTIVE'`
- **R11:** Double refund disbursement — `UPDATE pending_refunds SET status='CLAIMED' WHERE status='UNCLAIMED'`
- **R12:** Double amendment approval — conditional status transition on contract
- **O01:** `cancel_section` orphaned state — transactional rollback on partial failure
- **O02:** `disburse_refund` orphaned state — atomic status + ledger write
- **O03:** `complete_section` orphaned state — atomic section + contract + ledger + certificates
- **O04:** `set_final_grades_bulk` orphaned state — atomic grades + contract + ledger
- **O05:** `close_day` orphaned state — atomic validations + closure
- **O06:** Enrollment + payment orphaned state — atomic enrollment + payment
- **O08:** Refund expense tracking orphaned state — atomic expense + ledger
- **S15:** Server restart during section cancellation (O01 protection)
- **S25:** Two cashiers disburse same refund (R11)
- **S27:** Grade submission + section completion race (O03 + O04 coordination)

## Tasks

### 3.1 Conditional UPDATE for Contract Status Transitions

In `ledger_service.py`, replace read-then-write patterns with atomic conditional UPDATEs:

**`activate_contract()`** — replace:
```python
contract = db.query(Contract).filter(Contract.id == contract_id).first()
if contract.status != 'ASSIGNED':
    raise ValueError("Contract not in ASSIGNED status")
contract.status = 'ACTIVE'
```
with:
```python
result = db.query(Contract).filter(
    Contract.id == contract_id,
    Contract.status == 'ASSIGNED'
).update(
    {"status": "ACTIVE"},
    synchronize_session=False
)
if result == 0:
    raise ValueError("Contract not in ASSIGNED status or already active")
```

**`settle_contract()`** — same pattern with `WHERE status = 'ACTIVE'`

**`cancel_contract()`** — same pattern with `WHERE status = 'ACTIVE'`

### 3.2 Conditional UPDATE for Refund Disbursement

In `cashier_service.py`, `disburse_refund()`:

```python
result = db.query(PendingRefund).filter(
    PendingRefund.id == refund_id,
    PendingRefund.status == 'UNCLAIMED'
).update(
    {"status": "CLAIMED"},
    synchronize_session=False
)
if result == 0:
    raise ValueError("Refund not found or already claimed")
```

### 3.3 Conditional UPDATE for Amendment Approval

In `ledger_service.py`, `approve_amendment()`:
- Add `SELECT FOR UPDATE` on the contract row before reading its status
- Then use conditional UPDATE to transition status

### 3.4 Transaction Wraps for Orphaned State Fixes

**O01 — `cancel_section()` in `cancellation_service.py`:**
- Wrap ALL writes (section status, wallet balance, frozen_balance, ledger_entries, section_cancellations, pending_refunds) in a single DB transaction
- Use `db.flush()` for intermediate writes, `db.commit()` at the end
- If any step fails, rollback the entire operation
- See audit line ~S15 for the scenario description

**O02 — `disburse_refund()` in `cashier_service.py`:**
- Wrap status update + ledger entry creation + refund record in one transaction
- If ledger entry creation fails, the status update must rollback

**O03 — `complete_section()` in `academic/service.py`:**
- Atomic: section status → contract settlement → ledger finalize → certificate generation
- If certificate generation fails, rollback the entire section completion
- See F01 (line 352) for the current `try/except/continue` that swallows certificate failures

**O04 — `set_final_grades_bulk()` in `academic/service.py`:**
- Atomic: grade insertion → contract status → ledger finalize
- Replace the current `try/except/pass` at line 754-758 with proper rollback

**O05 — `close_day()` in `daily_closures` code:**
- Wrap all validations + closure status change in single transaction
- Add atomicity check before writing closure record

**O06 — Enrollment + payment flow:**
- Enrollment commit and payment creation must be in the same transaction
- Payment has FK RESTRICT on enrollment — payment fails if enrollment not committed, but enrollment should also rollback

**O08 — Refund expense tracking:**
- Expense creation + ledger entry must be atomic

### 3.5 Fix F10 / F11 Commit Issues

Two locations where `await db.commit()` is called inside a service function instead of `flush()`:

- `academic/cancellation_service.py:292` — change `commit()` to `flush()`
- `academic/service.py:404` — change `commit()` to `flush()`

This ensures the caller's outer transaction can still roll back.

## Files to CREATE

None.

## Files to EDIT

| File | Specific Functions | Changes |
|------|-------------------|---------|
| `backend/app/modules/lms/ledger_service.py` | `activate_contract()`, `settle_contract()`, `cancel_contract()`, `approve_amendment()` | Replace status mutations with conditional UPDATEs |
| `backend/app/modules/lms/cashier_service.py` | `disburse_refund()` | Conditional UPDATE for PendingRefund status + O02 transaction wrap |
| `backend/app/modules/academic/cancellation_service.py` | `cancel_section()` | O01 transaction wrap + F10 commit→flush |
| `backend/app/modules/lms/compensation_service.py` | `approve_amendment()` | R12 conditional UPDATE |
| `backend/app/modules/academic/service.py` | `complete_section()` | O03 transaction wrap |
| `backend/app/modules/academic/service.py` | `set_final_grades_bulk()` | O04 transaction wrap + F02 logging |
| `backend/app/modules/academic/service.py` | `deactivate_section()` | F11 commit→flush |
| `backend/app/modules/academic/service.py` | Enrollment + payment | O06 transaction wrap |
| Close day handler | `close_day()` | O05 transaction wrap |
| Refund expense handler | refund expense code | O08 transaction wrap |

## Independent Boundary

- Do NOT modify DB schema or migrations (Phase 1, 2 concerns)
- Do NOT add SELECT FOR UPDATE patterns for capacity/balance checks (Phase 4 concern)
- Do NOT create idempotency keys (Phase 5 concern)
- Do NOT modify `lms/financial_service.py` (Phase 4 concern, except F03 logging which is Phase 6)
- Do NOT modify frontend files
- Do NOT modify Caddyfile or infrastructure configs
- **In `academic/service.py`, only edit `complete_section()`, `set_final_grades_bulk()`, `cancel_section()`, and `deactivate_section()` — do NOT touch enrollment capacity or payment balance functions**

## Acceptance Criteria

- [ ] All contract status transitions use `WHERE status = 'old_status' RETURNING *` pattern
- [ ] No function uses read-then-mutate for status fields
- [ ] `cancel_section()` is fully transactional — wallet reversal + cancellations + refunds all roll back together
- [ ] `disburse_refund()` creates PendingRefund status update + ledger entry atomically
- [ ] `complete_section()` creates section status + contract settlement + certificates atomically
- [ ] `set_final_grades_bulk()` grades + contract status + ledger finalized atomically
- [ ] `close_day()` is fully atomic
- [ ] `commit()` → `flush()` at both F10 and F11 locations
- [ ] All changes verified with existing test suite
