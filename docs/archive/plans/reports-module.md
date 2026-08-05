# Reports Module — Implementation Plan

**Status:** Implemented (all phases shipped) · archived 2026-08-06
**Target:** v1.8
**Prereq:** None (read-only feature, no schema changes to existing tables)

## Problem / Current State

There is **no centralized Reports feature**. Reporting data is scattered:

| Need | Where it lives today | Gap |
|---|---|---|
| Revenue / expenses / refunds | `GET /api/v1/lms/revenue` (`lms/financial_service.py:get_revenue_overview`) + revenue page | Isolated analytics, no export, no print |
| Daily reconciliation | `GET /api/v1/academic/sections/daily-reconciliation` (`reconciliation_service.py`) | Backend-only, not surfaced in UI as a report |
| Daily closures / ledger | `GET /api/v1/lms/daily-closures`, `/ledger` (`closure_service.py`) | Backed by an ops page, not reportable |
| Students / enrollments | Aggregations only inside `dashboard/service.py` | No detail/exportable views |
| Attendance / gradebook | Per-feature pages | No aggregate summaries |
| Teacher wallets / payroll | `teacher-wallet`, `staff-payroll` pages | No consolidated period report |

The user-facing symptom: a manager cannot produce "last month P&L", "attendance coverage",
or "teacher payout summary" as a single print/export artifact. Each number must be
assembled by hand from a different screen.

## Standing Invariants

1. **Single source of truth — no duplicate query logic.** The reports module *reuses* existing
   services (`financial_service`, `closure_service`, `reconciliation_service`,
   `staff_payroll_service`) or reuses the same ORM models with aggregation queries. It must
   never fork its own copy of a query that already exists. Where the existing endpoint
   already returns the exact shape needed, the report endpoint **delegates** to it.
2. **Read-only.** Reports never write to the DB. No `INSERT`/`UPDATE`/`DELETE`. No new tables.
3. **Contra-revenue rule stays.** Refunds remain `Refund` rows, never folded into `Expense`
   (see `archive/plans/refund-expense-tracking.md`).
4. **Report data respects daily-closure locks.** Any report that would claim financial
   integrity must surface `DailyClosure.status` for its date range so managers can see
   unclosed days rather than treating partial data as final.
5. **Access is permission-gated, not just hidden.** Every report endpoint and every page
   route is guarded by the `RoleChecker`/`page_reports` permission, matching the existing
   route-guard pattern.

## Scope — Report Catalog

### A. Financial

| Report | Inputs | Source (reuse or query) |
|---|---|---|
| A1. P&L Summary (revenue − expenses − refunds) | date range | `financial_service.get_revenue_overview` (already returns totals + trend + by-course/by-teacher) |
| A2. Daily Ledger | single date | `closure_service.get_daily_ledger` |
| A3. Closures Register | date range | `closure_service.list_closures` |
| A4. Daily Reconciliation | single date | `reconciliation_service.generate_daily_reconciliation_report` |

### B. Operational

| Report | Inputs | Source |
|---|---|---|
| B1. Student Register (active, unenrolled, by status) | optional filters | `Student` + `Enrollment` aggregation over `Student`/`Enrollment` models |
| B2. Enrollment Summary (new enrollments per period, by course/section) | date range | `Enrollment` aggregation |
| B3. Section Occupancy (enrolled vs capacity) | none | `CourseSection.enrolled_count` / `capacity` |
| B4. Attendance Summary (sessions, records, coverage % per section) | date range, teacher | `AttendanceSession` / `AttendanceRecord` aggregation |

### C. Teacher / HR

| Report | Inputs | Source |
|---|---|---|
| C1. Teacher Wallet Balances | none | `TeacherWallet` + `LedgerEntry` aggregation |
| C2. Teacher Payout Summary (withdrawals per period) | date range | `Expense` where `type == "teacher_withdrawal"` + `staff_payroll_service` |
| C3. Staff Payroll Register | month | `staff_payroll_service` |
| C4. Grade Summary (grade distribution by section) | section or date range | `Grade`/`Submission` aggregation |

## Performance & Scale Considerations

