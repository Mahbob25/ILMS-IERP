# Refund → Contra-Revenue Tracking + Voucher Support

## Problem

Refunds are invisible in financial reporting. The `Refund` table exists and is correct, but queries aggregate `Expense.amount` only for outflows and `Payment.amount` only for inflows — refunds fall through the cracks.

| Concern | Root Cause |
|---|---|
| Revenue overview net revenue = payments - expenses | Refunds are excluded from the subtraction |
| Daily ledger `total_expenses_out` | Sums `Expense.amount` only |
| Closures list dates union | Uses `Payment.date` + `Expense.date` only |
| No voucher for refunds | No preview endpoint for `RFD-` receipts |
| Dashboard aggregations | Queries `Expense.amount` for outflows only |

## Standing Invariant

**Refunds are Contra-Revenue, not Operating Expenses.** Never write refund data into the `Expense` table. The `Refund` table is the single source of truth. All fixes are in the aggregation/reporting layer and the addition of a refund-specific voucher endpoint.

## Changes

### 1. Revenue Overview — subtract refunds, don't add expenses

**`backend/app/modules/lms/financial_service.py` `get_revenue_overview()`**

Add a refund aggregation alongside the expense summation:

```python
ref_result = await db.execute(
    select(func.coalesce(func.sum(Refund.amount), 0))
    .where(func.date(Refund.disbursed_at) >= period_start,
           func.date(Refund.disbursed_at) <= period_end)
)
total_refunds = float(ref_result.scalar() or 0)
```

Return a new `"total_refunds"` field in the response. Keep `total_expenses` as-is (operating expenses only). Net revenue becomes:

```python
net_revenue = total_revenue - total_expenses - total_refunds
```

Also include `total_refunds` in the monthly trend SQL (UNION or separate CTE).

**Schema impact**: Add `total_refunds` field to `RevenueOverviewResponse` in `schemas.py`.

### 2. Daily Ledger — add refunds as a third section

**`backend/app/modules/lms/financial_service.py` `get_daily_ledger()`**

Add a refund aggregation block:

```python
refunds_out_result = await db.execute(
    select(func.coalesce(func.sum(Refund.amount), 0))
    .where(func.date(Refund.disbursed_at) == ledger_date)
)
total_refunds_out = float(refunds_out_result.scalar() or 0)
```

Return a new `"total_refunds_out"` and a `"refunds"` detail list in the response. Update `net_cash_flow`:

```python
"net_cash_flow": total_payments_in - total_expenses_out - total_refunds_out,
```

Include a refund detail query (joined with PendingRefund → Enrollment → Student for student_name).

**Schema impact**: Add `RefundDetailItem` to `schemas.py`. Update `DailyClosureResponse` or daily ledger response as needed.

### 3. Closures List — add Refund.date to the union

**`backend/app/modules/lms/financial_service.py` `list_closures()`**

```python
refunds_dates = select(func.date(Refund.disbursed_at).label("date")).subquery()
```

Add to the union: `select(refunds_dates.c.date)`

Also add a refund total subquery alongside the existing payment/expense subqueries.

### 4. Dashboard — include refunds in outflows

**`backend/app/modules/lms/dashboard/service.py`**

- **Secretary dashboard** (`get_secretary_dashboard`): Add today's refunds to `today_expenses_count` and `today_expenses_total` (or to a new field; depends on frontend expectations). Better: add a separate `today_refunds_total` field.
- **Manager dashboard** (`get_manager_dashboard`): Include refund amounts in the outflows.

### 5. New Endpoint: GET /lms/refunds/{refund_id}/preview

**`backend/app/modules/lms/financial_service.py`**

Add `get_refund_voucher_html_content()`:

```python
async def get_refund_voucher_html_content(db: AsyncSession, refund_id: uuid.UUID, locale: str = "ar") -> Optional[str]:
    # Load Refund with joined PendingRefund → Enrollment → Student → CourseSection → Course
    # Load disbursed_by_user for cashier name
    # Call _generate_refund_voucher_html() with student name, course name, amount, receipt number
```

Add `_generate_refund_voucher_html()` — similar to `_generate_voucher_html()` but with refund-specific labels ("سند استرداد" / "Refund Voucher" instead of "سند صرف" / "Payment Voucher").

**`backend/app/modules/lms/router.py`**

```python
@lms_router.get("/cashier/refunds/{refund_id}/preview")
async def preview_refund_voucher(
    refund_id: uuid.UUID,
    locale: str = Query("ar"),
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager", "accountant"])),
    db: AsyncSession = Depends(get_db),
):
    html = await financial_service.get_refund_voucher_html_content(db, refund_id, locale=locale)
    if not html:
        raise HTTPException(status_code=404, detail="Refund not found")
    return HTMLResponse(html)
```

### 6. Revenue Overview Schema update

**`backend/app/modules/lms/schemas.py`**

Add `total_refunds: float = 0` to `RevenueOverviewResponse`. Update the `meta` or response dict to include the new field.

### 7. Tests

- `test_revenue_overview_includes_refunds` — seed payments and refunds, verify net_revenue = payments - refunds
- `test_daily_ledger_shows_refunds` — seed daily ledger with refunds, verify refund section
- `test_closure_list_includes_refund_dates` — day with only refund activity appears
- `test_refund_voucher_preview` — verify HTML is returned with correct data

## Files Changed

| File | Change |
|---|---|
| `backend/app/modules/lms/schemas.py` | Add `RefundDetailItem`, add `total_refunds` to revenue response |
| `backend/app/modules/lms/financial_service.py` | `get_revenue_overview()` — add refund aggregation |
| | `get_daily_ledger()` — add refund section |
| | `list_closures()` — include refund dates |
| | New `get_refund_voucher_html_content()`, `_generate_refund_voucher_html()` |
| `backend/app/modules/lms/router.py` | New `GET /lms/cashier/refunds/{refund_id}/preview` |
| `backend/app/modules/lms/cashier_service.py` | No changes needed |
| `backend/app/modules/dashboard/service.py` | Include refunds in outflows |
| Test files | New tests for each change |

## What Does NOT Change

- `Expense` model / enum — no new types
- `cashier_service.py` disbursement logic — stays as-is
- No duplicate data writes, no dual-track records
- The `Refund` table remains the single source of truth for refund transactions
