# LIMS Architecture Overview

**Learning Institution Management System** — Lean MVP v1.7

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 14.2.3 |
| Frontend UI | React 18 + Tailwind CSS | 18.3.1 / 3.4.4 |
| Backend | FastAPI (async) | 0.111.0 |
| ORM | SQLAlchemy 2.0 (async) | 2.0.30 |
| Database | PostgreSQL 16 + pgvector | 16 |
| Auth | JWT access/refresh — HttpOnly cookies | PyJWT 2.8.0 |
| Password Hashing | bcrypt (rounds=12) | 4.0.1 |
| Rate Limiting | slowapi | 0.1.9 |
| Migrations | Alembic | 1.13.1 |
| Infrastructure | Docker Compose + Caddy | Latest |
| Testing | Playwright (E2E API tests) | 1.61.1 |

---

## Container Architecture (4 containers)

1. **caddy** — Reverse proxy, TLS (internal CA), gzip, routing
2. **frontend** — Next.js standalone (Node.js)
3. **backend** — FastAPI + BackgroundTasks
4. **database** — PostgreSQL 16 + pgvector

Caddy is the sole host-port-exposed container (80/443). Backend and database communicate exclusively via the internal `lims-internal` bridge network.

---

## Backend Modules (4)

| Module | Purpose | Routers |
|--------|---------|---------|
| `identity` | Auth, Users, Roles, Employees, Permissions | auth, users, employees, permissions |
| `academic` | Courses, Sections, Students, Enrollments, Certificates | courses, sections, students, enrollments |
| `lms` | Attendance, Assignments, Grades, Submissions + Financial | attendance, assignments, grades, payments, expenses, closures |
| `dashboard` | Role-specific aggregated views | manager, secretary, teacher |

All routes are mounted under `/api/v1/`.

---

## Authentication Flow

- Login returns access token (15min) + refresh token (7 days) as **HttpOnly Secure SameSite=Lax** cookies
- Refresh token rotation: each use issues a new refresh token and revokes the old one
- JWT signature verified server-side via `decode_token()` in `app/modules/identity/dependencies.py`
- Middleware (frontend) decodes JWT via base64 for client-side routing only — no signature check (acceptable since API enforces auth)
- Rate limiting: 3 req/min on login, 10 req/min on refresh
- Account lockout after 5 failed attempts (15 min)

---

## RBAC — 4 Roles

| Role | Scope |
|------|-------|
| superadmin | Full system access, backup management, infrastructure |
| manager | Close daily ledger, grant discounts, monitor analytics |
| secretary | Register students, create courses, process payments, log expenses |
| teacher | View assigned courses, record attendance/grades, withdraw wallet balance |

Authorization enforced via `require_role()` dependency gates and page-level permission checks.

---

## Stateful Courses (No Terms)

The `terms` table was abolished in v1.7. Courses are now independent entities with a state machine:

```
Pending (awaiting quota) → Active (in progress) → Completed
```

Each course has `enrolled_count ≤ capacity` enforced via DB check constraint. Late registration allowed with flexible pricing (Secretary applies discount).

---

## Financial Engine

- **Payments**: Per-student installments on enrollments. Generates printable receipts.
- **Revenue split**: Teacher share = amount paid × teacher_percentage. Institute takes the rest.
- **Teacher wallets**: Ledger tracking cumulative teacher balance. Withdrawals recorded as expenses.
- **Expenses**: General (operational), teacher withdrawal, secretary advance.
- **Daily closure**: Manager closes each calendar day. Closed days reject financial mutations. Unlock request workflow for corrections.

---

## Frontend Structure

- Next.js 14 App Router with locale-based routing (`[locale]/`)
- Middleware handles locale detection and auth redirects
- 21 route groups under dashboard: attendance, backups, certificates, courses, daily-closures, employees, enrollments, expenses, gradebook, health, ingestion, payments, pos, revenue, roles, sections, settings, students, teacher-wallet, users
- Design system: Professional Minimalist (light mode only, slate-50 backgrounds, Indigo brand, Teal AI accent)
- Bilingual: Arabic + English with RTL support

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| No Redis/Celery | Lean MVP — FastAPI BackgroundTasks for async work |
| pgvector in same DB | No external vector DB — `VECTOR(1536)` with HNSW index |
| JWT in cookies (not localStorage) | XSS-safe, HttpOnly prevents JS access |
| No dark mode | Keep CSS debt-free during MVP phase |
| Soft deletes | `deleted_at` / `is_active` flags preserve audit trail |
| Single auth mode | Cookie-based only — no bearer token alternative |
