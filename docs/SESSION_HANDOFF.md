# Session Handoff — v1.7 ERP Implementation

## Current Status

**Phases 1–10: All backend + frontend code fully written, including e2e tests.**
- Per-phase tests: `backend/test_v1_7_e2e.py` (run with `--phase 1|2|3|4|5|6|7|8|9|all`)
- Cross-phase integration: `backend/test_v1_7_full_e2e.py`
- Phase 10 awaiting user execution (tests + frontend build)

### ✅ Completed (Code Written)

**Phase 1 — Database Schema Migration**
- Migration `202606260000` creates: `payments`, `expenses`, `teacher_wallets`, `daily_closures`
- Drops `terms` table, removes `term_id` from `course_sections`
- Adds to `courses`: `status` (enum), `teacher_percentage`, `min_students_required`
- Adds to `enrollments`: `agreed_price`, `admin_discount`
- Removes `Term` model from code; all service/router/schema layers cleaned up
- Downgrade/upgrade cycle verified

**Phase 2 — RBAC Refinement**
- Migration `202606260001`: renames `admin` → `manager`, adds `secretary` role
- `identity/dependencies.py`: added `require_role()`, `require_manager`, `require_secretary`, `require_teacher`
- `GET /api/v1/auth/me` endpoint returns `{id, email, full_name, role}` (Phase 8 removed `is_superadmin`)
- All routers updated: `admin` → `manager`/`secretary` in RoleChecker calls

**Phase 3 — Stateful Course Management**
- `academic/service.py`: added `activate_course()`, `complete_course()`, `get_course_enrollment_count()`
- `academic/schemas.py`: added `status`, `teacher_percentage`, `min_students_required` to Course schema; added `CourseActivate`; added `agreed_price`, `admin_discount` to Enrollment schema
- `academic/router.py`: added `POST /courses/{id}/activate`, `POST /courses/{id}/complete`; secretary can register students via enrollment
- Frontend `courses/page.tsx`: status badges, quota progress bar, Activate/Complete buttons, student registration modal, Refresh button
- Frontend sidebar: `admin` → `manager`/`secretary`; terms removed; financial pages added
- `academic/models.py`: `status` uses `SAEnum('coursestatus')`; `lms/models.py` uses SAEnum for expense/closure types

**Phase 4 — Financial Engine (Payments & Revenue Split)**
- `lms/schemas.py`: `PaymentCreate`, `PaymentResponse`, `TeacherWalletResponse`
- `lms/financial_service.py`: `create_payment()` with revenue split, `list_payments()`, `get_payment()`, `get_next_receipt_number()`, `get_teacher_wallet()`, `get_student_payment_summary()`
- Revenue split: Teacher_Share = amount × teacher_percentage / 100; admin_discount from Institute_Share only
- Receipt numbers: `RCP-YYYYMMDD-NNNN`
- `lms/router.py`: all endpoints for payments + teacher-wallets
- Frontend `payments/page.tsx`: list, create form, receipt preview modal, print, refresh
- e2e test `run_phase4()`: revenue split, receipts, summary, filters, role gates (572 lines)

**Phase 5 — Expenses, Withdrawals & Secretary Advances**
- `lms/schemas.py`: `ExpenseCreate`, `ExpenseResponse`, `WithdrawRequest`, `WithdrawResponse`
- `lms/financial_service.py`: `create_expense()`, `list_expenses()`, `get_expense()`, `teacher_withdraw()`, `get_next_voucher_number()`
- `lms/router.py`: `POST/GET /expenses`, `GET /expenses/{id}`, `POST /teacher-wallets/withdraw`
- Frontend `expenses/page.tsx`: list, filter by type, create form, voucher preview modal, print, refresh
- Frontend `teacher-wallet/page.tsx`: balance display, withdraw form, history table, refresh
- e2e test `run_phase5()`: all expense types, withdrawal, insufficient balance, role gates

