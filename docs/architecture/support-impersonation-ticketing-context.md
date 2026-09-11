# Support Impersonation & Ticketing — Architecture Context Brief

**Purpose:** Technical grounding document for designing a Support Impersonation and Ticketing system on top of the existing LIMS stack. Every item below is verified against the current codebase (2026-09-10, migration head `202609060001`).

**Status:** Source-of-truth context (not an implementation plan).

---

## 1. Tech Stack & Architecture

- **Repository layout:** monorepo — `apps/erp` (internal staff ERP), `apps/portal` (student/parent BFF + web), `apps/ai-service` (stub), `apps/marketing` (public site + shared login).
- **Backend framework:** FastAPI `0.111.0` on uvicorn `0.30.1`, fully async (`async def` handlers, async DB engine). Python 3.11-slim.
  - ERP API — `apps/erp/backend/app/main.py` → `FastAPI(title="LIMS API Server", version="1.7")`, port `8000`.
  - Portal BFF — `apps/portal/backend/app/main.py` → "External portal BFF — isolated auth, cached reads proxied to ERP", port `8001`.
  - AI service — `apps/ai-service/app/main.py`, port `8002` (skeleton: `/health` + `/internal/enqueue` → 501).
- **Frontend framework:** Next.js `14.2.3` (App Router) + React `18.3.1` + TypeScript `5.9.3`, Tailwind `3.4.4`, lucide-react icons. Frontends are **not containerized** — deployed on Vercel with rewrites proxying `/api/v1/*` (ERP) and `/api/*` (portal) to the EC2 origin.
  - State/data layer: **axios + React Context only**. No react-query / SWR / Redux / Zustand.
  - No component library (no shadcn/radix/mantine) — hand-rolled components.
- **Database engine:** PostgreSQL `16` + pgvector (`pgvector/pgvector:pg16`), container `lims_database`, single DB `lims`.
  - Single PG instance shared by ERP and portal, **schema-isolated**: `erp`/public tables vs `portal.*` schema.
  - **Redis 7** exists **only in the portal plane** (`docker-compose.portal.yml`) — read-through cache + stream queues. ERP deliberately has no Redis/Celery (Lean MVP constraint in `docs/architecture/memory.md`).
- **ORM / query builder:** SQLAlchemy `2.0.30` async (`create_async_engine` + `async_sessionmaker`, `get_db()` dependency in `app/db/session.py`); driver `asyncpg==0.29.0`; `psycopg[binary]==3.1.19` sync for Alembic/`pg_dump`. **Pydantic `2.7.4`** + `pydantic-settings`.
  - **Alembic `1.13.1`**, 47 migrations, linear chain, head `202609060001`; naming mostly `YYYYMMDDNNNN_slug.py`.
  - Base: `app/db/base.py` → `class Base(DeclarativeBase)` with explicit naming convention. **No shared `TimestampMixin`/`AuditMixin` exists** — every model declares columns directly.
  - Portal BFF has **no ORM models** — raw `sqlalchemy.text()` against `portal.*` only.
- **API design pattern:** REST/JSON, versioned.
  - ERP mounts all routers under `/api/v1` in `app/main.py` via 15× `include_router(..., prefix="/api/v1")`.
  - Portal BFF mounts under `/api` (`/api/auth`, `/api/me`, `/api/ai`, `/api/health`).
  - Layered module pattern (not full repository pattern): each module = `router.py` + `schemas.py` + `service.py` + `models.py` (+ `dependencies.py`).
  - **No GraphQL, no WebSocket, no SSE** (grep: zero matches).
  - ERP module folders: `academic`, `backups`, `bookings`, `contacts`, `content`, `dashboard`, `identity`, `lms`, `notifications`, `portal_accounts`, `portal_internal`, `reports`, `search`, `settings` (`ai_management`, `lessonforge` are empty placeholders).
- **Deployment topology:** Caddy is the sole ingress (`infrastructure/caddy/Caddyfile`, security headers, `erp.aldirasat.edu` / `portal.aldirasat.edu`). ERP compose = `database` → `backend` → `caddy` (+ `cloudflared` behind a profile) on the `lims-internal` bridge. Portal compose joins the same external network. **4-container limit is an immutable rule** (`memory.md`).