> **Note:** High-volume reports like B4 (Attendance Summary) or B1 (Student Register)
> could return large payloads over wide date ranges. Consider enforcing maximum date
> ranges (e.g., maximum 1 year per request) or utilizing chunked DB iteration for CSV
> streaming if datasets grow large.

## Backend Changes

### 1. New module `backend/app/modules/reports/`

```
reports/
  __init__.py        # empty
  schemas.py         # response models per report
  service.py         # aggregation functions (small, one function per report)
  router.py          # reports_router = APIRouter(prefix="/reports", tags=["reports"])
```

Follow the `dashboard/` module layout exactly. Keep each service function < 50 lines;
where a report needs the detail rows its source already computes, delegate to the
existing service and only reshape.

### 2. Router registration (`backend/app/main.py`)

Add alongside the existing routers (line ~88):

```python
from app.modules.reports.router import reports_router

app.include_router(reports_router, prefix="/api/v1")
```

### 3. Endpoints (all `GET`)

| Endpoint | Role gate | Delegates to |
|---|---|---|
| `GET /reports/financial/pnl?start_date=&end_date=` | superadmin, manager | `financial_service.get_revenue_overview` |
| `GET /reports/financial/ledger/{date}` | superadmin, manager, accountant | `closure_service.get_daily_ledger` |
| `GET /reports/financial/closures?date_from=&date_to=` | superadmin, manager | `closure_service.list_closures` |
| `GET /reports/financial/reconciliation/{date}` | superadmin, manager | `reconciliation_service.generate_daily_reconciliation_report` |
| `GET /reports/students` | superadmin, manager, secretary | new aggregation |
| `GET /reports/enrollments?start_date=&end_date=` | superadmin, manager, secretary | new aggregation |
| `GET /reports/sections/occupancy` | superadmin, manager, secretary | new aggregation |
| `GET /reports/attendance?start_date=&end_date=&teacher_id=` | superadmin, manager, secretary | new aggregation |
| `GET /reports/teachers/wallets` | superadmin, manager | new aggregation |
| `GET /reports/teachers/payouts?start_date=&end_date=` | superadmin, manager | new aggregation |
| `GET /reports/payroll?month=` | superadmin, manager, secretary | `staff_payroll_service` |
| `GET /reports/grades?section_id=` | superadmin, manager, teacher | new aggregation |

Role gates use `RoleChecker(allowed_roles=[...])` exactly as in `dashboard/router.py`.
No new user types, no new tables, no migrations for existing data.

### 4. Export endpoints

- **CSV** — `GET /reports/{report_path}/export.csv?<same params>` returning
  `StreamingResponse` with `text/csv; charset=utf-8` and BOM, built from the same
  service function as the JSON endpoint (single source of truth invariant). Add one
  `to_csv_rows()` helper per report.
- **PDF/print** — no new backend dependency. Follow the existing voucher pattern
  (`lms/router.py:get_payment_voucher_html`, templates in `cert&recept/`):
  `GET /reports/{report_path}/print` → `HTMLResponse` of a styled, print-ready HTML
  document. PDF generation happens client-side via the already-installed
  `html2pdf.js`/`jspdf` (see Frontend). Keeps the backend dependency-free and matches
  how receipts/vouchers already work.

### 5. Permission seeding migration (`backend/alembic/versions/<new>_reports_permission.py`)

Mirror `202606300100_user_employee_separation.py` lines 215-284:

- Insert `page_reports` permission: `('page_reports', 'Reports', 'Financial')`
- Add to `manager_perms`, `secretary_perms`, `superadmin` as appropriate. Teachers get
  **no** `page_reports` — the teacher-visible reports (C4 grades for their own section)
  are granted per-route via `RoleChecker` but the page itself stays hidden from the
  sidebar for teachers, matching how `page_gradebook` works today.

Frontend route-level permission (`ROUTE_PERMISSION_MAP`) assumes three levels are
sufficient; per-report access is enforced server-side regardless.

## Frontend Changes

### 1. Route + permission wiring (`frontend/app/[locale]/(dashboard)/layout.tsx`)

- Add `page_reports: ["superadmin", "manager", "secretary"]` to `PAGE_PERMISSION_MAP`.
- Add `"dashboard/reports": "page_reports"` to `ROUTE_PERMISSION_MAP` (line ~204). This
  is mandatory — it is the guard that blocks direct URL access.
