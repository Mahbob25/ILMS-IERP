# Phase 6: Frontend

**Owner:** Frontend Agent  
**Estimate:** 5.75 days  
**Dependencies:** Phase 1 (API contract `api-contract.json` only — can work with mock data)  
**Parallel-safe:** Yes — all UI work. No backend code changes. Works against the published API contract and can use mock API responses until backends are ready.

## Scope

All UI changes for the section lifecycle features: manager section management, cashier refund dashboard, student pending refund display, and bilingual support.

---

## Tasks

### 6.1 Manager — Section List Page Changes

**Replace delete button:**
- Remove delete button from standard manager view
- Add **Cancel Section** button for `pending` and `active` sections
- Add **Deactivate** button for `active` sections only
- Keep delete button for superadmin only

**New status badges and filters:**
- `ready_for_completion` — Yellow badge, distinct icon
- `cancelled` — Red badge with "X" icon
- `overdue` (from flags.overdue) — Red banner/pill
- Filter sidebar includes new statuses
- Count badge showing `ready_for_completion` and `overdue` totals

### 6.2 Manager — Section Detail Page Changes

**Warning banners:**
- Red banner when section is past end_date (overdue)
- Yellow banner when section is approaching end_date (within warning window)
- Show missing grades count in banner
- Show outstanding payment totals in banner

**Ready for Completion state:**
- Prominent green "Complete Section" button
- Show grade completeness summary (N/M students graded)
- Show payment status summary

**Overdue state:**
- Show "days past end date" counter
- Ungraded students list with names
- Unpaid students list with amounts

### 6.3 Manager — Cancel Section Multi-Step Modal

**Step 1 — Impact Preview:**
- Load data from `GET /academic/course-sections/{id}/cancel-preview`
- Show: teacher name, reversal amount, enrolled count, payments collected
- Warnings: attendance records exist, final grades exist

**Step 2 — Refund Decision:**
- Radio buttons: "Authorize refunds" / "No refund"
- Show impact of each choice
- If "Authorize refunds", show estimated total refund amount

**Step 3 — Reason & Confirm:**
- Required reason textarea
- Summary of all actions
- Confirm / Cancel buttons
- On confirm → `POST /academic/course-sections/{id}/cancel`

### 6.4 Manager — Deactivate Modal

- Validation summary: section name, contract status, payment status
- If payments exist: required reason textarea
- Confirm / Cancel buttons
- On confirm → `POST /academic/course-sections/{id}/deactivate`

### 6.5 Manager — Completion Override Modal

When `force=true` is needed (grades missing or payments outstanding):
- Show what's being bypassed (list of ungraded/unpaid)
- Required reason textarea
- "Complete Anyway" / Cancel buttons
- On confirm → `POST /academic/course-sections/{id}/complete` with `force=true` + `reason`

### 6.6 Cashier — Pending Refunds Dashboard

**Main table view:**
- Columns: Student name, student code, amount, cancellation date, section name, action
- Search/filter by student name or code
- Status badge: UNCLAIMED (blue), CLAIMED (green), FORFEITED (grey)
- "Disburse" button for UNCLAIMED rows only
- Data from `GET /lms/cashier/pending-refunds`

### 6.7 Cashier — Disburse Confirmation Modal

- Student info: name, code, photo
- Amount to disburse
- Cancellation reference and date
- Optional notes textarea
- Confirm "Disburse [amount] to [student name]" / Cancel
- On confirm → `POST /lms/cashier/pending-refunds/{id}/disburse`

### 6.8 Cashier — Receipt Display

After successful disbursement:
- Printable receipt view
- Receipt number (RFD-YYYYMMDD-NNNN)
- Student info, amount, date, cashier name
- Print button → window.print()
- Close button → return to dashboard

### 6.9 Cashier — Disbursement History

- Table of disbursements for current cashier shift
- Columns: Receipt number, student, amount, date/time, notes
- Data from `GET /lms/cashier/refunds`

### 6.10 Student Profile — Pending Refund Flag

- Prominent badge/flag on student profile if they have UNCLAIMED PendingRefund
- Text: "This student has an unclaimed refund of [amount] from cancelled section [section_name]"
- Expandable section showing full details
- Data from `GET /lms/students/{id}/pending-refunds`

### 6.11 Bilingual Support (ar/en)

- All new UI strings added to i18n translation files
- RTL layout adjustments for Arabic where needed
- Currency formatting respects locale
- Date formatting respects locale

---

## UI Component Architecture

Follow existing project patterns. Expected new components:

```
components/
├── sections/
│   ├── SectionStatusBadge.tsx        — renders all statuses with colors
│   ├── SectionWarningBanner.tsx      — overdue / approaching banners
│   ├── CancelSectionModal.tsx         — 3-step wizard
│   ├── DeactivateSectionModal.tsx     — single-step confirm
│   ├── CompleteSectionModal.tsx       — override reason input
│   └── OverdueSummaryWidget.tsx       — dashboard widget
├── cashier/
│   ├── PendingRefundsTable.tsx       — searchable refund queue
│   ├── DisburseRefundModal.tsx        — confirm disbursement
│   ├── RefundReceipt.tsx              — printable receipt
│   └── DisbursementHistory.tsx        — shift history table
└── students/
    └── PendingRefundBadge.tsx         — profile flag
```

---

## API Contract Dependency

This phase depends on `api-contract.json` (produced by Phase 1) for:

1. **Endpoint paths and methods** — already defined in contract
2. **Request/response shapes** — use TypeScript interfaces matching contract
3. **Error response format** — consistent error handling

**Development strategy:** Implement against mock data initially using the contract shapes. Replace with real API calls when backend endpoints are ready.

```typescript
// Example: mock data while backend is in development
async function fetchOverdueSummary(): Promise<OverdueSummary> {
  if (process.env.USE_MOCK === 'true') {
    return mockOverdueSummary  // from a mocks/ directory
  }
  return api.get('/academic/sections/overdue-summary')
}
```

---

## Files Touched

| Area | Files |
|------|-------|
| Section list/detail | Section list page, detail page components |
| Modals | New modal components listed above |
| Cashier pages | New cashier dashboard, history pages |
| Student profile | Profile page update |
| i18n | Translation files (ar, en) |

All files under `apps/erp/frontend/` or equivalent UI directory. No backend files touched.

## Independent Boundary

This phase does NOT:
- Create or modify any backend API endpoints
- Modify database schema or models
- Touch any Python backend files

## Verification

- [ ] All new statuses display correctly (ready_for_completion, cancelled, overdue)
- [ ] Cancel modal: 3-step flow works, impact preview loads, refund decision saves
- [ ] Deactivate modal: shows validation, requires reason if payments exist
- [ ] Override modal: shows bypassed items, requires reason
- [ ] Cashier dashboard: refund queue loads, search works
- [ ] Disburse flow: confirmation → receipt display → print
- [ ] Student profile: pending refund flag visible
- [ ] All UI strings available in both Arabic and English
- [ ] RTL layout correct for Arabic
- [ ] All API calls match `api-contract.json` shapes