---

## 2. Authentication & Session Management

- **Mechanism:** stateless **JWT in HttpOnly cookies** — no OAuth, no API keys for user auth. PyJWT `2.8.0`, raw `bcrypt` (`gensalt(rounds=12)`), **no passlib**.
- **Two fully isolated auth domains** (explicitly designed as non-negotiable):
  - ERP: secret `JWT_SECRET_KEY`, HS256, cookies `access_token` (15 min) + `refresh_token` (7 days).
  - Portal BFF: secret `PORTAL_JWT_SECRET`, HS256, cookies `portal_access_token` (10 min) + `portal_refresh_token` (30 days).
  - Cookie flags: `httponly=True`, `samesite="lax"`, `path="/"`, `secure` unless `ENVIRONMENT=="development"`.
- **Bridging:** a **one-time SSO ticket** signed with a third secret `PORTAL_SSO_SECRET` (`aud="portal"`, 60s TTL, single-use `jti`, consumed via `portal.sso_tickets`). ERP login detects a student/parent credential and issues the ticket; portal `/api/auth/sso` mints a portal-owned session.
- **JWT claims** (ERP access/refresh): `sub` (user UUID), `role` (role name string), `is_superadmin` (bool), `exp`, `type` (`"access"`/`"refresh"`), `jti`. Portal claims: `sub`, `email`, `exp`, `type`, `jti` — **no role, no tenant**. **No tenant/org claim anywhere** (no multi-tenancy).
- **Refresh strategy:** rotation on every use — old token marked `revoked=True`, new one inserted; tokens stored **hashed with SHA-256** (`refresh_tokens.token_hash`, `portal.refresh_tokens`).
- **Rate limiting (slowapi):** ERP login `3/min`, refresh `10/min`, change-password `5/min`, global default `100/min`; account lockout after 5 failed attempts for 15 min. Portal login `10/min`, SSO `20/min`.
- **Identity extraction — no auth middleware; dependency injection only:**
  - ERP `get_current_user` — `apps/erp/backend/app/modules/identity/dependencies.py:12`. Reads `access_token` cookie → `decode_token` → loads `User` via `joinedload(role, employee)`. Returns an **ORM `User`**, not attached to `request.state`.
  - Portal `get_current_portal_user` — `apps/portal/backend/app/modules/auth/dependencies.py:11`. Decodes `portal_access_token`, then raw SQL on `portal.users`. Returns a **dict**.
  - Middleware stack (both apps): CORS (credentials), `RealIPMiddleware` (X-Forwarded-For → `request.scope["client"]`), `CSRFMiddleware` (double-submit `csrf_token` cookie ↔ `X-CSRF-Token` header on unsafe methods). ERP additionally has `IdempotencyMiddleware` (POST/PATCH/PUT by `Idempotency-Key`, replay header `X-Idempotency-Replayed: true`).
- **Service-to-service auth:** header key `X-Service-Key == ERP_SERVICE_KEY` via `verify_service_key` (`app/modules/portal_internal/dependencies.py:11`), plus `X-Actor-Id` (portal user id). Not a user session.
- **RBAC — DB-backed, dependency-enforced:**
  - Models in `app/modules/identity/models.py`: `Role` (`roles`: id, unique name), `Permission` (`permissions`: codename/label/group), `RolePermission` (`role_permissions` composite PK). `User.role_id` FK (1 user → 1 role) + `User.is_superadmin` boolean.
  - Hardcoded allow-list `VALID_SYSTEM_ROLES` (`dependencies.py:10`): **`superadmin`, `manager`, `teacher`, `secretary`, `marketing_manager`**. Login is rejected for any other role (a seeded `cleaner` role exists but cannot obtain a session).
  - Enforcement primitives: `RoleChecker(allowed_roles=[...])` (superadmin bypass by **role name**), `require_role(name)` / `require_manager` / `require_secretary` / `require_teacher`, `superadmin_gate` (strict), `PermissionChecker(codename)` (superadmin bypass by **`is_superadmin` flag**, else queries `role_permissions`). 146 call sites across 12 routers.
  - Permission codenames are all `page_*`: `page_dashboard`, `page_users`, `page_employees`, `page_roles`, `page_courses`, `page_sections`, `page_students`, `page_enrollments`, `page_attendance`, `page_gradebook`, `page_payments`, `page_expenses`, `page_revenue`, `page_teacher_wallet`, `page_daily_closures`, `page_pos`, `page_ingestion`, `page_health`, `page_backups`, `page_settings`, `page_certificates`, `page_cashier_refunds`, `page_reports`, `page_financial_records`, `page_staff_payroll`, `page_notifications`, `page_content`, `page_announcements`, `page_contacts`, `page_bookings`. Seeded via Alembic migrations; stored in DB.
  - Portal RBAC: **none** — authorization is "valid portal session" + ERP-side actor→linked-student check (`parent_links` / `student_links`).
  - ⚠️ `"accountant"` appears in `RoleChecker` gates (`/lms/cashier/*`, `pending-refunds`) but is **not** in `VALID_SYSTEM_ROLES`.