- Add one `navigationItems` entry (icon `FileBarChart2` or `ClipboardList`, label from
  `t.menu.reports`, permission `page_reports`).
- Add `reports:` key to both `ar` and `en` translation blocks (`t.menu`).

### 2. Page scaffold `frontend/app/[locale]/(dashboard)/dashboard/reports/page.tsx`

A single page, modelled on `dashboard/revenue/page.tsx`:

- **Report picker** (tabs or cards grouped A/B/C), date-range/period picker
  (reuse the `7d / 30d / 90d / year / custom` pattern already in revenue page).
- Renders the selected report via `apiClient.get<...>("/reports/...", { params })`.
- **Summary cards + chart/lists** per report type (recharts already in deps).
- **Print / Export buttons**:
  - Print → navigation to the `/print` HTML endpoint in a new tab, then trigger
    `window.print()`. Applies print CSS so tables/charts are legible.
  - PDF → `html2pdf.js` wrapper capturing the report DOM (same approach the app already
    uses for certificates/receipts).
  - CSV → client-side `window.location`/`fetch` download of the `.export.csv` URL.
- Bilingual (`ar`/`en`, RTL) exactly like the revenue page; `sanitizeInput` on all
  user-entered dates.

### 3. Shared component (optional but preferred)

Extract a small `components/reports/ReportShell.tsx` holding the period filter,
export toolbar, and loading skeleton so each report view is a thin payload component
(`components/reports/views/PnlView.tsx`, `AttendanceView.tsx`, etc.). Keeps the page
file small (repo guidance: files ≤ 800 lines).

## Role Matrix

| Report path | superadmin | manager | secretary | teacher | accountant |
|---|---|---|---|---|---|
| financial/* | ✓ | ✓ | – | – | ledger only |
| students, enrollments, sections, attendance | ✓ | ✓ | ✓ | – | – |
| teachers/wallets, teachers/payouts | ✓ | ✓ | – | – | – |
| payroll | ✓ | ✓ | ✓ | – | – |
| grades | ✓ | ✓ | own section | own section | – |

Enforced twice: UI visibility via `page_reports` + per-route `RoleChecker` on each
endpoint (defense in depth — the backend check is authoritative).

## Testing

### Backend (pytest, in `backend/tests/`)
- **Unit** — each `service.py` aggregation function: happy path, empty range, boundary
  dates, and closed-vs-open daily-closure surface. ≥ 80% coverage on the new module.
- **Integration** — every `GET /reports/*` endpoint: 200 shape, 401 unauthenticated,
  403 for disallowed roles, CSV content-type + BOM, print endpoint returns HTML.
- **Permission** — seed migration adds `page_reports` and grants it to expected roles
  only; verify `role_permissions` counts parity.

### Frontend (Playwright, `frontend/tests/`)
- Reports page renders each category tab; manager can open financial reports.
- Route guard: secretary is blocked from `teachers/wallets` view, teacher cannot open
  the page at all.
- Export smoke test: CSV downloads non-empty; print URL opens.
- Bilingual pass on `ar` (RTL) and `en`.

## Phases

1. **Phase 1 — Skeleton + permissions**: `reports` module scaffold, `page_reports`
   migration, layout wiring, empty page with picker and export toolbar.
2. **Phase 2 — Financial (A)**: 4 endpoints delegating to existing services + schemas +
   3 views + tests.
3. **Phase 3 — Operational (B)**: new aggregations + views + tests.
4. **Phase 4 — Teacher/HR (C)**: wallets, payouts, payroll, grades + views + tests.
5. **Phase 5 — Export & E2E**: CSV/print/PDF wiring, Playwright spec, coverage gate,
   polish. Archive this plan to `docs/archive/plans/reports-module.md` and update
   `docs/plans/current.md`.

## Success Gates

- All report endpoints return data for sparse and empty datasets without erroring.
- Financial reports show `DailyClosure` status (unclosed = partial-data caveat).
- Every endpoint is read-only (runtime audit: no writes in service functions).
- 80% coverage on `reports` module; full suite green (currently 221 backend tests).
- `page_reports` gating verified in Playwright for manager/secretary/teacher.
- CSV, print, and PDF export all work from the page for at least one report per category.