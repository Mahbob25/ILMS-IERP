# Documents Center — Centralized Receipts & Vouchers Archive

**Status:** Proposed
**Date:** 2026-08-05
**Constraint (HARD):** Zero database migrations. Read-only projection over existing `payments`, `expenses`, and `refunds` tables. No new tables, no schema changes, no mutation endpoints.

---

## 1. Problem

Today receipts/vouchers exist only where they were created:

- Payment receipts (`RCP-`) → `dashboard/payments`
- Expense vouchers (`VCH-`) → `dashboard/expenses`
- Refund vouchers (`RFD-`) → `dashboard/cashier/refunds`
- `dashboard/daily-closures/[date]` shows a per-day snapshot only

There is no way to answer: *"A student paid 3 months ago, I need a copy of that receipt"* — the user must guess which module and scroll/search there.

## 2. Decision

Adopt the **hybrid model** (best practice in large financial systems):

1. **Keep inline print at the transaction point** — POS, payments, expenses, refunds stay exactly as they are. Contextual printing is what cashiers expect.
2. **Add one centralized, read-only "Documents Center" page** — global search + filter + reprint across all three document types.
3. **Complement, don't duplicate** — `daily-closures/[date]` remains the *daily audit snapshot*; Documents Center is the *all-time archive*.

## 3. Goals

- One place to find any receipt/voucher by number, student/recipient name, date range, or document type
- Reprint/preview reuses the **existing** preview endpoints and UI components (no template duplication)
- Zero new DB state — no migration, no reprint-tracking table (YAGNI until compliance demands it)

## 4. Non-Goals (explicitly out of scope)

- ❌ No new tables / columns / Alembic migrations
- ❌ No POST/PATCH/DELETE endpoints (read-only page)
- ❌ No reprint/audit log (`receipt_prints` table) — deferred unless accounting requires it
- ❌ No changes to `daily-closures`, `payments`, `expenses`, `refunds` modules
- ❌ No changes to existing number-generation logic (`RCP-`/`VCH-`/`RFD-`)

## 5. Backend Design

### 5.1 Endpoint

```
GET /api/v1/lms/documents
```

Query parameters (all optional):

| Param | Type | Purpose |
|---|---|---|
| `doc_type` | `receipt \| voucher \| refund` | Filter by document kind (default: all) |
| `date_from` / `date_to` | `date` | Filter by document date |
| `search` | `str` | Case-insensitive partial match on receipt_number (e.g. `RCP-2026`, `0002`) |
| `name` | `str` | Partial match on counterparty (student name for receipts, recipient_name for vouchers, student name for refunds) |
| `limit` | `int` (default 50, max 200) | Page size |
| `offset` | `int` (default 0) | Cursor for pagination |

**Role gate:** `superadmin`, `manager`, `secretary` — matching the strictest existing gate (`expenses` list excludes teachers). Teachers keep access to their own payments via the existing `/payments` endpoint; the aggregate archive is cashier/management-facing.

**Rate limit:** reuse the existing `limiter` middleware (`60/minute`) — it's a read-only endpoint but search queries are heavier than simple lookups.

### 5.2 Unified response shape

New Pydantic schemas in `backend/app/modules/lms/schemas.py` (no ORM mapping needed — built from three row mappings):

```python
class DocumentItem(BaseModel):
    doc_type: str          # "receipt" | "voucher" | "refund"
    source_id: uuid.UUID   # id in the source table (payments/expenses/refunds)
    receipt_number: str    # RCP-/VCH-/RFD- number (display + search)
    date: date             # Payment.date / Expense.date / date(Refund.disbursed_at)
    amount: float
    counterparty: str      # student full name | recipient_name | student full name
    created_by_name: str   # joined from users table
    detail: str            # payment_method / expense type+description / refund notes (short)
    preview_url: str       # relative path to existing preview endpoint

class DocumentListResponse(BaseModel):
    items: list[DocumentItem]
    total: int             # total matching rows (for pagination display)
```

### 5.3 Query strategy — follow the existing pattern

`closure_service.get_daily_ledger` (backend/app/modules/lms/closure_service.py:144) already demonstrates the exact joins and shape needed (Payment→Enrollment→Student, Expense→User, Refund→PendingRefund→Enrollment→Student). The new service mirrors it **without** the date-equality constraint:

1. Run **three independent SELECTs** (payments, expenses, refunds), each with the same filter set applied
2. Map each row to `DocumentItem`
3. Merge + sort by `date` desc, then `receipt_number`
4. Apply `limit`/`offset` **in Python** (or push pagination into each query and merge — but dataset is small-to-medium per month; Python merge with an early `ORDER BY ... LIMIT offset+limit` per source is fine)
5. Compute `total` by summing `COUNT(*)` of the three filtered queries

**Why not a single UNION ALL with correlated subqueries?** Three parallel typed queries are far easier to read, test, and filter than a 3-way UNION with differing columns, and they mirror the proven `get_daily_ledger` structure. Performance is acceptable at this scale (all three tables are indexed on `date` and `receipt_number`).

