# Compensation Model Refactoring — Implementation Plan (v2)

> Based on analysis of `compensation-refactoring.md`, actual codebase models, and design decisions:
> 1. Unify holdback for both fixed and percentage types
> 2. SectionContract is 1:1 with CourseSection
> 3. Full CompensationAmendmentRequest approval table
> 4. Clean slate — system is still in development

---

## Root-Cause Diagnosis

Compensation has no first-class object. The "deal" between institute and teacher is smeared across five locations:

| Location | What it holds |
|----------|---------------|
| `Employee.compensation_type / salary / default_percentage` | The *default* terms |
| `CourseSection.teacher_percentage` | A *partial* override |
| `financial_service.activate_section` | Retroactively credits from payments |
| `financial_service.create_payment` | Credits per-payment, then zeroes for salary |
| `TeacherWallet.balance` (single mutable number) | No audit trail |

No single record answers: *"For section X, what did we agree to pay this teacher, and what's the current state of that obligation?"*

---

## Solution: Contract + Ledger + State Machine

Keep Option D's settlement policy (credit up-front, holdback on grade finalization) but build it on three abstractions:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         SectionContract                             │
│   (1:1 with CourseSection — the single source of truth)             │
│                                                                     │
│   compensation_model: fixed | percentage                            │
│   fixed_amount / percentage                                          │
│   holdback_rate: 0.20 (unified for both models)                     │
│   status: draft → assigned → active → grades_submitted →           │
│           settled (or → cancelled from any state)                   │
│   teacher_id (nullable until assign)                                 │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ 1:N
┌──────────────────────▼──────────────────────────────────────────────┐
│                         LedgerEntry                                 │
│   (append-only — every money movement is a row)                     │
│                                                                     │
│   type: activation_credit | payment_share | grade_unfreeze |        │
│         amendment_adjustment | reversal | withdrawal                │
│   available_delta: +/-, frozen_delta: +/-, narrative               │
│   reference (polymorphic FK to payment/expense/section)             │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ aggregated
┌──────────────────────▼──────────────────────────────────────────────┐
│                        TeacherWallet                                │
│   (cached projection, updated in same tx as LedgerEntry)            │
│                                                                     │
│   balance (cached) = SUM(available_delta) + SUM(frozen_delta)      │
│   available_balance (computed) = balance - frozen_balance           │
│   frozen_balance (cached) = SUM(frozen_delta)                      │
└─────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────┐
│       CompensationAmendmentRequest   │
│                                      │
│   pending → approved → LedgerEntry   │
│          → rejected                  │
└──────────────────────────────────────┘
```

---

## Data Model — New Tables

### SectionContract (`lms/models.py`)

```python
class SectionContract(Base):
    __tablename__ = "section_contracts"

    id: UUID PK
    section_id: UUID FK → course_sections.id (unique, not null)
    teacher_id: UUID FK → employees.id, nullable
    compensation_model: Enum('fixed', 'percentage'), nullable until assigned
    fixed_amount: Numeric(12,2), nullable
    percentage: Numeric(5,2), nullable
    holdback_rate: Numeric(5,4), default=0.20  # unified for both models
    status: Enum('draft', 'assigned', 'active', 'grades_submitted',
                 'settled', 'cancelled'), default='draft'
    created_at, updated_at
```

### LedgerEntry (`lms/models.py`)

```python
class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: UUID PK
    wallet_id: UUID FK → teacher_wallets.id, not null
    contract_id: UUID FK → section_contracts.id, nullable (global ops)

    type: Enum('activation_credit', 'payment_share', 'grade_unfreeze',
               'amendment_adjustment', 'reversal', 'withdrawal')

    total_amount: Numeric(12,2)         # gross money movement (always positive)
    available_delta: Numeric(12,2)      # + = credit to available, - = debit
    frozen_delta: Numeric(12,2)         # + = freeze, - = unfreeze

    reference_type: str(20), nullable   # 'payment', 'expense', 'section'
    reference_id: UUID, nullable
    narrative: Text
    created_at
    created_by: UUID FK → employees.id
```

### CompensationAmendmentRequest (`lms/models.py`)

```python
class CompensationAmendmentRequest(Base):
    __tablename__ = "compensation_amendment_requests"

    id: UUID PK
    contract_id: UUID FK → section_contracts.id

    previous_fixed_amount: Numeric(12,2), nullable
    requested_fixed_amount: Numeric(12,2), nullable
    previous_percentage: Numeric(5,2), nullable
    requested_percentage: Numeric(5,2), nullable

    reason: Text
    requested_by: UUID FK → employees.id
    requested_at

    status: Enum('pending', 'approved', 'rejected')
    reviewed_by: UUID FK → employees.id, nullable
    reviewed_at, nullable
    review_notes: Text, nullable

    ledger_entry_id: UUID FK → ledger_entries.id, nullable  # set on approval