**Phase 6 — Daily Closure (Auditing State Machine)**
- `lms/schemas.py`: `DailyClosureResponse`, `DailyLedgerResponse`
- `lms/financial_service.py`: `close_day()`, `request_unlock()`, `approve_unlock()`, `list_closures()`, `get_daily_ledger()`, `is_date_closed()`
- `lms/router.py`: all closure + ledger endpoints with lock enforcement on close date
- Frontend `daily-closures/page.tsx`: list with date filter, status badges, close/unlock/approve actions, ledger modal, refresh
- e2e test `run_phase6()`: close, double-close (409), lock enforcement, unlock request/approve, re-close, ledger, list, role gates

**Phase 7 — Frontend Refinements (DONE)**
- Sidebar role-based filtering: ✅ layout.tsx filters menu items by `user.role?.name`
- Reusable `RefreshButton` component: ✅ `components/RefreshButton.tsx` — debounced (500ms), spinning animation, tooltip
- RefreshButton integrated into all data pages: ✅ courses, students, enrollments, sections, attendance, gradebook, payments, expenses, teacher-wallet, daily-closures
- Student detail page with payment history + agreed_price + balance: ✅ `students/[id]/page.tsx`
- Orphaned `terms/page.tsx` removed
- Stale `"admin"` role references fixed → `"manager"`/`"secretary"` in students, sections, enrollments pages
- e2e test `run_phase7()` in `backend/test_v1_7_e2e.py`: ✅ component file check, page availability, dead route cleanup, student detail, role API, build artifact check

**Phase 8 — Role Data Cleanup (DONE)**
- Removed `is_superadmin` from `UserResponse` schema and `/auth/me` endpoint
- Updated `RoleChecker`, `superadmin_gate`, `require_role` to check `role.name == "superadmin"` instead of `user.is_superadmin`
- Updated teacher-scoping checks in academic and lms routers (removed `not current_user.is_superadmin` guards — now redundant since only one role per user)
- Removed `is_superadmin` assignment from `create_user`; hierarchy check uses role name
- Kept `is_superadmin` in JWT claims for frontend middleware compatibility
- Kept DB column — not dropped
- e2e test updated: asserts `/auth/me` has no `is_superadmin` key
**Phase 9 — POS Interface (DONE)**
- Added `student_id` query param to `GET /academic/enrollments` (service + router) for POS student course lookup
- Built `dashboard/pos/page.tsx` with:
  - Student autocomplete search (filters by name/code from `/api/v1/academic/students`)
  - Enrolled course selection (fetched via `?student_id=X` filter)
  - Quick-amount preset buttons (+50, +100, +200, +500)
  - Print Receipt checkbox (default on)
  - Keyboard shortcuts: Enter to submit, Escape to clear
  - Success toast with receipt number, Receipt preview modal
  - RefreshButton in header
  - Role-gated (superadmin/manager/secretary only)
  - Tablet-responsive layout
- Sidebar POS link already existed (ShoppingCart icon) — no change needed
- e2e test `run_phase9()`: page file checks, enrollment student_id filter, full payment flow
**Phase 10 — Integration Testing (CODE COMPLETE — waiting for execution)**
- Created `backend/test_v1_7_full_e2e.py` with 5 cross-phase integration tests:
  1. `test_full_payment_flow` — enroll, pay, revenue split (40% teacher), close day, block retroactive edit (409)
  2. `test_expense_flow` — general expense, secretary advance, teacher withdrawal, wallet deduction
  3. `test_course_lifecycle` — pending → activate with quota → late register with discount → complete → double-complete (400)
  4. `test_daily_closure_state_machine` — close → double-close (409) → unlock request → approve unlock → re-close → ledger → list
  5. `test_role_isolation` — access matrix: each role tested against 6 endpoints (create user, course-section, delete, list users, expense, student)
- Health check at start (backend must be running)
- Results summary with failed_tests list
- All tests need backend running + migration `202606260002` applied for seeded users
- Waiting for user to run: `python test_v1_7_full_e2e.py` + `npm run build` (frontend)

