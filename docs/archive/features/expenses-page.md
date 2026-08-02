# Expenses Page — Functionality Overview

The Expenses page (`/dashboard/expenses`) allows superadmins, managers, and secretaries to record institutional cash outflows. It provides a unified table of all expenses with filtering by type and search by voucher number, plus a form to create new expenses of four types:

| Type | Arabic | Purpose | Budget Source |
|------|--------|---------|---------------|
| `general_expense` | مصروف عام | Free-text expense (no employee link) | None |
| `teacher_withdrawal` | سحب معلم | Withdrawal from teacher's wallet | Wallet balance − frozen balance |
| `secretary_advance` | سلفة سكرتير | Advance against secretary's salary | `default_salary` − same-month advances |
| `salary_payment` | صرف راتب | Monthly salary for non-teaching staff | `default_salary` − same-month salary payments |

Each expense generates a unique voucher (`VCH-YYYYMMDD-NNNN`) and a printable receipt preview.

---

## Salary & Secretary Advance Withdrawal Workflow

### Common Logic

Both `salary_payment` and `secretary_advance` share the same `Employee.default_salary` as the monthly budget ceiling. Neither interacts with the teacher wallet or ledger — they are pure expense records tracked by monthly aggregation queries.

### `secretary_advance` — Budget Check

Only active employees where `employee_type = SECRETARY` are eligible.

```python
# financial_service.py:304-336 (get_eligible_recipients)
# Sums only secretary_advance expenses this month for this secretary
total_advances = SELECT SUM(amount) FROM expenses
    WHERE type = 'secretary_advance'
    AND recipient_id = :emp_id
    AND date BETWEEN month_start AND now

remaining = employee.default_salary - total_advances
```

### `salary_payment` — Budget Check

All active non-teacher employees (including secretaries) are eligible.

```python
# financial_service.py:338-371 (get_eligible_recipients)
# Sums only salary_payment expenses this month for this employee
total_paid = SELECT SUM(amount) FROM expenses
    WHERE type = 'salary_payment'
    AND recipient_id = :emp_id
    AND date BETWEEN month_start AND now

remaining = employee.default_salary - total_paid
```

### Creation Validation

In `create_expense()` (lines 439–456), the validation for both types follows the same pattern:

```python
monthly_limit = employee.default_salary
total_paid = SELECT SUM(amount) FROM expenses
    WHERE type = :expense_type          # only same-type expenses
    AND recipient_id = :recipient_id
    AND date BETWEEN month_start AND expense_date

if (monthly_limit - total_paid) < amount:
    raise ValueError(...)
```

---

## The Bug: Independent Ceilings on a Shared Budget

### Root Cause

`secretary_advance` and `salary_payment` **each query only their own expense type** when computing the remaining monthly budget. Neither accounts for the other.

For a secretary with `default_salary = 100,000 YER`:

| Step | Action | Type | Amount | secretary_advance total | salary_payment total | Perceived Remaining |
|------|--------|------|--------|------------------------|---------------------|---------------------|
| 1 | Secretary advance | `secretary_advance` | 30,000 | 30,000 | 0 | 70,000 (advance) |
| 2 | Salary payment | `salary_payment` | 70,000 | 30,000 | 70,000 | 30,000 (salary) |

**Result:** 100,000 YER paid out, but the system approved it because each type checked its own independent sum against the full 100,000 default_salary.

### Affected Code

**`get_eligible_recipients()`** — Lines 311–322 (secretary_advance) and lines 345–356 (salary_payment) — both filter `Expense.type` to their own type exclusively.

**`create_expense()`** — Lines 439–456 — the monthly limit check at line 445 also filters `Expense.type == expense_type`, so a `salary_payment` does not see prior `secretary_advance` expenses and vice versa.

### Impact

- A secretary can receive advances and salary payments that together exceed their `default_salary` in a single month.
- The system shows misleading "available limits" in the UI (full salary appears available for salary payment even after secretary advances have been taken).

### Required Fix

Both the eligibility check and the creation validation need to treat `secretary_advance` and `salary_payment` as sharing the same monthly pool for secretaries. Specifically:

1. **In `get_eligible_recipients()`**: For a secretary being evaluated for `salary_payment`, the remaining calculation should subtract both `salary_payment` AND `secretary_advance` totals from `default_salary`. Similarly for `secretary_advance`.

2. **In `create_expense()`**: When validating a `salary_payment` for a secretary, the `total_paid` sum should include both `salary_payment` and `secretary_advance` expenses. Same for `secretary_advance` for secretaries.

This ensures the combined advances + salary never exceed the employee's monthly `default_salary`.