```

---

## Data Model — Modified Tables

### CourseSection (`academic/models.py`)

| Field | Change |
|-------|--------|
| `teacher_id` | Make nullable (FK moves to SectionContract) |
| `teacher_percentage` | Keep as convenience field, synced from contract on assign |
| — | Add `contract` relationship (uselist=False) |

### TeacherWallet (`lms/models.py`)

| Field | Change |
|-------|--------|
| `balance` | Keep — now a cached aggregate |
| `last_updated` | Keep |
| NEW: `frozen_balance` | Numeric(12,2), default=0 — cached aggregate |

**Available balance** = `balance - frozen_balance` (computed, never stored).

### Employee (`identity/models.py`)

| Field | Change |
|-------|--------|
| `compensation_type` | **REMOVE** — no longer employee-level |
| `salary` | **REMOVE** — was monthly salary (wrong concept) |
| `default_percentage` | **KEEP** — only as form prefill default |
| NEW: `default_salary` | Numeric(12,2), nullable — default fixed fee per section prefill |

---

## State Machine

```
                 assign teacher
DRAFT ──────────────────────────────→ ASSIGNED
                                         │
                          ┌──────────────┼──────────────────┐
                          │              │                   │
                     manager         manager/           teacher
                     activates       teacher rejects     removed
                          │              │                   │
                          ▼              ▼                   ▼
                       ACTIVE        CANCELLED           CANCELLED
                          │             ▲                   ▲
            ┌─────────────┤             │                   │
            │             │     (any state can go           │
       all grades     payment       to CANCELLED)           │
       entered ←────── arrives                              │
            │             │                                  │
            ▼             ▼                                  │
      GRADES_SUBMITTED    │                                  │
            │             │                                  │
       admin completes    │                                  │
            │                                                 │
            ▼                                                 │
         SETTLED ─────────────────────────────────────────────┘
```

### Transition Side Effects

| Transition | Fixed | Percentage |
|---|---|---|
| **assigned → active** | `LedgerEntry(activation_credit, total=fee, available=+fee×0.8, frozen=+fee×0.2)`; wallet updated same tx | No entry (waits for payments) |
| **payment arrives** | No entry (fee already credited at activation) | `LedgerEntry(payment_share, total=share, available=+share×0.8, frozen=+share×0.2)` |
| **active → grades_submitted** | Auto-detect when all FinalGrade exist → `marks_finalized = True`, `contract.status = grades_submitted` | Same |
| **grades_submitted → settled** | `LedgerEntry(grade_unfreeze, available=+frozen, frozen=-frozen)`; generate certificates | Same |
| **any → cancelled** | `LedgerEntry(reversal)` reversing net available + frozen deltas from all prior entries on that contract; wallet deducts | Same |

---

## Financial Service — Refactor

### New: `LedgerService` (`lms/ledger_service.py`)

```python
class LedgerService:
    def record(wallet_id, contract_id, type, total_amount,
               available_delta, frozen_delta, ref_type, ref_id,
               narrative, created_by) -> LedgerEntry:
        # 1. INSERT LedgerEntry
        # 2. UPDATE wallet in same transaction:
        #      balance += available_delta + frozen_delta
        #      frozen_balance += frozen_delta
        # 3. Verify invariants:
        #      frozen_balance >= 0
        #      frozen_balance <= balance
        # 4. Return entry

    def get_wallet_summary(wallet_id) -> WalletSummary:
        # Returns per-contract breakdown:
        #   credited, frozen, available per section
