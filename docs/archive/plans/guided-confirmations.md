# Guided Confirmations with 30-Second Soft-Undo — Implementation Plan

**Status:** Implemented (commit 370a1df)
**Target:** v1.8
**Prereq:** None (one additive migration; existing tables only gain nullable columns)
**Backlog origin:** `docs/plans/ux-suggestions.md` #5

## Problem / Current State

Destructive financial actions (refunds, withdrawals, unenrollments, cancellations) were
flagged as relying on native `confirm()`. The audit found that most flows have already
outgrown native `confirm()` — but they are inconsistent, none of them surface day-closure
implications before submit, and **no flow has any undo capability**.

| Action | Forced reason | Impact summary | Closure warning | Undo |
|---|---|---|---|---|
| Unenrollment (`UnenrollModal.tsx`) | Wizard step 3 | Wizard step 1 preview | ❌ | ❌ |
| Section cancel (`CancelSectionModal.tsx`) | Wizard step 3 | Wizard step 1 preview | ❌ | ❌ |
| Refund disbursement (`DisburseRefundModal.tsx`) | notes (optional) | amount only | ❌ | ❌ |
| Teacher withdrawal (`teacher-wallet/page.tsx`) | ❌ | balance-after ✅ | ❌ | ❌ |
| Salary draw (`staff-payroll/page.tsx`) | ❌ | ❌ | ❌ | ❌ |
| Roles-page native `confirm()` (`roles/page.tsx:180`) | n/a | n/a | ❌ | ❌ |

Supporting facts that shape the design:

- Backend already enforces closed-day blocks on every money mutation
  (`closure_service.is_date_closed` in `financial_service`, `staff_payroll_router`,
  `cashier_service`, academic services) — but the frontend never surfaces this before submit.
- The ledger is **append-only** (`ledger_service.record` + `LedgerEntry`): every movement is
  an entry, wallet balances derive from summed entries. This makes a compensating reversal
  entry the correct, auditable undo mechanism.
- **No `void`/undo API exists anywhere today.** There are no `voided_at` columns, no
  reversal-mostly entry types beyond `AMENDMENT_ADJUSTMENT`.
- Native `confirm()` appears exactly once in the whole frontend (roles page, an unsaved-
  changes guard — not a financial action).

## Scope (per UX suggestion #5, confirmed)

- **Soft-undo covers pure-money transactions only**: teacher withdrawals, salary draws, and
  disbursed refunds. These are the accidental-click risks and have a clean reversal path.
- **Unenrollment and section cancellation stay wizard-driven** (they already force a reason
  + impact preview); they gain only a day-closure warning banner. Full multi-table restore
  for those (enrollments, refund liabilities, teacher-share reversals) is deliberately out
  of scope — high risk, low marginal benefit for a 30s undo.
- Undo window is **server-enforced at 30 seconds**; the toast shows a live countdown.
- The roles-page native `confirm()` is replaced with the existing `ConfirmModal` for
  consistency (non-financial, trivial).

## Standing Invariants

1. **Voided records are never physically deleted** (except the fresh `Refund` row in the
   refund-undo path). `Expense` gains nullable `voided_at` / `voided_by` / `void_reason`
   columns; voided rows remain visible in history, flagged as voided.
2. **Reversals are compensating ledger entries, not balance rewrites.** The undo of a
   teacher withdrawal credits the wallet via a new `WITHDRAWAL_REVERSAL` entry that links to
   the voided expense's receipt number. History stays chain-of-custody complete.
3. **Aggregations hide voided rows.** Monthly salary-draw caps and staff-payroll
   "remaining balance" must exclude `voided_at IS NOT NULL` expenses, or undoing a draw
   would incorrectly consume the monthly cap.
4. **Window and closure checks live server-side.** The client countdown is cosmetic; the
   API rejects undo after 30 s or on a closed date regardless of UI state.
5. **Required reason.** No guided confirm submits without a non-empty reason; the backend
   schema enforces it too for money mutations.

## Implementation Plan

### Phase 1 — Shared frontend foundation

New building blocks under `apps/erp/frontend/components` and `apps/erp/frontend/lib`.

