# v1.7 ERP & Financial System — Implementation Plan

## Context

The v1.7 update (see `Plan-v1.7.md`) pivots from AI ingestion (Phases 4–6 of original build plan) to a full ERP/Accounting system. Key changes:
- Terms abolished; Courses become stateful (pending → active → completed)
- New financial tables: `payments`, `expenses`, `teacher_wallets`, `daily_closures`
- Four refined RBAC roles: SuperAdmin, Manager, Secretary, Teacher
- Financial engine with revenue split, expense logging, daily closure auditing
- Frontend: POS interface, print templates, auditing dashboard

Each phase must include:
- Backend test(s) for every new/modified endpoint
- Frontend `npm run build` — zero type errors
- End-to-end test verifying the phase works from API to DB to frontend
- A Refresh button on every data-heavy page

---

## Phase 1: Database Migration — v1.7 Schema

**Scope:** Backend only

### Tasks
1. Create Alembic migration `202606260000_v1_7_erp_schema.py`:
   - `courses` — drop `term_id` FK, add `status` (Enum: pending/active/completed), `teacher_percentage` (Float), `min_students_required` (Int)
   - `enrollments` — add `agreed_price` (Float), `admin_discount` (Float)
   - `payments` — `student_id`, `course_id`, `amount`, `date`, `receipt_number`
   - `expenses` — `amount`, `description`, `recipient_name`, `date`, `receipt_number`, `type` (Enum: general_expense/teacher_withdrawal/secretary_advance)
   - `teacher_wallets` — `teacher_id` (FK→users), `balance`, `last_updated`
   - `daily_closures` — `date` (PK), `status` (Enum: closed/pending/unlock_requested), `closed_by_manager_id` (FK→users)
2. Remove `terms` table reference everywhere (drop table in migration)
3. Drop unused `course_sections` table if terms were its sole parent (or refactor as needed)

### Verification
- [ ] `alembic upgrade head` — verify all 6 new tables exist with correct columns/constraints via DB client
- [ ] `alembic downgrade -1` — verify rollback works cleanly
- [ ] `courses` table no longer has `term_id` column

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 1` — runs migration, validates schema, rolls back, re-applies

---

## Phase 2: Backend Core — RBAC Refinement & Dependencies

**Scope:** Backend only

### Tasks
1. Update `identity/models.py` — seed 4 roles: `superadmin`, `manager`, `secretary`, `teacher`
2. Rename existing `admin` role to `manager` in seed data (idempotent)
3. Create role-specific dependency gates in `identity/dependencies.py`: `require_role("manager")`, `require_role("secretary")`, `require_role("teacher")`
4. Add `GET /api/v1/auth/me` endpoint — returns `{ id, username, role }` for frontend permission checks

### Verification
- [ ] Role seeding is idempotent (run twice, no duplicate errors)
- [ ] `GET /api/v1/auth/me` returns correct role for each user
- [ ] Role gates reject unauthorized roles with 403

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 2` — seeds roles, tests each gate, tests `/auth/me`, cleans up

---

## Phase 3: Course Management Redesign (Stateful Courses)

**Scope:** Backend + Frontend

### Backend Tasks
1. Rewrite `academic/service.py` — remove all `term_id` references
2. Course creation defaults to `status=pending`, requires `min_students_required`
3. `POST /api/v1/academic/courses/{id}/activate` — validates enrolled >= min_students_required, sets `teacher_percentage`, transitions to `active`
4. `POST /api/v1/academic/courses/{id}/complete` — transitions to `completed`
5. Registration endpoint for secretary to register "interested" students before activation

### Frontend Tasks
1. Rewrite `dashboard/courses/page.tsx`:
   - Remove term column
   - Add status badge (pending/active/completed) with appropriate colors
   - Add teacher percentage field (visible on activation)
   - Add quota progress: `enrolled_count` / `min_students_required`
2. Add "Activate Course" button (enabled only when quota met)
3. Add student registration modal on course detail page
4. **Refresh button** — add to courses page header (`components/RefreshButton.tsx`)

### Verification
- [ ] Backend: Create course → `status=pending`
- [ ] Backend: Enroll up to quota → activate → `status=active`
- [ ] Backend: Activate without quota → 400 rejection
- [ ] Backend: Complete active course → `status=completed`
- [ ] Frontend: `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 3` — full course lifecycle API test + frontend build check

---

## Phase 4: Financial Engine — Payments & Revenue Split

**Scope:** Backend + Frontend

### Backend Tasks
1. Create payment endpoints (in `lms/service.py` or new `lms/financial_service.py`):
   - `POST /api/v1/lms/payments` — creates payment, auto-generates `receipt_number`, executes revenue split
   - `GET /api/v1/lms/payments` — list with filters (student, course, date range)
   - `GET /api/v1/lms/payments/{id}` — single receipt detail
