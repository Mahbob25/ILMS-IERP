# Session Handoff — v1.7 ERP Implementation

## Current Status

Phase 4 (Financial Engine) backend and frontend code is written but **not yet verified** — backend was restarted but new endpoints not yet tested end-to-end. Frontend build not yet run.

### ✅ Completed

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
- `GET /api/v1/auth/me` endpoint returns `{id, email, full_name, role, is_superadmin}`
- All routers updated: `admin` → `manager`/`secretary` in RoleChecker calls

**Phase 3 — Stateful Course Management**
- `academic/service.py`: added `activate_course()`, `complete_course()`, `get_course_enrollment_count()`
- `academic/schemas.py`: added `status`, `teacher_percentage`, `min_students_required` to Course schema; added `CourseActivate`; added `agreed_price`, `admin_discount` to Enrollment schema
- `academic/router.py`: added `POST /courses/{id}/activate`, `POST /courses/{id}/complete`; secretary can register students via enrollment
- Frontend `courses/page.tsx`: status badges, quota progress bar (enrolled/min_students_required), Activate button with teacher % input, Complete button, student registration modal, Refresh button
- Frontend sidebar: `admin` → `manager`/`secretary`; terms removed; new financial pages (payments, expenses, teacher-wallet, daily-closures, POS) added
- `academic/models.py`: `status` uses `SAEnum('coursestatus')` to match DB enum type
- `lms/models.py`: `expenses.type` and `daily_closures.status` use SAEnum to match DB enum types

**Phase 4 — Financial Engine (BACKEND written, NOT yet end-to-end verified)**
- `lms/schemas.py`: added `PaymentCreate`, `PaymentResponse`, `TeacherWalletResponse`
- `lms/financial_service.py`: `create_payment()` with revenue split logic, `list_payments()`, `get_payment()`, `get_next_receipt_number()`, `get_teacher_wallet()`, `get_student_payment_summary()`
  - Revenue split: Teacher_Share = amount × teacher_percentage / 100, credited to `teacher_wallets` immediately
  - Admin discount deducted from Institute_Share only
  - Receipt numbers format: `RCP-YYYYMMDD-NNNN` (sequential per day)
- `lms/router.py`: `POST /payments`, `GET /payments`, `GET /payments/{id}`, `GET /payments/summary/{student_id}/{course_id}`, `GET /teacher-wallets/{teacher_id}`
- `lms/router.py`: route order fixed (`/summary/` before `/{id}`) to avoid UUID parse conflict
- Frontend `payments/page.tsx`: list table, create form (student/course/amount/date), receipt preview modal with print, refresh button
- Backend imports verified (all modules load without errors)

### ❌ Phase 4 — Not Yet Done
- End-to-end verification: the backend was restarted but new `/payments` endpoints not called with real data
- Revenue split correctness: need to test $100 @ 40% → wallet gets $40; discount scenario
- Sequential receipt numbers: need to verify increment works
- Frontend `npm run build` — not run yet, zero type errors unconfirmed
- Student balance indicator not integrated into frontend (backend endpoint exists)
- Phase 4 e2e test not added to `test_v1_7_e2e.py`

### End-to-End Tests
- `backend/test_v1_7_e2e.py` — run with `--phase 1`, `--phase 2`, `--phase 3`, or `--phase all`
- 76/77 tests currently passing
- Phase 4 test not yet written

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

### New API Endpoints (Phase 4)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/lms/payments` | manager/secretary/superadmin | Create payment with revenue split |
| GET | `/api/v1/lms/payments` | all authenticated | List payments (filters: student_id, course_id, date_from, date_to) |
| GET | `/api/v1/lms/payments/summary/{student_id}/{course_id}` | all authenticated | Student balance: total_paid, agreed_price, balance_remaining |
| GET | `/api/v1/lms/payments/{payment_id}` | all authenticated | Single payment detail |
| GET | `/api/v1/lms/teacher-wallets/{teacher_id}` | all authenticated | Teacher wallet balance |

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
| **4** | Financial Engine — payments endpoint, revenue split, teacher wallets, print templates | BE + FE | **Code written, needs verification** |
| **5** | Expenses & Withdrawals — expenses CRUD, teacher withdrawal, secretary advances | BE + FE | Not started |
| **6** | Daily Closure — auditing state machine, lock enforcement, unlock requests, ledger view | BE + FE | Not started |
| **7** | Frontend — RefreshButton component, role-based sidebar, POS data pages | FE only | Not started |
| **8** | Role Data Cleanup — idempotent migration, remove `is_superadmin` from API responses | BE only | Not started |
| **9** | POS Interface — streamlined payment UI with quick-amounts, keyboard shortcuts | FE only | Not started |
| **10** | Integration Testing — comprehensive end-to-end test suite across all phases | BE + FE | Not started |

---

## Known Gotchas for Next Session

1. **httpx + Windows cookie bug**: `localhost` resolves to `localhost.local` in cookie jar. Always use `authed_client(token)` helper that passes Cookie header manually.
2. **Backend Start-Process**: Must use `Start-Process -NoNewWindow` (not `Start-Job`), because `Start-Job` dies when PowerShell session ends. Use Python `.venv\Scripts\python.exe`.
3. **Roles are data, not code**: The `Role` model is generic (just `id` + `name`). Role changes happen via data migrations, not model changes.
4. **DB enum types must match SQLAlchemy model**: Columns using PostgreSQL ENUMs (`coursestatus`, `expensetype`, `closurystatus`) must use `SAEnum('val1', 'val2', name='enum_name')` in SQLAlchemy models — plain `String` causes `DatatypeMismatchError`.
5. **test_phase3.py** references hardcoded UUIDs and uses `admin` role name. Needs updating before use.
6. **DB URL**: Backend config uses `database:5432` (Docker hostname). Local dev tools connect via `localhost:5440`. Python test uses `postgresql://lims:lims_secure_pass@localhost:5440/lims`.
7. **`is_superadmin` still used**: The `is_superadmin` boolean on `users` table is still present and bypasses RoleChecker. Phase 8 will clean this up.
8. **Course sections still exist**: `course_sections` table kept for backward compat with LMS (attendance, assignments). Phase 4+ may refactor.
9. **Terms routes removed**: All `/api/v1/academic/terms/*` endpoints are gone.
10. **Frontend v1.7 work started**: Courses page rewritten with status badges, quota, activation. Sidebar updated with new roles and financial page links.
11. **Phase 4 not yet verified**: Payment endpoints are coded but need end-to-end testing — run a quick smoke test (create course → section → student → enrollment → payment → check wallet) and verify `npm run build` passes.
12. **Killing port 8000**: Use `netstat -ano | Select-String ":8000"` to find PID, then use a non-reserved variable name (e.g. `$procId`, not `$pid`) to `Stop-Process -Id $procId -Force`.

(End of file - total 155 lines)
