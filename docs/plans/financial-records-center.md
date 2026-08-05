# Financial Records Center — Centralized Receipts & Vouchers Archive

**Status:** Approved — ready to implement
**Date:** 2026-08-05
**Supersedes:** `docs/plans/documents-center.md` (renamed at kickoff to `financial-records`)
**Constraint (HARD):** Zero database migrations. Read-only projection over existing `payments`, `expenses`, and `refunds` tables. No new tables, no schema changes, no mutation endpoints.

---

## 1. Kickoff Decisions

Decided at implementation kickoff (2026-08-05):

1. **Naming: `financial-records`** — not `documents`, not `receipts-vouchers`.
   - Endpoint: `GET /api/v1/lms/financial-records`
   - Page: `dashboard/financial-records`
   - Rationale: the AI ingestion pipeline uses `/api/v1/curriculum/documents` + `dashboard/ingestion`, so `/lms/documents` would not collide in URL space either, but `financial-records` is unambiguous and future-proof. Verified by grep: no `documents` route exists in `backend/app` or `frontend/` code.
2. **Schema: extend `DocumentItem`** with optional modal-support fields (`student_code`, `course_name`, `payment_method`, `transaction_number`, `expense_type`, `notes`) so the existing `ReceiptModal` / `RefundReceipt` components render with real data. No new templates, no new PDF generation.

## 2. Problem

Today receipts/vouchers exist only where they were created:

- Payment receipts (`RCP-`) → `dashboard/payments`
- Expense vouchers (`VCH-`) → `dashboard/expenses`
- Refund vouchers (`RFD-`) → `dashboard/cashier/refunds`
- `dashboard/daily-closures/[date]` shows a per-day snapshot only

There is no way to answer: *"A student paid 3 months ago, I need a copy of that receipt"* — the user must guess which module and scroll/search there.

## 3. Decision

Adopt the **hybrid model** (best practice in large financial systems):

1. **Keep inline print at the transaction point** — POS, payments, expenses, refunds stay exactly as they are.
2. **Add one centralized, read-only "Financial Records" page** — global search + filter + reprint across all three document types.
3. **Complement, don't duplicate** — `daily-closures/[date]` remains the *daily audit snapshot*; Financial Records is the *all-time archive*.

## 4. Goals

- One place to find any receipt/voucher by number, student/recipient name, date range, or document type
- Reprint/preview reuses the **existing** preview endpoints and UI components (no template duplication)
- Zero new DB state — no migration, no reprint-tracking table (YAGNI until compliance demands it)

## 5. Non-Goals (explicitly out of scope)

- ❌ No new tables / columns / Alembic migrations
- ❌ No POST/PATCH/DELETE endpoints (read-only page)
- ❌ No reprint/audit log (`receipt_prints` table) — deferred unless accounting requires it
- ❌ No changes to `daily-closures`, `payments`, `expenses`, `refunds` modules
- ❌ No changes to existing number-generation logic (`RCP-`/`VCH-`/`RFD-`)

## 6. Backend Design

### 6.1 Endpoint

```
GET /api/v1/lms/financial-records
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

**Rate limit:** `@limiter.limit("60/minute")` — reuse the existing `limiter` middleware (read-only endpoint, but search queries are heavier than simple lookups).

### 6.2 Unified response shape

New Pydantic schemas added to `backend/app/modules/lms/schemas.py` (extend existing file, no ORM mapping — built from three row mappings):

```python
class FinancialRecordItem(BaseModel):
    doc_type: str                    # "receipt" | "voucher" | "refund"
    source_id: uuid.UUID             # id in the source table (payments/expenses/refunds)
    receipt_number: str              # RCP-/VCH-/RFD- number (display + search)
    date: date                       # Payment.date / Expense.date / date(Refund.disbursed_at)
    amount: float
    counterparty: str                # student full name | recipient_name | student full name
    created_by_name: str = ""        # joined from users table
    detail: str = ""                 # payment_method / expense type+description (short) / refund notes (short)
    preview_url: str                 # relative path to existing preview endpoint
    # --- modal-support extras (kickoff decision #2) ---
    student_code: Optional[str] = None     # needed by RefundReceipt
    course_name: Optional[str] = None
    payment_method: Optional[str] = None
    transaction_number: Optional[str] = None
    expense_type: Optional[str] = None
    notes: Optional[str] = None