2. Revenue split logic (synchronous, in transaction):
   - `Teacher_Share = amount * course.teacher_percentage`
   - `Institute_Share = amount - Teacher_Share`
   - Special discount (`admin_discount`) deducted from Institute_Share only
   - Teacher share credited to `teacher_wallets` immediately
3. `GET /api/v1/lms/teacher-wallets/{teacher_id}` — balance inquiry

### Frontend Tasks
1. Build `dashboard/payments/page.tsx`:
   - Payments list table with receipt_number, student, course, amount, date
   - Create payment form (student select, course select, amount input)
   - Receipt preview before finalize
2. Payment receipt print template (A4/A5) — institute logo, receipt number, student info, amount, signature lines
3. Student balance indicator on enrollment/course detail (paid vs agreed_price)
4. **Refresh button** — add to payments page header

### Verification
- [ ] `POST /api/v1/lms/payments` with $100, teacher 40% → teacher_wallet gets $40, institute $60 recorded
- [ ] Payment with `admin_discount=10` on $100 course → teacher gets $40, institute gets $50
- [ ] Receipt numbers are sequential
- [ ] Frontend: `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 4` — create payment, verify revenue split, query wallet, verify receipt number increment

---

## Phase 5: Expenses, Withdrawals & Secretary Advances

**Scope:** Backend + Frontend

### Backend Tasks
1. `POST /api/v1/lms/expenses` — log expense with type (general_expense / teacher_withdrawal / secretary_advance)
2. `GET /api/v1/lms/expenses` — list with filters (type, date range, recipient)
3. `POST /api/v1/lms/teacher-wallets/withdraw` — creates expense of type `teacher_withdrawal`, deducts from wallet balance (reject if insufficient)
4. Secretary advance tracking — expense type `secretary_advance`, flagged for month-end payroll report

### Frontend Tasks
1. Build `dashboard/expenses/page.tsx`:
   - Expenses list with type badges, filter controls
   - Create expense form (amount, description, recipient, type selector)
2. Build `dashboard/teacher-wallet/page.tsx`:
   - Current balance display
   - Withdrawal request form (amount input, submit)
   - Transaction history list
3. Expense voucher print template (A4/A5) — institute logo, voucher number, amount, recipient, signature lines
4. **Refresh button** — add to expenses page AND teacher-wallet page headers

### Verification
- [ ] Create expense of each type → DB record correct
- [ ] Teacher withdrawal → wallet balance decreases by exact amount
- [ ] Withdraw more than balance → 400 rejection
- [ ] Frontend: `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 5` — create expenses (all types), withdraw from wallet, test insufficient balance rejection

---

## Phase 6: Daily Closure — Auditing State Machine

**Scope:** Backend + Frontend

### Backend Tasks
1. `POST /api/v1/lms/daily-closures/close` — Manager closes a date; sets `status=closed`
2. Middleware/lock enforcement: any `PUT`, `DELETE`, or retroactive `POST` on `payments` or `expenses` for a closed date → `409 Conflict`
3. `POST /api/v1/lms/daily-closures/{date}/unlock-request` — Secretary submits, status → `unlock_requested`
4. `POST /api/v1/lms/daily-closures/{date}/approve-unlock` — Manager approves, status → `pending` (temporarily lifts lock)
5. `GET /api/v1/lms/daily-closures` — list with date range filter
6. `GET /api/v1/lms/daily-closures/{date}/ledger` — aggregate: total payments in, total expenses out, net cash flow

### Frontend Tasks
1. Build `dashboard/daily-closures/page.tsx`:
   - Calendar or date-list view showing each day's status (closed/pending/unlock_requested)
   - Per-day ledger: total payments in, total expenses out, net
   - "Close Day" button with confirmation dialog (manager only)
   - Unlock request button (secretary), Approve/Reject buttons (manager)
2. **Refresh button** — add to daily closures page header

### Verification
- [ ] Close a date → attempt payment for that date → 409
- [ ] Approve unlock → payment for that date succeeds
- [ ] Daily ledger endpoint returns correct aggregates
- [ ] Frontend: `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 6` — close day, verify lock, unlock request, approve, verify mutation allowed, close again

---

## Phase 7: Frontend — Refined Dashboard, Navigation & RefreshButton

**Scope:** Frontend only

### Tasks
1. Create reusable `components/RefreshButton.tsx`:
   - Button with refresh icon (Lucide `RefreshCw`)
   - Calls `window.location.reload()` or optional `onRefresh` callback prop
   - 500ms debounce to prevent spam
   - Tooltip: "Refresh data"