- **Existing impersonation support:** **none.** No `impersonat` / `act_as` / `switch_user` / `sudo` matches in either backend. The closest analogue is service-key `X-Actor-Id` actor attribution (audit only, not user-driven).

---

## 3. Database Schemas & Audit Logging

### Identity / access-control tables (`app/modules/identity/models.py`)

- **`users`** — `id` UUID PK, `email` unique indexed (login), `password_hash`, `role_id` FK `roles.id` (RESTRICT, indexed), `employee_id` FK `employees.id` (SET NULL), `locale_pref` default `"ar"`, `is_active`, `is_superadmin`, `failed_login_attempts`, `locked_until`. Relationships: `role`, `employee`, `refresh_tokens`, `audit_logs`. **No `created_at`/`updated_at`.** Python `@property full_name` proxies `employee.full_name`.
- **`employees`** — `id`, `full_name`, `employee_type` enum (teacher/manager/secretary/cleaner/security/receptionist/accountant/maintenance/other), `phone_number`, `default_salary`, `default_percentage`, `hire_date`, `contract_end_date`, `address`, `is_active`, `created_at`, `updated_at`.
- **`roles`** — `id`, `name` unique indexed. Seeded: `superadmin`, `manager` (renamed from `admin`), `teacher`, `secretary`, `cleaner`, `marketing_manager`.
- **`permissions`** — `id`, `codename` unique indexed, `label`, `group`.
- **`role_permissions`** — composite PK (`role_id`, `permission_id`), both CASCADE.
- **`refresh_tokens`** — `id`, `user_id` FK CASCADE indexed, `token_hash` unique, `expires_at` indexed, `revoked`.
- **`audit_logs`** — see below.

### Audit logging — what exists today

- **`audit_logs`** (`identity/models.py:145`): `id` UUID PK, `user_id` FK `users.id` (SET NULL, nullable, indexed), `action` `String(255)`, `payload` `JSONB` (nullable), `ip_address` `String(45)`, `timestamp` `DateTime(timezone=True)`.
- Written exclusively through **`create_audit_log(...)`** in `app/modules/identity/service.py:15` (`db.add(entry); await db.flush()`). ~18 call sites in `identity/router.py` plus `settings`, `content`, `academic`, `backups` and inline `_write_audit` in `portal_internal/router.py` (action `INTERNAL_PORTAL_ACCESS`).
- Events include `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_ROTATED`, `PASSWORD_CHANGED`, `LANDING_UPDATED`.
- Read back in `dashboard/service.py:320` → `recent_audit_logs`.
- **No generic mixin, no activity-log table, no middleware-driven audit.** Auditing is manual and per-call-site.
- **`created_by` / `updated_by` FKs → `users.id`, populated explicitly in the service layer (no mixin):**
  - `Payment.created_by`, `Expense.created_by` (+ `voided_by`/`voided_at`/`void_reason`), `LedgerEntry.created_by`, `AttendanceSession.created_by`, `SectionPriceRecord.created_by`, `SystemSetting.updated_by`, `LandingContent.updated_by`, `Contact.contacted_by`, `Booking.contacted_by`.
  - Role-specific actor columns: `CourseSection.cancelled_by`, `FinalGrade.graded_by`, `Grade.graded_by`, `SectionCancellation.cancelled_by`, `UnenrollmentRecord.unenrolled_by`, `UnenrollmentOverride.overridden_by`, `Refund.disbursed_by`, `SectionCompletionOverride.overridden_by`, `CompensationAmendmentRequest.requested_by`/`reviewed_by`, `DailyClosure.closed_by_manager_id`.
