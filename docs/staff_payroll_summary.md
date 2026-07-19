# Staff Payroll Feature — Summary for Supervisor Review

## What was built

A new **Staff Payroll** page at `/dashboard/staff-payroll` (sidebar → "الرواتب") that
lets managers withdraw partial salary amounts for non-teaching staff
(secretaries, cleaners, security, etc.) throughout the month.

### Backend endpoints

| Method | Endpoint | Who can use |
|--------|----------|-------------|
| GET | `/api/v1/staff-payroll` | superadmin, manager, secretary |
| POST | `/api/v1/staff-payroll/{id}/withdraw` | superadmin, manager |

Each withdrawal creates an expense row with type `salary_draw`.

---

## Difference between `salary_payment` and `salary_draw`

### Salary Payment (old — keep or remove?)

- Created by the generic **Expenses** page (`/dashboard/expenses`)
- Tracks only its own type: `SELECT SUM(amount) FROM expenses WHERE type = 'salary_payment'`
- Ignores `secretary_advance` expenses (and vice versa)
- **This was the bug**: both types independently check against `default_salary`, so a secretary could withdraw 100% via `secretary_advance` **and** another 100% via `salary_payment`

### Salary Draw (new — the fix)

- Created by the new **Staff Payroll** page
- Aggregates ALL `salary_draw` rows: `SELECT SUM(amount) FROM expenses WHERE type = 'salary_draw'`
- Single unified type means the monthly ceiling is enforced correctly
- Uses `SELECT ... FOR UPDATE` (pessimistic row lock) to prevent concurrent withdrawals from both passing validation
- Idempotency-Key header (already handled by the API client + middleware) prevents duplicate expense rows on network retries

---

## Decision needed from you

Currently both systems coexist. New withdrawals use `salary_draw`. Old records stay as `salary_payment` / `secretary_advance`.

**Option A — Keep both** (no risk, no migration work):
- Old Expenses page still works for the old types
- New Staff Payroll page uses `salary_draw` only
- Old records remain readable

**Option B — Deprecate old types** (recommended):
- Remove `salary_payment` and `secretary_advance` from the Expenses page form (users can no longer create them)
- Convert existing rows to `salary_draw`:
  ```sql
  UPDATE expenses SET type = 'salary_draw'
  WHERE type IN ('secretary_advance', 'salary_payment');
  ```
- Remove the two old types from the PostgreSQL enum
- Delete the old `eligible-recipients` logic from `financial_service.py`
- Simplifies the codebase down to one code path for all salary expenses

### ⚠️ Impact of Option B on historical records

Auditing the codebase found **two places** that display the raw expense type to users:

| Location | Current behavior after migration |
|----------|----------------------------------|
| PDF voucher (`voucher_service.py`) | Old "Secretary Advance" / "Salary Payment" vouchers will print as "Staff Salary" |
| Daily closures ledger page | Old row badges will show "راتب موظف" instead of "سلفة سكرتير" / "صرف راتب" |

If preserving the original type on old printed vouchers matters for auditing, we can:
- Keep the enum values in PostgreSQL (safe, no data loss) and only remove them from the UI forms
- Or add a `previous_type` audit column before conversion

**Decision: Proceed with Option B and accept the label change on historical records?**

Which option should we proceed with?
