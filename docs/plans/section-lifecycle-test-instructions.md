# Section Lifecycle — Manual UI Test Instructions

**Author:** Technical Team
**Date:** 2026-07-11
**Purpose:** Step-by-step manual test procedures to verify all section lifecycle features work correctly through the UI.

---

## Prerequisites

| Item | Detail |
|------|--------|
| Browser | Chrome/Firefox latest |
| Login | superadmin or manager credentials |
| Language | Tests can be done in Arabic or English |
| Base URL | `http://localhost:3000/{locale}/dashboard` |
| Data | Ensure test courses, students, and teachers exist in the system |

---

## Test 1: Status Badges & Filtering on Sections List Page

**Location:** `/sections`

### Steps

1. Navigate to the Sections list page
2. Verify each section row shows a **colored status badge**:
   - `pending` → Amber badge
   - `active` → Green badge
   - `ready_for_completion` → Yellow badge with alert triangle icon
   - `completed` → Grey badge
   - `cancelled` → Red badge with ban icon
3. Verify sections with `flags.overdue === true` show an **(Overdue)** label next to the badge
4. Use the **status filter dropdown** next to the search bar — filter by each status and verify only matching sections appear
5. Use the **search box** — type a course name and verify results filter in real-time

### Expected

- [ ] All 5 status badges render with correct colors and icons
- [ ] Overdue label appears on overdue sections
- [ ] Status filter works correctly
- [ ] Search works correctly

---

## Test 2: Section Detail Page — Warning Banners

**Location:** `/sections/{sectionId}`

### Steps

1. Click the **eye icon** on any section row to open the section detail page
2. Verify the page shows students table, financial summary, and section info card

#### 2A — Overdue Banner (past end date)

1. Find or create a section with `end_date` in the past (before today) and status `active`
2. Open its detail page
3. Verify a **red banner** appears at the top with:
   - AlertTriangle icon
   - Message: "X days past end date"
   - Count of ungraded students (if any)
   - Count of unpaid students and total outstanding amount (if any)

#### 2B — Approaching End Banner (within 7 days)

1. Find or create a section with `end_date` within the next 7 days
2. Open its detail page
3. Verify a **yellow/amber banner** appears with:
   - Clock icon
   - Message about approaching end date
   - Grade and payment status info

#### 2C — Ready for Completion Banner

1. After startup checks run (see Test 7), a section past its end date with all grades entered will show `ready_for_completion` status
2. Open its detail page
3. Verify a **green/yellow banner** with checkmark icon indicates the section is ready for completion

### Expected

- [ ] Overdue banner (red) shows for past-end-date sections
- [ ] Approaching banner (amber) shows for sections ending within 7 days
- [ ] Ready banner (green/yellow) shows for ready_for_completion sections
- [ ] No banner shown for cancelled or completed sections

---

## Test 3: Complete Section — Normal Flow

**Location:** Section detail page OR Sections list page action buttons

### Steps

1. Find a section with status `active` (or `ready_for_completion`) that has:
   - All enrolled students with final scores entered (gradebook complete)
   - All students fully paid (no outstanding balances)
2. Click the **Complete** button (green checkmark icon) — either on the list page or detail page
3. If the API returns grades/payment errors, the **CompleteSectionModal** will appear asking for override reason (see Test 4)
4. If successful, verify:
   - Section status changes to `completed`
   - Status badge updates on list page
   - Detail page shows `completed` status
   - Certificate auto-generated (check Certificates page)

### Expected

- [ ] Section completes successfully with all grades and payments ok
- [ ] Status changes to `completed`
- [ ] Certificates are generated for enrolled students

---

## Test 4: Complete Section — Force Override Flow (Missing Grades / Unpaid)

### Steps

1. Find or prepare a section with:
   - At least one student **without** a final grade (NULL score)
   - OR at least one student with an outstanding balance
2. Click the **Complete** button
3. Verify the API returns an error describing what's missing (ungraded students list / unpaid amounts)
4. The **CompleteSectionModal** (override) will appear showing:
   - List of ungraded students (if any)
   - List of unpaid students with amounts (if any)
   - A warning: "The following checks will be bypassed"
5. **Enter an override reason** (required)
6. Click **"Complete Anyway"** (green button)
7. Verify:
   - Section status changes to `completed`
   - The override is logged in `section_completion_overrides` table

### Expected

- [ ] Normal completion blocked when grades missing or payments outstanding
- [ ] Override modal shows correct bypass items
- [ ] Reason is required — cannot proceed without it
- [ ] Force completion succeeds with override
- [ ] Override audit record created

---

## Test 5: Activate Section

**Location:** Section detail page OR Sections list page

### Steps

1. Find a section with status `pending` and contract status `assigned`
2. Ensure it has: price, teacher assigned, start date, class time filled in
3. Click the **Activate** button (play icon / green button)
4. Verify:
   - Section status changes to `active`
   - Contract status changes to `active`
   - Teacher wallet shows activation credit entry

### Expected

- [ ] Section activates successfully
- [ ] Status changes from `pending` to `active`
- [ ] Contract becomes active