---

## Database State

### Current Alembic Head: `202606260001`

### Roles (`roles` table)
| id | name |
|---|---|
| `c12c75a4-...` | superadmin |
| `88dcf628-...` | manager |
| `d4e9f7b2-...` | secretary |
| `b9ef8ccb-...` | teacher |

### Tables (18 total)
`assignments`, `attendance_records`, `attendance_sessions`, `audit_logs`, `course_sections`, `courses`, `daily_closures`, `enrollments`, `expenses`, `grades`, `payments`, `refresh_tokens`, `roles`, `students`, `submissions`, `teacher_wallets`, `users`, `alembic_version`

### New API Endpoints (Phases 4–6)
| Method | Path | Auth | Phase |
|---|---|---|---|
| POST | `/api/v1/lms/payments` | manager/secretary/superadmin | 4 |
| GET | `/api/v1/lms/payments` | all authenticated | 4 |
| GET | `/api/v1/lms/payments/summary/{student_id}/{course_id}` | all authenticated | 4 |
| GET | `/api/v1/lms/payments/{payment_id}` | all authenticated | 4 |
| GET | `/api/v1/lms/teacher-wallets/{teacher_id}` | all authenticated | 4 |
| POST | `/api/v1/lms/expenses` | manager/secretary/superadmin | 5 |
| GET | `/api/v1/lms/expenses` | manager/secretary/superadmin | 5 |
| GET | `/api/v1/lms/expenses/{expense_id}` | manager/secretary/superadmin | 5 |
| POST | `/api/v1/lms/teacher-wallets/withdraw` | manager/secretary/superadmin | 5 |
| POST | `/api/v1/lms/daily-closures/{date}/close` | manager/superadmin | 6 |
| POST | `/api/v1/lms/daily-closures/{date}/unlock-request` | manager/secretary/superadmin | 6 |
| POST | `/api/v1/lms/daily-closures/{date}/approve-unlock` | manager/superadmin | 6 |
| GET | `/api/v1/lms/daily-closures` | manager/secretary/superadmin | 6 |
| GET | `/api/v1/lms/daily-closures/{date}/ledger` | manager/secretary/superadmin | 6 |

---

## Architecture Rules (from `docs/memory.md`)

1. **4 containers only**: caddy, frontend, backend, database — no Redis/Celery/RabbitMQ
2. **Caddy is sole gate**: only ports 80/443 exposed; internal Docker network `lims-internal`
3. **pgvector in PostgreSQL**: no external vector DB; HNSW index on VECTOR(1536)
4. **BackgroundTasks over Celery**: all async work via FastAPI BackgroundTasks
5. **HttpOnly Secure Cookies**: tokens NEVER in localStorage; rotation on refresh
6. **SSE over WebSockets/RabbitMQ**: in-process `asyncio.Queue` per user
7. **pg_dump backups**: encrypted with GPG, offsite via rclone, every 2h
8. **Offline resilience**: core SIS/LMS must work without internet

---

## How to Start Backend

```powershell
cd backend
# Kill existing:
Get-Process -Name python | Where-Object { $_.CommandLine -match "uvicorn" } | Stop-Process -Force
# Start:
Start-Process -NoNewWindow -FilePath ".venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning"
# Test:
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health"
```

DB runs in Docker: `docker compose up -d database` (port 5440 mapped to host).

---

## How to Test Phase 4 (Quick Smoke Test)

```powershell
cd backend
# Login as superadmin, create payment, check wallet:
& ".\.venv\Scripts\python.exe" -c "
import httpx, json
base = 'http://localhost:8000'
c = httpx.Client(base_url=base)
r = c.post('/api/v1/auth/login', json={'email':'superadmin@institute.dev','password':'admin123'})
token = [h.split(';')[0].split('=',1)[1] for h in r.headers.get_list('set-cookie') if h.startswith('access_token=')][0]
ac = httpx.Client(base_url=base, headers={'Cookie': f'access_token={token}'})
# Create a course, section, student, enrollment, then payment
print('Logged in, token:', token[:20])
"
```

