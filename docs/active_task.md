# Active Task: Phase 1 - Identity & User Management

## Goal
Establish the backend security architecture, JWT cookie-based session manager, role assignments (SuperAdmin, Admin, Teacher), audit logger, and frontend login UI.

---

## Status
- **Current Phase**: Phase 1
- **Progress**: 100% Completed
- **Next Action**: Run manual verification checks once container runtime dependencies are initialized.

---

## Tasks Checklist

### 1. Database Migrations (Alembic Schema Setup)
- [x] Initialize Alembic in the `backend/` directory (`alembic init alembic`).
- [x] Configure `alembic.ini` to connect dynamically using Environment Variables.
- [x] Create database migration for Identity tables:
  - [x] `roles` (Columns: `id UUID PK`, `name VARCHAR UNIQUE`).
  - [x] `users` (Columns: `id UUID PK`, `email VARCHAR UNIQUE`, `password_hash VARCHAR`, `full_name VARCHAR`, `role_id UUID FK`, `locale_pref VARCHAR`, `is_active BOOLEAN`, `is_superadmin BOOLEAN DEFAULT FALSE`).
  - [x] `refresh_tokens` (Columns: `id UUID PK`, `user_id UUID FK`, `token_hash VARCHAR UNIQUE`, `expires_at TIMESTAMP`, `revoked BOOLEAN DEFAULT FALSE`).
  - [x] `audit_logs` (Columns: `id UUID PK`, `user_id UUID FK`, `action VARCHAR`, `payload JSONB`, `ip_address VARCHAR`, `timestamp TIMESTAMP DEFAULT NOW`).
- [x] Create a seed migration script to insert default roles: `superadmin`, `admin`, and `teacher`.

### 2. Backend Security & Authentication Engine
- [x] Write password hashing utility functions using `bcrypt` or `argon2id`.
- [x] Write JWT creation and parsing helpers (Access Token = 15m, Refresh Token = 7d).
- [x] Implement secure cookie managers:
  - [x] Define settings: `HttpOnly=True`, `Secure=True`, `SameSite='Lax'`, `Path='/'`.
- [x] Implement FastAPI endpoints in `backend/app/modules/identity/router.py`:
  - [x] `POST /api/v1/auth/login`: verifies user, sets Access and Refresh cookies, creates audit entry.
  - [x] `POST /api/v1/auth/refresh`: checks refresh token, revokes old token, generates new rotated tokens, sets new cookies.
  - [x] `POST /api/v1/auth/logout`: invalidates token in cookies, revokes refresh token in database.
- [x] Build FastAPI Auth Dependency Injectors:
  - [x] `get_current_user`: extracts Access Token cookie, checks validity, queries DB, returns User object.
  - [x] `RoleChecker(allowed_roles)`: extracts role claims, rejects access with `403 Forbidden` if not allowed.
  - [x] `superadmin_gate`: verifies `is_superadmin == True` (for `/api/v1/admin/*` path protection).
- [x] Build a database logger wrapper or decorator to append actions directly to the `audit_logs` table.

### 3. Frontend Authentication Framework
- [x] Configure Axios/Fetch interceptors to set `credentials: 'include'` for all requests.
- [x] Create global Auth Context Provider (`AuthContext.tsx`) inside Next.js to track user state, loading transitions, and role.
- [x] Create a Next.js App Router middleware file (`middleware.ts`) to:
  - [x] Parse auth cookies (by accessing request context or forwarding checks to API).
  - [x] Direct unauthenticated users to `/login`.
  - [x] Intercept `/admin/*` routes to ensure role is `superadmin`.

### 4. Authentication UI & Shell Layout
- [x] Build the English & Arabic login interface page (`frontend/app/[locale]/(auth)/login/page.tsx`).
- [x] Build responsive dashboard shell layouts:
  - [x] Left navigation sidebar with links populated dynamically based on the current user's role.
  - [x] Top bar containing user profile summary, language toggle, and logout button.

---

## Technical Notes
- **Local HTTPS Pre-requisite**: Since cookies are configured with `Secure=True`, browser requests will block cookie saving unless accessed via trusted HTTPS. Run Caddy to test logins.
- **Audit Compliance**: Every login, logout, user-creation, and token revocation must write a clean trace entry in the `audit_logs` table.
- **Rate-Limiting**: Put rate-limiting on the `POST /api/v1/auth/login` endpoint using `slowapi` or custom middleware to prevent local brute force attacks.