- **Gaps:** legacy financial tables (`Payment`, `Expense`, `Grade`, `LedgerEntry`, `AttendanceRecord`) have **no `created_at`**; the JSONB `payload` is untyped (no enforced schema); audit rows carry no correlation/request id and no impersonation context.
- **Soft delete:** nullable `deleted_at` on `Course`, `CourseSection`, `Student`, `Enrollment`, `Assignment`, `Certificate`. `Expense` uses a void pattern instead. No `is_deleted`, no `deleted_by`, **no row versioning / optimistic locking anywhere**. History is captured via append-only detail tables (`section_price_history`, `section_cancellations`, `unenrollment_records`, `unenrollment_overrides`, `ledger_entries`).

### Ticketing / support

- **No Ticket / Support / Issue / Complaint / Conversation / Thread / message-inbox models or tables exist.** The only `ticket` hits are SSO login tickets (`portal.sso_tickets`).
- **Closest existing intake patterns to model on:** `contacts` (`name, phone, message, status default "pending", created_at, contacted_at, contacted_by, notes`) and `bookings` (same shape + `program`) — both are de-facto mini-tickets with a `pending → contacted` workflow and an actor FK.

### Notifications (natural integration point)

- **`notifications`** (`app/modules/notifications/models.py`): `id`, `user_id` FK CASCADE indexed, `type`, `title_key`, `body_key`, `params` JSONB, `target_href`, `priority`, `dedupe_key`, `is_read`, `created_at`, `read_at`, `expires_at`.
- `notifications/service.py`: `create_notification()` uses `pg_insert(...).on_conflict_do_nothing` on `(user_id, type, dedupe_key)`; i18n-key based; TTL/retention; `mark_read`, `resolve_for_user`, `delete_one`.
- `notifications/emitters.py`: `emit_*` helpers resolve recipients by role (`_user_ids_by_role`) or employee (`_user_id_for_employee`) and fire best-effort post-commit. **Add `emit_ticket_*` here.**
- No messaging/inbox/conversation models beyond this.

### Portal schema (raw SQL, no ORM)

- `portal.users(id, phone unique, email unique, password_hash, full_name, locale_pref, phone_verified_at, is_active, failed_login_attempts, locked_until, created_at, updated_at)`, `portal.refresh_tokens`, `portal.student_links`, `portal.parent_links(guardian_id, student_id, relationship, verified_at)`, `portal.guardians(id, national_id — currently inserted NULL)`, `portal.sso_tickets(jti PK, consumed_at, created_at)`, `portal.preferences`.

### Model registration caveat

- `alembic/env.py` registers models by **explicit import** (identity, academic, lms, settings, bookings). ⚠️ **`notifications`, `contacts`, and `content` models are NOT imported** — autogenerate would wrongly propose dropping their tables. Any new tickets module must be added to that import block.

---

## 4. Error Handling & Context Capture

### Backend

- **Only one custom exception handler exists:** `app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)` at `apps/erp/backend/app/main.py:73` → HTTP 429 body `{"error": "Rate limit exceeded: ..."}` + `X-RateLimit-*` / `Retry-After` headers.
- **No handler for `RequestValidationError`, no generic `Exception` handler, no custom `HTTPException` handler.**
  - `HTTPException` → default `{"detail": "<string>"}` (the shape used app-wide, e.g. `middleware/csrf.py:41`).
  - Validation errors → default 422 `{"detail": [{"loc", "msg", "type"}]}`.
  - **No `code`, `message`, or `traceId` fields in any envelope.** Frontends read `.detail` exclusively.