1. **`components/GuidedConfirmSection.tsx`** — embeddable, bilingual (AR/EN) block used
   inside all five modals:
   - required **reason** `<textarea>` (with `*` label, disabled submit until non-empty),
   - **live impact summary** slot (amount / balance-after / remaining-balance chips),
   - **day-closure banner** driven by `useClosureStatus` (e.g. "This action falls on a
     closed financial day — the day must be unlocked to proceed").
2. **`hooks/useClosureStatus.ts`** — `GET /lms/daily-closures?date_from&date_to` for the
   action date; returns `closed | pending | unlock_requested`; caches per date.
3. **`components/UndoToast.tsx`** — fixed bottom toast, 30 s countdown bar, **Undo**
   button, auto-dismiss at 0, RTL-aware.
4. **`hooks/useUndoableAction.ts`** — wraps an action `POST`; on success resolves the
   resource id + undo endpoint and posts an `UndoToast` bound to it.

### Phase 2 — Backend undo + migration

1. **Alembic migration**: `Expense.voided_at` (`DateTime, nullable`), `.voided_by`
   (`UUID, nullable`), `.void_reason` (`Text, nullable`);
   extend `LedgerEntryType` enum with `WITHDRAWAL_REVERSAL = "withdrawal_reversal"`.
   Pydantic schema gains the three void fields.
2. **`POST /lms/expenses/{expense_id}/void`** (in `modules/lms/router.py`):
   - Guards: expense exists & not voided; `type in (teacher_withdrawal, salary_draw)`;
     `is_date_closed(expense.date)` must be false; `now_utc - created_at <= 30s`;
     required `void_reason` body.
   - RBAC: `superadmin`, `manager`, `secretary`.
   - Effect:
     - `teacher_withdrawal` → tag void fields + compensating `WITHDRAWAL_REVERSAL` ledger
       entry (`available_delta = +amount`, narrative references voided receipt).
     - `salary_draw` → tag void fields only.
   - Responses: `ExpenseResponse`; 409 for window/closure, 400 for reason-missing/invalid.
3. **`POST /lms/cashier/refunds/{refund_id}/undo`** (in `modules/lms/cashier_service.py`
   + router):
   - Guards: refund exists; `now_utc - disbursed_at <= 30s`; disbursement date not closed;
     RBAC superadmin/manager/accountant/secretary.
   - Effect: return pending refund to `UNCLAIMED` and delete the fresh `Refund` row.
4. **Aggregation updates** — exclude voided expenses from:
   - `financial_service.create_expense` monthly salary-draw cap summation;
   - `staff_payroll_service` remaining-balance/total-drawn queries.

### Phase 3 — Wire into flows

1. `cashier/DisburseRefundModal.tsx` — add required reason + impact summary + closure
   banner; on success refresh queue and show UndoToast targeting
   `/api/cashier/refunds/{refund_id}/undo`.
2. `teacher-wallet` withdrawal modal — add required reason + closure banner; keep the
   existing balance-after preview; on success show UndoToast targeting
   `/api/expenses/{id}/void` (expense ids returned by the withdrawal POST).
3. `staff-payroll` modal — add required reason + remaining-salary-after summary + closure
   banner; undo via `/api/expenses/{id}/void`.
4. `UnenrollModal.tsx` / `CancelSectionModal.tsx` — add the closure-status banner to each
   step; wizard structure unchanged.
5. `roles/page.tsx:180` — replace `confirm(...)` with the existing `ConfirmModal`.

### Phase 4 — Tests

**Backend pytest (`tests/`):**
- void: happy path (wallet credited, `WITHDRAWAL_REVERSAL` entry, expense marked voided),
  30s-window rejection, closed-date rejection, double-void rejection, required-reason,
  RBAC; salary-draw voided rows excluded from monthly cap and from remaining-balance.
- refund undo: `PENDING`→`UNCLAIMED` round-trip, 30s window, closure, RBAC.

**Frontend Playwright (`tests/e2e/`):**
- modal submit blocked until reason non-empty; UndoToast appears after successful money
  mutation and its Undo hits the expected endpoint; `closed` closure status renders banner.
- regression: unenroll/cancel wizards render the closure banner without breaking existing
  3-step flow.

## Risks

- `ledger_service.record` must apply the positive `available_delta` to the wallet balance
  on reversal precisely as it does for credits on the payment path (verify the credit
  branch before relying on it).
- Timezone alignment: 30 s window compared in UTC vs `is_date_closed` keyed on local
  `get_today()`. Use one authoritative clock (`datetime.now(timezone.utc)`) for the window
  and the existing local-date rule for closures; document the choice in code.
- Refund-undo deletes the `Refund` row rather than voiding it. Acceptable because the row is
  a fresh disbursement leaf (no further references) — flag in PR for the base if a client
  ever needs reprint history of undone disbursements.

## Files Touched (approx)

Backend:
- `apps/erp/backend/app/modules/lms/models.py` (enum)
- `apps/erp/backend/app/modules/lms/financial_service.py` (void + cap filters)
- `apps/erp/backend/app/modules/lms/cashier_service.py` (refund undo)
- `apps/erp/backend/app/modules/lms/router.py`, `apps/erp/backend/app/modules/lms/schemas.py`
- `apps/erp/backend/app/modules/lms/staff_payroll_service.py`, `apps/erp/backend/app/modules/lms/ledger_service.py`
- new Alembic revision

Frontend:
- new `components/GuidedConfirmSection.tsx`, `components/UndoToast.tsx`
- new `hooks/useClosureStatus.ts`, `hooks/useUndoableAction.ts`
- edited: `components/cashier/DisburseRefundModal.tsx`,
  `components/students/UnenrollModal.tsx`,
  `components/sections/CancelSectionModal.tsx`,
  `app/.../dashboard/teacher-wallet/page.tsx`,
  `app/.../dashboard/staff-payroll/page.tsx`,
  `app/.../dashboard/roles/page.tsx`

Tests:
- backend `tests/` (void / refund-undo suites)
- frontend `tests/e2e/` (guided-confirm spec, wizard-closure spec)

## Backlog origin
`docs/plans/ux-suggestions.md` #5 — Guided confirmations instead of native `confirm()`.