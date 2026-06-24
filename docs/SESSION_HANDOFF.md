# Session Handoff — v1.7 ERP Implementation

## Current Status

We are implementing the v1.7 update (see `docs/Plan-v1.7.md`) — pausing AI ingestion (original Phases 4-6), building an ERP/Accounting system instead. Terms abolished, Courses become stateful, 4 financial tables added.

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

### End-to-End Tests
- `backend/test_v1_7_e2e.py` — run with `--phase 1`, `--phase 2`, `--phase 3`, or `--phase all`
- 76/77 tests currently passing (1 health-check failure during sequential phase run due to migration restart; each phase passes in isolation)
- Uses `psycopg` directly + `httpx` with manual Cookie header (httpx on Windows maps `localhost` → `localhost.local` in cookie jar, breaking auto-forwarding)

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

### Key Schema Changes
- `courses` has: `id`, `name`, `code`, `description`, `credits`, `status` (coursestatus enum), `teacher_percentage`, `min_students_required`
- `enrollments` has: `id`, `student_id`, `section_id`, `enrolled_at`, `agreed_price`, `admin_discount`
- `course_sections` has: `id`, `course_id`, `teacher_id`, `capacity`, `enrolled_count` (NO `term_id`)
- `payments`: `student_id`, `course_id`, `amount`, `date`, `receipt_number` (unique)
- `expenses`: `amount`, `description`, `recipient_name`, `date`, `receipt_number` (unique), `type` (expensetype enum)
- `teacher_wallets`: `teacher_id` (unique FK→users), `balance`, `last_updated`
- `daily_closures`: `date` (PK), `status` (closurystatus enum), `closed_by_manager_id`

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
# Start:
Start-Process -NoNewWindow -FilePath ".venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning"
# Test:
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health"
```

DB runs in Docker: `docker compose up -d database` (port 5440 mapped to host).

---

## How to Run Tests

```powershell
cd backend
python test_v1_7_e2e.py --phase 1    # Schema tests only
python test_v1_7_e2e.py --phase 2    # RBAC tests only
python test_v1_7_e2e.py --phase 3    # Course lifecycle tests only
python test_v1_7_e2e.py --phase all  # All phases (76 tests; run phases individually after migration to avoid restart)
```

---

## Remaining Phases (from `docs/Plan-v1.7-implementation.md`)

| Phase | Description | Scope |
|---|---|---|
| **4** | Financial Engine — payments endpoint, revenue split, teacher wallets, print templates | BE + FE |
| **5** | Expenses & Withdrawals — expenses CRUD, teacher withdrawal, secretary advances | BE + FE |
| **6** | Daily Closure — auditing state machine, lock enforcement, unlock requests, ledger view | BE + FE |
| **7** | Frontend — RefreshButton component, role-based sidebar, POS data pages | FE only |
| **8** | Role Data Cleanup — idempotent migration, remove `is_superadmin` from API responses | BE only |
| **9** | POS Interface — streamlined payment UI with quick-amounts, keyboard shortcuts | FE only |
| **10** | Integration Testing — comprehensive end-to-end test suite across all phases | BE + FE |

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
10. **Frontend v1.7 work started**: Courses page rewritten with status badges, quota, activation. Sidebar updated with new roles and financial page links (pages not yet built).