- Localized messages exist as **strings only**: `app/core/error_messages.py` (`ERROR_MESSAGES` ar/en + `get_error_detail(code, locale)`), used as `detail` text.
- **Correlation IDs: none.** No `X-Request-ID`, no request-id `contextvars`, no trace id generated, echoed, or logged. (`request_id` matches in `lms/compensation_service.py` are an unrelated DB field name.)
- **Logging:** `app/core/logging.py` — `JSONFormatter` emitting `{timestamp (UTC ISO-8601), level, logger, message, exception?, extra?}` to a **single stdout `StreamHandler`**; `setup_logging()` called once in `main.py:27`; INFO hard-coded, **no env override, no file/rotating handler** (the `logs/` dir only holds redirected process output). No `dictConfig`/structlog.
- **No request/response logging middleware** (no method/path/status/duration access log inside the app). Uvicorn's plain-text access log runs separately from the JSON logger.
- **Zero redaction:** no `redact`/`mask`/`sanitize` anywhere. `record.extra` is dumped verbatim. Sensitive values pass through unredacted — audit payloads store emails/identifiers, and `academic/router.py:485` returns auto-generated portal credentials (`student_password = data.phone`, `parent_password = data.parent_phone`) in an API response.
- **Telemetry:** Sentry only — backend `sentry_sdk.init(...)` (`main.py:19`, `traces_sample_rate=0.1`, `sentry-sdk==2.5.1`) and ERP frontend `@sentry/nextjs ^8`. **No OpenTelemetry / Prometheus / Datadog.** Portal frontend has **no monitoring at all**.

### Frontend

- **ERP:** the only error boundary is `apps/erp/frontend/app/dashboard/error.tsx` ("use client", `{ error, reset }`). **No `global-error.tsx`, no `not-found.tsx`, no React `ErrorBoundary` class.**
- **Portal:** **no error boundary at all.**
- **Axios interceptors** (`lib/api.ts` in both apps; `withCredentials: true`, base `/api/v1` ERP / `/api` portal):
  - Request: attach `X-CSRF-Token` from `csrf_token` cookie on mutating methods; ERP also attaches `Idempotency-Key` (`crypto.randomUUID()`).
  - Response: network error → retry ×2 with backoff → reject `code="NETWORK_ERROR"` + Sentry; 5xx → retry ×2 → `code="SERVER_ERROR"` (message from `data.detail`) + Sentry; 404 → `NOT_FOUND`; 403 with `detail === "CSRF token mismatch"` → re-fetch `GET /auth/csrf` and retry once, else `FORBIDDEN` + `redirectToLogin()`; 401 → single-flight `POST /auth/refresh` with subscriber queue, on failure `SESSION_EXPIRED` + `redirectToLogin()`.
  - `redirectToLogin()` → `${NEXT_PUBLIC_MARKETING_URL}/<locale>/login` (skips public landing `/`).
- **Error surfacing:** **no toast library** — inline component state (`setError(e?.response?.data?.detail || t.error)`) across modals/pages.
- **Route protection:** Next middleware does locale detection (`[locale]`, default `ar`) and gates `/dashboard`+`/admin` on the presence of the refresh cookie; it base64-decodes the JWT payload for superadmin gating (no signature check at the edge — the API enforces it). Frontends use HttpOnly cookies, never `Authorization` headers.

---

## 5. Sensitive Resources (Support-Access Restriction Scope)

### Must be restricted / blocked and audited for support agents

| Module | Prefix | Notable sensitivity | Existing gate |
|---|---|---|---|
| identity | `/api/v1/auth`, `/users`, `/employees`, `/permissions` | Credentials, role/permission mutation | mixed (`get_current_user`, `RoleChecker(["superadmin","manager"])`, `PermissionChecker("page_roles")`) |
| academic | `/api/v1/academic` | Student PII, grades, enrollments, discounts, cancellations, refunds, certificates | mixed — many GETs only `get_current_user` |
| lms | `/api/v1/lms`, `/api/v1/staff-payroll` | Payments, expenses, salaries, teacher wallets, ledgers, daily closures | `RoleChecker` throughout |
| reports | `/api/v1/reports` | Exports/print of P&L, ledger, payroll, grade summary | per-code `_ROLE_GATES` + `page_reports` |
| backups | `/api/v1/database-backups` | Full DB dumps + uploads archives | `superadmin_gate` only |
| settings | `/api/v1/settings/system` | Institute profile | `RoleChecker(["superadmin"])` |
| dashboard | `/api/v1/dashboard/superadmin`, `/dashboard/health` | Aggregate financial KPIs | `superadmin_gate` |
| portal_internal | `/api/v1/internal/portal` | Grades/attendance/payments bridge | `verify_service_key` + actor→student link |
| portal BFF | `/api/me/*` | Student/parent grades, fees, attendance, profile | portal session + link check |