class FinancialRecordListResponse(BaseModel):
    items: list[FinancialRecordItem]
    total: int                       # total matching rows (for pagination display)
```

### 6.3 Query strategy — follow the existing pattern

`closure_service.get_daily_ledger` (backend/app/modules/lms/closure_service.py:144) already demonstrates the exact joins and shape needed (Payment→Enrollment→Student, Expense→User, Refund→PendingRefund→Enrollment→Student). The new service mirrors it **without** the date-equality constraint:

1. Run **three independent SELECTs** (payments, expenses, refunds), each with the same filter set applied, each `.order_by(date DESC, receipt_number)` and `.limit(offset + limit)`
2. Run three `COUNT(*)` queries with the same filters → sum for `total`
3. Map each row to `FinancialRecordItem`
4. Merge + sort by `date` desc, then `receipt_number` (pure helper function, unit-testable)
5. Apply `offset`/`limit` in Python (dataset is small-to-medium per month; plan authorizes Python merge)

**Per-source queries:**

- **Payments:** join `Payment→Enrollment→Student` (+ `student_code`), `CourseSection→Course`; outerjoin `User→Employee` for `created_by_name`. Filters: `Payment.date`, `Payment.receipt_number ilike %search%`, `Student.full_name ilike %name%`.
- **Expenses:** outerjoin `User→Employee`; fields `type`, `description`, `recipient_name`. Filters: `Expense.date`, `Expense.receipt_number ilike %search%`, `Expense.recipient_name ilike %name%`.
- **Refunds:** join `Refund→PendingRefund→Enrollment→Student` + `Course`; outerjoin `User→Employee` for `disbursed_by_name`. Fields: `notes`, `student_code`. Filters: `func.date(Refund.disbursed_at)` (date range), `Refund.receipt_number ilike %search%`, `Student.full_name ilike %name%`.

**Timezone note:** refunds have `disbursed_at` (timestamptz); always filter/sort with `func.date(Refund.disbursed_at)` (exactly as closure_service.py:158) to avoid timezone drift.

**Why not a single UNION ALL?** Three parallel typed queries are far easier to read, test, and filter, and they mirror the proven `get_daily_ledger` structure. Performance is acceptable at this scale (all three tables are indexed on `date` and `receipt_number`).

### 6.4 New files

| File | Purpose |
|---|---|
| `backend/app/modules/lms/financial_records_service.py` | `search_financial_records(db, filters) -> FinancialRecordListResponse` + pure `merge_records` helper |
| `backend/app/modules/lms/schemas.py` | add `FinancialRecordItem`, `FinancialRecordListResponse` (extend existing file) |
| `backend/app/modules/lms/router.py` | one new GET route (add near `/payments`, router.py:205) |
| `backend/tests/integration/financial_records/test_financial_records_center.py` | endpoint tests (TestClient + monkeypatch pattern) |
| `backend/tests/unit/test_financial_records_service.py` | pure merge/sort/pagination + SQL-shape unit tests |
| `backend/pytest.ini` | add `tests/integration/financial_records` to `testpaths` |

**No changes** to `voucher_service.py`, `financial_service.py`, `closure_service.py`, `cashier_service.py`, or any model.

### 6.5 Reuse of preview endpoints (DRY)

| doc_type | Existing preview endpoint (already used by the UI) |
|---|---|
| receipt | `GET /api/v1/lms/payments/{payment_id}/preview` |
| voucher | `GET /api/v1/lms/expenses/{expense_id}/preview` |
| refund | `GET /api/v1/lms/cashier/refunds/{refund_id}/preview` |

`preview_url` is computed server-side so the frontend never hardcodes route patterns.

## 7. Frontend Design

### 7.1 Page

`frontend/app/[locale]/(dashboard)/dashboard/financial-records/page.tsx`

- Table columns: Type badge (Receipt/Voucher/Refund), receipt number, date, amount, counterparty, created by, actions (Preview/Print)
- Filters bar: document type select, date range, search box (debounced 300 ms — reuse the pattern from `dashboard/payments/page.tsx:173`), name search
- Pagination (offset/limit) + total count ("Showing X of Y")
- i18n: inline `ar`/`en` dict following the payments/expenses page convention (payments page keeps its labels inline)
- API calls: existing `apiClient` from `frontend/lib/api.ts` — no new client, no new fetch wrapper

### 7.2 Component reuse (DRY — the whole point)

- **Receipt/Voucher preview/print:** reuse `frontend/components/ReceiptModal.tsx` with the existing `data` shape (`type: "payment" | "expense"`, `id: source_id`); it already renders both receipt and voucher titles and calls the real preview endpoints for print/PDF. Copy the small `expenseTypeMeta` mapping from `dashboard/expenses/page.tsx`.
- **Refund preview:** reuse `frontend/components/cashier/RefundReceipt.tsx` (needs `student_code` + `notes` from the extended schema).
- **PDF download:** reuse `frontend/lib/generatePdfFromHtml.ts` (used by `ReceiptModal.tsx:158`).

**Do NOT** create new receipt/voucher templates, new PDF generation, or new print windows. Everything renders through the existing components.

### 7.3 Nav entry + route guard

`frontend/app/[locale]/(dashboard)/layout.tsx`:

- Add `dashboard/financial-records: "page_financial_records"` to `ROUTE_PERMISSION_MAP` (line 233 area)
- Add `page_financial_records: ["superadmin", "manager", "secretary"]` to `PAGE_PERMISSION_MAP` (line 195 area) — fallback-role path grants access **without** a DB permission row (zero-migration constraint); superadmin bypasses anyway
- Sidebar: new nav item near Payments/Expenses with a suitable lucide icon (`FolderOpen` or `FileStack`) + `menu.financialRecords` key in both `ar`/`en` `t` dicts

## 8. Testing Plan (TDD)

### 8.1 Backend unit tests (`tests/unit/test_financial_records_service.py`)

1. **Union correctness** — feed 1 payment + 1 expense + 1 refund row dicts into the merge helper → 3 items, one per type, correct amounts/numbers/`preview_url`s
2. **Merge sort order** — date desc, then receipt_number; limit/offset slicing; `total`
3. **Refund timezone** — build the refund query and assert the generated SQL contains `date(refunds.disbursed_at)` (no DB needed)

### 8.2 Backend integration tests (`tests/integration/financial_records/test_financial_records_center.py`)

Mirror the `test_reports_financial_endpoints.py` pattern (FastAPI TestClient + monkeypatched service + mock db):

1. **Endpoint shape** — manager GET → 200, `items` + `total` keys, documented fields only
2. **Filters** — `doc_type`, `search`, `name`, date-range pass-through to service call args
3. **Pagination** — `limit`/`offset` params accepted; `limit=201` → 422
4. **Role gates** — teacher → 403, anonymous → 401, secretary/manager → 200
5. **Read-only proof** — response payloads contain no mutation URLs; code review asserts no new Alembic revision exists (`git status` shows no `alembic/versions/*`)

### 8.3 Frontend E2E smoke (`frontend/tests/e2e/browser/features/financial-records.spec.ts`)

Patterned on `payments-ui.spec.ts`: page loads via sidebar link, title + table render, filters render, preview opens existing `ReceiptModal`/`RefundReceipt`.

## 9. Rollout Phases

Each phase ends with its gate (all green) before moving to the next. TDD: write the test first (RED), implement to pass (GREEN), refactor.

### Phase 1 — Backend: schemas + service + endpoint (gate: unit + integration tests green)

1. **Extend `backend/app/modules/lms/schemas.py`** — add `FinancialRecordItem` and `FinancialRecordListResponse` exactly as in §6.2.
2. **Write unit tests (RED)** — `backend/tests/unit/test_financial_records_service.py`:
   - merge helper: 1 payment + 1 expense + 1 refund → 3 items, one per type, correct amounts/numbers/`preview_url`s
   - merge sort order: date desc, then receipt_number; limit/offset slicing; `total`
   - refund query SQL shape: compiled SQL contains `date(refunds.disbursed_at)`
3. **Implement `backend/app/modules/lms/financial_records_service.py` (GREEN)** — `search_financial_records(db, *, doc_type, date_from, date_to, search, name, limit, offset)` per §6.3:
   - three typed SELECTs (payments/expenses/refunds) with `.order_by(date DESC, receipt_number)` and `.limit(offset + limit)`
   - three `COUNT(*)` queries → summed `total`
   - pure `merge_records` helper + Python slice for pagination
   - `preview_url` computed server-side per §6.5
4. **Add the route** in `backend/app/modules/lms/router.py` (near `list_payments`, ~line 205): `GET /financial-records` with `@limiter.limit("60/minute")`, `doc_type` regex validation, `limit` (1–200, default 50), `offset`, and `RoleChecker(allowed_roles=["superadmin","manager","secretary"])`.
5. **Write integration tests (RED→GREEN)** — `backend/tests/integration/financial_records/test_financial_records_center.py` (+ `__init__.py`), patterned on `test_reports_financial_endpoints.py`:
   - endpoint shape 200: `items` + `total`, documented fields only
   - filters pass-through (`doc_type`, `search`, `name`, date range)
   - pagination: `limit`/`offset` accepted, `limit=201` → 422
   - role gates: teacher → 403, anonymous → 401, secretary/manager → 200
6. **Register tests** — add `tests/integration/financial_records` to `testpaths` in `backend/pytest.ini`.
7. **Gate:** `python -m pytest tests/unit/test_financial_records_service.py tests/integration/financial_records -q` green; `ruff check app/modules/lms` clean; `git status` shows no `alembic/versions/*` file.

### Phase 2 — Frontend: page + filters + table (gate: manual QA in `ar` and `en`)

1. Create `frontend/app/[locale]/(dashboard)/dashboard/financial-records/page.tsx`:
   - inline `ar`/`en` translation dict (payments page convention)
   - filters bar: doc-type `<Select>` (all/receipt/voucher/refund), `date_from`/`date_to` inputs, debounced (300 ms) receipt-number search using `escapeLikeWildcards`, name search
   - table: type badge, receipt number, date, amount, counterparty, created by, Preview action
   - pagination: Prev/Next + "Showing X of Y", `limit` 50, driven by `offset`
   - fetch via existing `apiClient.get("/lms/financial-records", { params })`
2. **Gate:** manual QA in browser at `/ar/dashboard/financial-records` and `/en/dashboard/financial-records` (filters, table, pagination render correctly).

### Phase 3 — Frontend: preview/print through existing components (gate: Playwright smoke green)

1. Wire row Preview action to existing components:
   - receipt → `ReceiptModal` with `type: "payment"`, `id: source_id` (print/PDF reuse its built-in preview calls)
   - voucher → `ReceiptModal` with `type: "expense"` + `expense_type_label`/`expense_type_variant` (copy `expenseTypeMeta` mapping from `dashboard/expenses/page.tsx`)
   - refund → `RefundReceipt` with `studentCode` + `notes`
2. Write `frontend/tests/e2e/browser/features/financial-records.spec.ts` (patterned on `payments-ui.spec.ts`): navigate via sidebar, title + table render, filters render, preview opens the modal.
3. **Gate:** `npm run test:e2e:browser -- --project=chromium` (or manual verification if env unavailable).

### Phase 4 — Nav entry + route guard + translations (gate: lint + typecheck + full suite)

1. In `frontend/app/[locale]/(dashboard)/layout.tsx`:
   - add `dashboard/financial-records: "page_financial_records"` to `ROUTE_PERMISSION_MAP` (~line 233)
   - add `page_financial_records: ["superadmin", "manager", "secretary"]` to `PAGE_PERMISSION_MAP` (~line 195) — fallback roles, **no DB permission row** (zero-migration)
   - add sidebar nav item near Payments/Expenses with a lucide icon (`FolderOpen`) + `menu.financialRecords` key in both `ar`/`en` `t` dicts
2. **Gate:** `ruff check backend/app` + `npx tsc --noEmit` (frontend) + full backend pytest suite green; remove any `console.log` leftovers.

## 10. Open Questions (resolved)

1. **Reprint tracking** — does accounting need who-reprinted-what? **Answer: No** (would require a table = violates the zero-migration constraint; defer).
2. **Teacher access** — should teachers see this archive limited to their own students? **Answer: No** (keep the strictest gate; can be layered later without migrations).
3. **Bulk print** — print all vouchers for a date range in one PDF? **Answer: out of scope for v1.**
4. **Naming** — `documents` vs `receipts-vouchers` vs `financial-records` → **`financial-records`** (kickoff decision, see §1).

## 11. Risks

- **Performance on huge datasets** — Python-side merge is O(payments+expenses+refunds) per page. At tens of thousands of rows it stays fine; if it ever matters, switch to one SQL UNION ALL + window pagination (same endpoint contract, no migration).
- **Route-guard permission** — `page_financial_records` has no DB row by design (zero-migration). Access relies on `PAGE_PERMISSION_MAP` fallback roles. If a DB permission row is added later, it slots in cleanly without frontend changes.