**Timezone note:** refunds have `disbursed_at` (timestamptz); always filter with `func.date(Refund.disbursed_at)` (exactly as closure_service does at line 158) to avoid timezone drift — this keeps behavior consistent with daily closures.

### 5.4 New files

| File | Purpose |
|---|---|
| `backend/app/modules/lms/documents_service.py` | `search_documents(db, filters) -> DocumentListResponse` |
| `backend/app/modules/lms/documents_schemas.py` (or extend `schemas.py`) | `DocumentItem`, `DocumentListResponse` |
| `backend/app/modules/lms/router.py` | one new GET route (add near `/payments`) |

**No changes** to `voucher_service.py`, `financial_service.py`, `closure_service.py`, or any model.

### 5.5 Reuse of preview endpoints (DRY)

| doc_type | Existing preview endpoint (already used by the UI) |
|---|---|
| receipt | `GET /api/v1/lms/payments/{payment_id}/preview` |
| voucher | `GET /api/v1/lms/expenses/{expense_id}/preview` |
| refund | `GET /api/v1/lms/cashier/refunds/{refund_id}/preview` |

`preview_url` is computed server-side so the frontend never hardcodes route patterns.

## 6. Frontend Design

### 6.1 Page

`frontend/app/[locale]/(dashboard)/dashboard/documents/page.tsx`

- Table columns: Type badge (Receipt/Voucher/Refund), receipt number, date, amount, counterparty, created by, actions (Preview/Print)
- Filters bar: document type select, date range, search box (debounced 300ms — reuse the pattern from `dashboard/payments/page.tsx:170`), name search
- Pagination (offset/limit) + total count
- i18n: add `documents` key group to the translation file used by sibling pages (check `sectionsTranslations.ts` pattern; payments page keeps its labels inline — follow the payments page convention)
- Sidebar entry: new `dashboard/documents` link near Payments/Expenses in the existing nav structure

### 6.2 Component reuse (DRY — the whole point)

- **Receipt/Voucher preview/print:** reuse `frontend/components/ReceiptModal.tsx` with the existing `data` shape (it already renders both receipt and voucher titles — see lines 61-62)
- **Refund preview:** reuse `frontend/components/cashier/RefundReceipt.tsx` (already used by `cashier/refunds/page.tsx`)
- **PDF download:** reuse `frontend/lib/generatePdfFromHtml.ts` (used by `ReceiptModal.tsx:158`)
- **API calls:** use the existing `apiClient` from `frontend/lib/api.ts` — no new client, no new fetch wrapper

**Do NOT** create new receipt/voucher templates, new PDF generation, or new print windows. Everything renders through the existing components.

## 7. Testing Plan (TDD)

`backend/tests/integration/section_lifecycle/` already has the fixtures/mocks pattern; add `backend/tests/integration/documents/test_documents_center.py`:

1. **Union correctness** — seed 1 payment + 1 expense + 1 refund → endpoint returns 3 items, one per type, correct amounts/numbers
2. **Filters** — `doc_type=receipt` returns only receipts; `search=RCP-` narrows; `name` matches student vs recipient; date range includes `disbursed_at`-based refunds
3. **Pagination** — `limit`/`offset` + `total` consistency
4. **Role gates** — teacher → 403, anonymous → 401, secretary/manager → 200
5. **Read-only proof** — response payloads contain no mutation endpoints; assert no new tables exist (query `information_schema.tables` diff or rely on code review — no Alembic revision generated)
6. **Refund timezone** — refund disbursed at `23:30 UTC` on day X appears under the correct local date (mirrors existing closure tests)

Frontend: Playwright smoke spec `frontend/tests/e2e/browser/features/documents-ui.spec.ts` — page loads, filters render, preview opens existing `ReceiptModal`.

## 8. Rollout Phases

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | `documents_service` + schema + endpoint | Integration tests green (list above) |
| 2 | Frontend page + filters + table | Manual QA in `ar` and `en` |
| 3 | Preview/print wired through existing components | Playwright smoke spec green |
| 4 | Nav entry + translations | Lint (`ruff`, `npx tsc --noEmit`), full test suite |

## 9. Open Questions

1. **Reprint tracking** — does accounting need who-reprinted-what? Currently NO (would require a table = violates the zero-migration constraint; defer).
**Developer Answer**: No neeed for Reprint tracking for now.

2. **Teacher access** — should teachers see this archive limited to their own students? Default NO (keep the strictest gate); can be layered later without migrations.
**Developer Answer**: No.

3. **Bulk print** — print all vouchers for a date range in one PDF? Nice-to-have; out of scope for v1 of this page.

## 10. Risks

- **Performance on huge datasets** — Python-side merge is O(payments+expenses+refunds) per page. At tens of thousands of rows it stays fine; if it ever matters, switch to one SQL UNION ALL + window pagination (same endpoint contract, no migration).
- **Naming collision** — `documents` may be confused with the AI ingestion pipeline's document uploads (docs/plans/current.md "Next"). If so, rename page to `receipts-vouchers`. Decide at implementation kickoff.