### Sensitive columns / models

- **Students (PII):** `Student.student_code, full_name, email, phone` — `academic/models.py:160`.
- **Grades:** `FinalGrade.final_score, notes, graded_by` (`academic/models.py:16`); `Grade.score, feedback, graded_by` (`lms/models.py:145`).
- **Financial per-student:** `Enrollment.agreed_price, price_override, admin_discount`; `Payment.amount, receipt_number, payment_method, transaction_number`; `Expense.amount, recipient_name, recipient_id, type` (`salary_draw`, `teacher_withdrawal`); `TeacherWallet.balance, frozen_balance`; `SectionContract.compensation_model, fixed_amount, percentage, holdback_rate`; `LedgerEntry.narrative, *_delta`; `PendingRefund.amount/status`; `Refund.receipt_number/amount`.
- **HR/payroll:** `Employee.full_name, phone_number, default_salary, default_percentage, address, hire_date, contract_end_date`.
- **Identity:** `User.email, password_hash, is_superadmin, locked_until`; `RefreshToken.token_hash`; `AuditLog.payload, ip_address`.
- **Marketing PII:** `Contact.name/phone/message`, `Booking.name/phone/program/message`.
- **Explicitly absent:** no `national_id` on ERP models; no passport/IBAN/bank-account/medical columns (only `portal.guardians.national_id`, inserted NULL).

### Practical restriction guidance

- **Block/replace for support sessions:** identity (auth/users/employees/permissions), `academic`, `lms` + `staff-payroll`, `reports`, `database-backups`, `settings/system`, `dashboard/superadmin|manager`, `internal/portal`.
- **Relatively safe support surfaces:** `notifications` (own user), `search` (role-scoped in `search/service.py`), `contacts` / `bookings` triage, `content` admin (marketing).
- **Reuse existing primitives:** `get_current_user`, `RoleChecker`, `superadmin_gate`, `PermissionChecker`, `verify_service_key`, and `create_audit_log` for every mutation.
- **File handling gap:** `app/core/storage.py` (`save_upload`, `UPLOAD_DIR`, `delete_file`, `check_disk_space`) has **zero callers**; no route accepts `UploadFile`; no `StaticFiles` mount. Attachments for tickets would be net-new infrastructure. Only backups currently produce/serve files.

---

## 6. Design Implications for Impersonation + Ticketing

- **Impersonation must be net-new.** There is no impersonation primitive; the cleanest fit with existing patterns is an **audit-carrying token/claim extension** checked by a new dependency alongside `get_current_user`, not a rewrite of the cookie auth. Both ERP and portal auth domains are separate — impersonation **must be implemented twice and never share secrets**.
- **Audit is manual, not middleware-driven.** Any impersonation session should emit `audit_logs` rows (action + JSONB payload) at start/stop **and** propagate an impersonator id; consider adding `impersonator_id` semantics because `audit_logs.user_id` is the only actor column and it is nullable (SET NULL).
- **No correlation IDs today.** Ticket-to-request tracing requires introducing a request-id middleware + log field + response header — nothing exists to piggyback on.
- **Single actor column per table.** Existing `created_by`/`*_by` columns point at `users.id` and are populated in services; an impersonated action would otherwise be indistinguishable from the real user's, so the audit trail needs an explicit "on behalf of" channel.
- **Ticketing has a ready template:** `contacts`/`bookings` already implement `pending → contacted` with `contacted_by` + timestamps; `notifications` gives the delivery mechanism; `audit_logs` gives the immutable trail.
- **Conventions to follow for new tables:** UUID PK with `gen_random_uuid()`, tz-aware `created_at`/`updated_at`, FK to `users.id`, `deleted_at` for soft delete, explicit `created_by`, register the model in `alembic/env.py`, and audit every mutation via `create_audit_log`.
- **Hard constraints:** ERP stays at 4 containers and has no Redis/Celery (BackgroundTasks only); no new infra service for tickets. Model changes must flow through Alembic from head `202609060001`.