---

## Remaining Phases (from `docs/Plan-v1.7-implementation.md`)

| Phase | Description | Scope | Status |
|---|---|---|---|
| **4** | Financial Engine — payments, revenue split, teacher wallets, print templates | BE + FE | ✅ Code complete + e2e test |
| **5** | Expenses & Withdrawals — expenses CRUD, teacher withdrawal, secretary advances | BE + FE | ✅ Code complete + e2e test |
| **6** | Daily Closure — auditing state machine, lock enforcement, unlock requests, ledger | BE + FE | ✅ Code complete + e2e test |
| **7** | Frontend — RefreshButton component, role-based sidebar (done), student detail page | FE only | ✅ Complete |
| **8** | Role Data Cleanup — remove `is_superadmin` from API responses and checks | BE only | ✅ Complete |
| **9** | POS Interface — streamlined payment UI with quick-amounts, keyboard shortcuts | FE + BE | ✅ Complete |
| **10** | Integration Testing — comprehensive e2e test suite across all phases (also: Frontend build verification) | BE + FE | 🔶 Code complete, awaiting execution |

---

## Session Rules (CRITICAL — Never break)

1. **NEVER run or restart the backend or frontend yourself.** They are already running externally in separate terminals (Docker + Caddy also running). If you need a restart, **stop and ask the user** to do it.
2. **NEVER run `npm run build`, `npm run dev`, or `uvicorn` directly.** Ask the user.
3. **NEVER run Docker or docker-compose commands.** Docker is already running.
4. **If you need to write e2e tests or verify something against live services, write the code only. Ask the user to execute.**

## Known Gotchas

1. **httpx + Windows cookie bug**: `localhost` resolves to `localhost.local` in cookie jar. Always use `authed_client(token)` helper that passes Cookie header manually.
2. **Backend Start-Process**: Must use `Start-Process -NoNewWindow` (not `Start-Job`), because `Start-Job` dies when PowerShell session ends. Use Python `.venv\Scripts\python.exe`.
3. **Roles are data, not code**: The `Role` model is generic (just `id` + `name`). Role changes happen via data migrations, not model changes.
4. **DB enum types must match SQLAlchemy model**: Columns using PostgreSQL ENUMs (`coursestatus`, `expensetype`, `closurystatus`) must use `SAEnum('val1', 'val2', name='enum_name')` in SQLAlchemy models — plain `String` causes `DatatypeMismatchError`.
5. **test_phase3.py** references hardcoded UUIDs and uses `admin` role name. Needs updating before use.
6. **DB URL**: Backend config uses `database:5432` (Docker hostname). Local dev tools connect via `localhost:5440`. Python test uses `postgresql://lims:lims_secure_pass@localhost:5440/lims`.
7. **`is_superadmin` in DB + JWT only**: The column remains in the `users` table, and JWT claims still include it for frontend middleware compatibility. All API responses and authorization checks now use `role.name == "superadmin"`.
8. **Seeded users (migration 202606260002)**: | Email | Password | Role | |---|---|---| | `manager@institute.dev` | `manager123` | manager | | `secretary@institute.dev` | `secretary123` | secretary | | `teacher@institute.dev` | `teacher123` | teacher |
9. **Course sections still exist**: `course_sections` table kept for backward compat with LMS (attendance, assignments).
10. **Terms routes removed**: All `/api/v1/academic/terms/*` endpoints are gone.
11. **Frontend builds not verified**: No `npm run build` has been run for v1.7 frontend changes — zero type errors unconfirmed. This is the Phase 10 sign-off task.
12. **Killing port 8000**: Use `netstat -ano | Select-String ":8000"` to find PID, then use a non-reserved variable name (e.g. `$procId`, not `$pid`) to `Stop-Process -Id $procId -Force`.

(End of file - total 155 lines)