```

### Updated: `financial_service.py`

Existing functions become thin wrappers around `LedgerService.record()`:

| Function | Logic After Refactor |
|----------|---------------------|
| `activate_section` | If fixed: call `LedgerService.record(activation_credit, ..., available=+fee×0.8, frozen=+fee×0.2)`. If percentage: no-op. Set contract status to active. |
| `create_payment` | If percentage: call `LedgerService.record(payment_share, ..., available=+share×0.8, frozen=+share×0.2)`. If fixed: no-op. |
| `create_expense` | Guard: `wallet.balance - wallet.frozen_balance >= amount`. Call `LedgerService.record(withdrawal, available=-amount)`. No change to frozen balance. |
| `complete_section` | Guard: `contract.status == 'grades_submitted'`. Call `LedgerService.record(grade_unfreeze, available=+frozen, frozen=-frozen)`. Generate certificates. Set contract → settled, section → completed. |

All `if compensation_type == SALARY` branches are deleted.

---

## CompensationAmendmentRequest — Approval Workflow

```python
class CompensationAmendmentService:
    def create(contract_id, requested_amount, reason, requested_by):
        # Set pending, record previous values from current contract

    def approve(request_id, reviewer):
        # 1. Update contract.fixed_amount / percentage
        # 2. If contract is active:
        #      Create LedgerEntry(amendment_adjustment)
        #      available = delta_fixed × 0.8 (if the adjustment happened
        #        after activation, only the delta needs the 80/20 split
        #      frozen = delta_fixed × 0.2
        # 3. Set status = approved
        # 4. Link ledger_entry_id

    def reject(request_id, reviewer, notes):
        # Set status = rejected, store notes
```

---

## API Endpoints

New/updated routes:

```
# Section Contract
GET    /sections/{id}/contract              → contract detail
PUT    /sections/{id}/contract/assign       → assign teacher + set terms
POST   /sections/{id}/contract/activate     → manager activation
POST   /sections/{id}/contract/complete     → admin completion (settle)

# Compensation Amendments
POST   /sections/{id}/contract/amend        → create amendment request
GET    /amendments/pending                  → manager's pending queue
PUT    /amendments/{id}/approve             → manager approves
PUT    /amendments/{id}/reject              → manager rejects