---

## Test 6: Cancel Section — Multi-Step Modal

**Location:** Section detail page (Cancel button) or list page (XCircle icon)

### Steps

#### Step 1 — Impact Preview

1. Find a section with status `pending` or `active`
2. Click the **Cancel Section** button
3. A 3-step modal appears, starting at **Step 1: Impact Preview**
4. Verify preview data loads:
   - Teacher reversal amount
   - Enrolled students count
   - Payments collected total
   - Warnings (if attendance, grades, or certificates exist)
5. Click **"Next"**

#### Step 2 — Refund Decision

1. Two radio options shown:
   - **Authorize Refunds** — Creates PendingRefund records for students
   - **No Refund** — No refund liability created
2. Select one option
3. Click **"Next"**

#### Step 3 — Reason & Confirm

1. A **reason textarea** is shown (required)
2. Summary of actions displayed
3. Enter a cancellation reason
4. Click **"Confirm Cancellation"**

#### Verification

- [ ] Section status changes to `cancelled`
- [ ] Section shows `cancelled` badge (red with ban icon) on list
- [ ] Detail page shows cancelled status and no warning banners
- [ ] Teacher wallet entries reversed
- [ ] If "Authorize Refunds" was selected, PendingRefund records created

### Edge Cases

- [ ] Attempt to cancel an already cancelled section — should show error
- [ ] Attempt to cancel a completed section — should show error
- [ ] Cannot proceed without a reason in Step 3

---

## Test 7: Deactivate Section

**Location:** Section detail page (Deactivate button — superadmin only) or list page (Ban icon)

### Steps

1. Find a section with status `active`
2. Click the **Deactivate** button
3. A confirmation modal appears showing:
   - Section name
   - Payment status (whether any payments exist)
4. If payments exist, enter a **reason** (required when payments exist)
5. Click **"Confirm Deactivation"**
6. Verify:
   - Section status returns to `pending`
   - Activation credit reversed from teacher wallet
   - Contract status returns to `assigned`

### Edge Cases

- [ ] If teacher has withdrawn funds, deactivation should be **blocked** (prevents negative wallet)
- [ ] Superadmin-only action — manager/secretary should not see the button
- [ ] Cannot deactivate if payments exist without providing a reason

---

## Test 8: Cashier — Pending Refunds Dashboard

**Location:** `/cashier/refunds`

**Requires a cancelled section with authorized refunds first (see Test 6).**

### Steps

1. Login as a user with **cashier** role
2. Navigate to the **Refunds** page
3. Verify the **Pending Refunds Table** shows:
   - Student name and code
   - Amount
   - Cancellation date
   - Section name
4. Use the **search** field to filter by student name or code
5. Verify pagination works if many refunds exist

### Expected

- [ ] Pending refunds table loads with correct data
- [ ] Only UNCLAIMED status refunds shown
- [ ] Search/filter works
- [ ] Pagination works

---

## Test 9: Cashier — Disburse Refund & Receipt

**Location:** `/cashier/refunds`

### Steps

1. From the Pending Refunds table, click **"Disburse"** on any row
2. The **DisburseRefundModal** appears showing:
   - Student name
   - Amount to disburse
   - Optional notes field
3. Click **Confirm Disburse**
4. Verify:
   - **Refund receipt modal** appears with:
     - Receipt number (format: `RFD-YYYYMMDD-NNNN`)
     - Student name and code
     - Amount disbursed
     - Date
     - Cashier name
   - PendingRefund status changes to `CLAIMED`
   - Section disappears from pending refunds table
5. Click close on receipt — verify receipt disappears

### Disbursement History

- Scroll down to the **Disbursement History** section
- Verify the newly disbursed refund appears in the list with receipt number, amount, and date

### Edge Cases

- [ ] Attempt to disburse the same refund twice — should fail (idempotency)
- [ ] Daily closure check — disbursement blocked on closed days

---

## Test 10: Student Profile — Pending Refund Badge

**Location:** `/students/{studentId}`

**Requires a section cancellation with authorized refunds that include this student.**

### Steps

1. Navigate to a student who has an UNCLAIMED pending refund
2. Verify a **PendingRefundBadge** appears near the top of the page:
   - Amber/dollar-sign icon
   - Text: "Unclaimed Refund — This student has an unclaimed refund of X from cancelled section Y"
3. Click the badge to **expand** it
4. Verify expanded view shows:
   - Section name
   - Amount
   - Cancellation date
   - Expiry date (if set)
5. Verify the badge **disappears** if the student has no pending refunds (or after cashier disburses)
6. Verify badge does **not** appear for students with no pending refunds

### Expected

- [ ] Badge shows only for students with UNCLAIMED refunds
- [ ] Badge is expandable with correct details
- [ ] Badge disappears after refund is disbursed

---

## Test 11: Overdue Summary on Dashboard

**Location:** Dashboard (superadmin/manager) — note: the OverdueSummaryWidget is available for integration.