2. Update dashboard sidebar (`(dashboard)/layout.tsx`) — role-based menu filtering:
   - SuperAdmin: everything
   - Manager: courses, students, enrollments, payments, expenses, daily-closures
   - Secretary: courses, students, enrollments, payments, expenses, POS
   - Teacher: courses, attendance, gradebook, teacher-wallet only
3. Integrate `RefreshButton` into all data pages: courses, students, enrollments, payments, expenses, attendance, gradebook, daily-closures, teacher-wallet, POS
4. Update student detail page — show payment history, enrollments with `agreed_price`

### Verification
- [ ] Login as Secretary → sidebar shows only secretary-relevant pages
- [ ] Login as Teacher → no financial pages visible
- [ ] Click Refresh on each page → data reloads correctly
- [ ] `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 7` — frontend build + visual role-menu verification (manual check)

---

## Phase 8: Role Seed Migration & Data Cleanup

**Scope:** Backend only

### Tasks
1. Create idempotent data migration:
   - Rename `admin` → `manager` in roles table
   - Add `secretary` role if missing
   - Assign existing users appropriate roles (default: `manager` for non-superadmin)
   - Remove `is_superadmin` from user endpoint responses (role-based now)
2. Clean up all `term_id` references in service layer queries
3. Remove `course_sections` table and any orphaned references

### Verification
- [ ] Run migration on existing data → all users have valid role
- [ ] Existing auth endpoints still work with new roles
- [ ] `GET /api/v1/users` no longer returns `is_superadmin`

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 8` — run migration against seeded data, verify auth backward compatibility

---

## Phase 9: Frontend POS Interface

**Scope:** Frontend only

### Tasks
1. Build `dashboard/pos/page.tsx`:
   - Student search input (autocomplete from `/api/v1/academic/students`)
   - Select enrolled course for that student
   - Amount input with quick-amount preset buttons (e.g. +50, +100, +200)
   - "Print Receipt" checkbox (default on)
   - Keyboard shortcuts: Enter to submit, Escape to clear
   - Success toast with receipt number after payment
2. Receipt live preview (before print)
3. Responsive layout — functional on tablet for counter-top use
4. **Refresh button** — add to POS page header

### Verification
- [ ] Complete POS flow: search student → select course → enter amount → confirm → receipt generated
- [ ] Payment reflects in student balance immediately
- [ ] Works on tablet viewport (768px width)
- [ ] `npm run build` — zero type errors

### End-to-End Test
- `python backend/test_v1_7_e2e.py --phase 9` — frontend build + manual POS flow verification

---

## Phase 10: Comprehensive Integration Tests & Sign-Off

**Scope:** Backend + Frontend

### Tasks
1. Write complete end-to-end test suite `backend/test_v1_7_full_e2e.py` covering all phases together:
   - `test_full_payment_flow` — create student → enroll in course → make payment → split revenue → close day → attempt retroactive edit → 409
   - `test_expense_flow` — log general expense → teacher withdrawal → verify wallet deduction
   - `test_course_lifecycle` — create pending → register students → activate → late register with discount → complete
   - `test_daily_closure_state_machine` — close → unlock request → approve → edit → close again
   - `test_role_isolation` — each role accesses only authorized endpoints
2. Run full test suite: `python backend/test_v1_7_full_e2e.py` — all pass
3. Frontend: `npm run build` — zero type errors, zero warnings
4. Backend health check: `GET /api/v1/health` → 200
5. Manual smoke test: login as Secretary, complete a full POS payment flow end-to-end in browser

### Verification
- [ ] All automated tests pass
- [ ] Frontend builds with zero errors
- [ ] Manual smoke test passes

### End-to-End Test
- The full test suite IS the end-to-end test for sign-off

---

## Refresh Button — Complete Map

| Page | Route | Refresh Button |
|---|---|---|
| Courses | `/dashboard/courses` | ✅ Phase 3 |
| Students | `/dashboard/students` | ✅ Phase 7 |
| Enrollments | `/dashboard/enrollments` | ✅ Phase 7 |
| Payments | `/dashboard/payments` | ✅ Phase 4 |
| Expenses | `/dashboard/expenses` | ✅ Phase 5 |
| Teacher Wallet | `/dashboard/teacher-wallet` | ✅ Phase 5 |
| Attendance | `/dashboard/attendance` | ✅ Phase 7 |
| Gradebook | `/dashboard/gradebook` | ✅ Phase 7 |
| Daily Closures | `/dashboard/daily-closures` | ✅ Phase 6 |
| POS | `/dashboard/pos` | ✅ Phase 9 |