# Wallet
GET    /wallet/{teacher_id}                 → wallet + per-section breakdown
POST   /wallet/withdraw                     → create expense (existing, guard updated)
```

---

## Frontend Changes

### Section Create/Edit Form

| Field | Behavior |
|-------|----------|
| Course | Required (unchanged) |
| Teacher | Optional dropdown. When changed, upserts SectionContract in draft. |
| Compensation Type | Shown only when teacher selected. Dropdown: Fixed / Percentage. |
| Fixed Amount | Shown when type = Fixed. Read-only, prefilled from teacher's `default_salary`. "Request Increase" button. |
| Percentage | Shown when type = Percentage. Read-only, prefilled from teacher's `default_percentage`. "Request Increase" button. |
| Request Increase | Opens modal showing current amount, new amount field, reason textarea. Submits to `POST /amend`. |
| Capacity, Price, Dates | Unchanged. |

### Section Detail Page

- Contract status badge alongside section status
- **Activate** button: enabled only when teacher assigned + terms set
- **Complete** button: enabled only when `marks_finalized` is true

### Teacher Wallet Page

Two sections:

**Top — Balances:**
- **Available Balance:** `wallet.balance - wallet.frozen_balance` (green, large)
- **Frozen Balance:** `wallet.frozen_balance` (gray, tooltip: "Released when section grades are finalized")

**Bottom — Per-Section Breakdown:**
| Section | Model | Fee | Credited | Frozen | Available | Status |
|---------|-------|-----|----------|--------|-----------|--------|
| Math 101 | Fixed | $500 | $500 | $100 | $400 | Active |
| Physics | % | — | $450 | $90 | $360 | Active |
| Chemistry | Fixed | $750 | $750 | $0 | $750 | Settled |

Queried from `LedgerEntry` grouped by `contract_id`.

### Manager Dashboard — Amendment Queue

Table of pending `CompensationAmendmentRequest`:

| Section | Teacher | Current Amount | Requested Amount | Reason | Action |
|---------|---------|---------------|-----------------|--------|--------|
| Math 101 | John D. | $500 | $600 | "Extra sessions" | [Approve] [Reject] |

### Withdrawal (Expenses) Form

No visible changes. Server-side guard against `available_balance` is the only change.

---

## Migration (Clean Slate)

Since the system is still in development with no live data:

1. **Create new tables** — run `alembic revision --autogenerate`
2. **Remove** `compensation_type` and `salary` from `Employee`
3. **Add** `default_salary` to `Employee`
4. **Make** `CourseSection.teacher_id` nullable
5. **Add** `frozen_balance` to `TeacherWallet`
6. **Drop** any dead columns after verifying no code references them

If any test data exists:
- Create `SectionContract` for every existing `CourseSection` that has a `teacher_id`
- Create an opening `LedgerEntry(opening_balance)` for each existing `TeacherWallet`

---

## Invariants

```
[ ] wallet.frozen_balance >= 0
[ ] wallet.frozen_balance <= wallet.balance
[ ] wallet.balance = SUM(available_delta + frozen_delta) across all entries
[ ] wallet.frozen_balance = SUM(frozen_delta) across all entries
[ ] No withdrawal if amount > wallet.balance - wallet.frozen_balance
[ ] contract.status == 'active' before any payment processing
[ ] contract.status == 'grades_submitted' before settlement
[ ] Cancelled contract's reversal entries net-zero its prior credits
[ ] holdback_rate ∈ [0.0, 1.0]
[ ] One SectionContract per CourseSection (unique FK)
```

Enforce via DB constraints where possible; otherwise as in-transaction assertions in LedgerService.

---

## File Change Summary

| File | Change Type |
|------|-------------|
| `lms/models.py` | +SectionContract, +LedgerEntry, +CompensationAmendmentRequest; +TeacherWallet.frozen_balance |
| `lms/schemas.py` | +schemas for new models, fields |
| `lms/ledger_service.py` | NEW: record(), get_wallet_summary(), invariants |
| `lms/compensation_service.py` | NEW: CompensationAmendmentService |
| `lms/financial_service.py` | REWRITE: remove old branches, delegate to LedgerService |
| `lms/router.py` | +compensation endpoints (or new `lms/compensation_router.py`) |
| `academic/models.py` | CourseSection.teacher_id nullable, +contract relationship |
| `academic/service.py` | Refactor: activate_section, complete_section, set_final_grades_bulk |
| `academic/router.py` | +activation/completion endpoints |
| `academic/schemas.py` | +contract fields |
| `identity/models.py` | Remove compensation_type, salary; +default_salary |
| `identity/service.py` | Update create/update employee |
| `identity/schemas.py` | Update serializers |
| Frontend — Section Form | Teacher optional, comp fields, request increase |
| Frontend — Wallet Page | Frozen balance, per-section breakdown |
| Frontend — Manager Dashboard | Amendment approval queue |
| Frontend — Section Detail | Activate/Complete button guards |

---

## Implementation Order

### Phase 1 — Data Model (models, migrations)
1. Add new tables: `SectionContract`, `LedgerEntry`, `CompensationAmendmentRequest`
2. Add `frozen_balance` to `TeacherWallet`
3. Make `CourseSection.teacher_id` nullable, add `contract` relationship
4. Remove `compensation_type`, `salary` from `Employee`; add `default_salary`
5. Run `alembic revision --autogenerate`

### Phase 2 — Backend Core (LedgerService, compensation services)
1. Implement `LedgerService.record()` with invariant checks and wallet update
2. Implement `LedgerService.get_wallet_summary()` for per-section breakdown
3. Implement `SectionContract` state machine (assign, activate, complete, cancel)
4. Implement `CompensationAmendmentService` (create, approve, reject)

### Phase 3 — Backend Integration (refactor existing services)
1. Rewrite `financial_service.py` — delegate all money movements to `LedgerService`
2. Delete all `compensation_type == SALARY` branches
3. Update `academic/service.py` — `activate_section`, `complete_section`, `set_final_grades_bulk`
4. Update `identity/service.py` — remove old compensation fields from CRUD

### Phase 4 — Backend APIs
1. Contract CRUD + state transition endpoints
2. Amendment request CRUD + approval endpoints
3. Wallet query with per-section breakdown
4. Withdrawal endpoint (guards updated, signature unchanged)

### Phase 5 — Frontend
1. Section form: teacher optional, compensation fields, request increase
2. Wallet page: frozen balance display, per-section breakdown table
3. Manager dashboard: amendment request approval queue
4. Section detail: activate/complete buttons with state guards

### Phase 6 — Validation & Cleanup
1. Remove dead code paths (old `compensation_type` branches, `salary` logic)
2. Run full test suite
3. Verify all invariants hold with integration tests
4. Clean up deprecated fields from serializers and schemas

---

## Estimated Effort

| Phase | Complexity | Days |
|-------|-----------|------|
| Phase 1 — Data Model | Medium | 0.5 |
| Phase 2 — Backend Core | Medium | 1 |
| Phase 3 — Backend Integration | Medium | 1 |
| Phase 4 — Backend APIs | Small | 0.5 |
| Phase 5 — Frontend | Medium | 1 |
| Phase 6 — Validation | Small | 0.5 |
| **Total** | **Medium** | **4–5** |