Currently the dashboard shows per-role dashboards. The OverdueSummaryWidget component exists at `components/sections/OverdueSummaryWidget.tsx` and can be integrated into the dashboard page. Verify the API endpoint works directly:

1. Call `GET /academic/sections/overdue-summary` (via browser dev tools)
2. Verify response structure:
   - `ready_for_completion` — sections past end date with all grades entered
   - `overdue_sections` — sections past end date with missing grades or payments
   - `upcoming_deadlines` — sections approaching end date (within warning window)

### Expected

- [ ] API returns correct categorized sections
- [ ] Empty arrays returned when no sections match

---

## Test 12: Startup Daily Checks (Backend-Only Verification)

**Note:** This runs automatically on server boot. To verify manually:

1. Set a test section's `end_date` to yesterday and status to `active`
2. Restart the backend server
3. The `run_daily_section_checks()` function runs during the FastAPI lifespan event
4. Verify the section's status changed:
   - If all grades are entered → `ready_for_completion`
   - If grades missing → `flags.overdue = true`, `flags.ungraded_count = N`
5. The check is idempotent — restarting again the same day should NOT re-run (check `daily_jobs_log`)

### Expected

- [ ] Overdue sections detected on server boot
- [ ] Fully graded sections → `ready_for_completion`
- [ ] Ungraded sections → `flags.overdue = true`
- [ ] Second restart same day does nothing (idempotent)

---

## Test 13: Permissions & Role-Based UI

### Verify by logging in as different roles

| Role | Can see? |
|------|----------|
| **superadmin** | All buttons: Cancel, Deactivate, Complete, Activate, Delete |
| **manager** | Cancel, Complete, Activate — but NOT Deactivate or Delete |
| **secretary** | Activate, Complete — but NOT Cancel, Deactivate, or Delete |
| **teacher** | View only — no action buttons |
| **cashier** | Only Refunds page — no section management |

### Steps

1. Login as **manager** — verify Cancel Section button is visible, Deactivate button is NOT visible
2. Login as **secretary** — verify Activate and Complete are visible, Cancel and Deactivate are NOT visible
3. Login as **cashier** — verify only the Cashier Refunds page is accessible
4. Login as **teacher** — verify sections page is read-only, no action buttons

### Expected

- [ ] Role-based UI correctly hides/shows buttons
- [ ] Cashier sees only refunds, no section management
- [ ] Teacher sees read-only view

---

## Test 14: Bilingual (Arabic/English)

Each feature should be tested in both languages.

### Steps

1. Switch locale to **Arabic** (`/ar/dashboard/sections`)
2. Repeat key tests (Cancel flow, Complete override, Deactivate) — verify all labels, buttons, errors, and banners display in Arabic
3. Switch to **English** (`/en/dashboard/sections`)
4. Verify everything displays correctly in English

### Expected

- [ ] All UI strings properly localized in Arabic
- [ ] All UI strings properly localized in English
- [ ] RTL layout works correctly in Arabic mode
- [ ] No untranslated strings or layout breaks

---

## Test 15: Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Cancel a section with **certificates** issued | Should **block** cancellation — certificates cannot be auto-revoked |
| 2 | Deactivate a section where teacher has **withdrawn funds** | Should **block** — wallet would go negative |
| 3 | Complete a section on a **closed financial day** | Should **block** — daily closure lock |
| 4 | Cancel a section that is already **cancelled** | Should show error |
| 5 | Complete a section that is already **completed** | Should show error |
| 6 | Delete a section with **existing enrollments/payments** | Should **block** (soft-delete not allowed for financial data) |
| 7 | Force-complete with **both** ungraded and unpaid students | Both lists shown in override modal, both bypassed on force |
| 8 | Disburse refund on a **closed day** | Should **block** — cashier must request day unlock |
| 9 | Duplicate disbursement for same PendingRefund | Should **fail** — idempotency guard |
| 10 | Server restart mid-day | `daily_jobs_log` prevents duplicate checks |

---

## Test Summary Template

```
TEST SUMMARY: Section Lifecycle
================================

Test 1  (Status Badges & Filtering):       [PASS/FAIL]
Test 2  (Warning Banners):                  [PASS/FAIL]
Test 3  (Complete Section — Normal):        [PASS/FAIL]
Test 4  (Complete Section — Force Override): [PASS/FAIL]
Test 5  (Activate Section):                 [PASS/FAIL]
Test 6  (Cancel Section):                   [PASS/FAIL]
Test 7  (Deactivate Section):               [PASS/FAIL]
Test 8  (Cashier Pending Refunds):          [PASS/FAIL]
Test 9  (Cashier Disburse & Receipt):       [PASS/FAIL]
Test 10 (Student Pending Refund Badge):     [PASS/FAIL]
Test 11 (Overdue Summary):                  [PASS/FAIL]
Test 12 (Startup Checks):                   [PASS/FAIL]
Test 13 (Permissions):                      [PASS/FAIL]
Test 14 (Bilingual):                        [PASS/FAIL]
Test 15 (Edge Cases):                       [PASS/FAIL]

OVERALL: [READY / ISSUES FOUND]

Issues:
1. ...
2. ...
```
