# Settings Page — Implementation Plan

**Status:** Shipped — Phases 1, 3, 4 done; archived to `docs/archive/plans/settings-page.md` (Phase 2 notifications still Coming soon per v1 decision)
**Target:** v1.8.1 (after reports, before AI ingestion)
**Prereq:** None — Phase 1: read/write on `users` table only; Phase 3: `system_settings` table + migration `202608060005`
**Decisions:** Locked 2026-08-11 — see §10 Decisions (Resolved)

---

## 1. Problem / Current State

| Area | Today | Gap |
|---|---|---|
| Route | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/settings/page.tsx` exists | Stub — centered `Construction` icon + "Coming soon" |
| Nav | Sidebar entry `Settings` (`Settings` icon, `page_settings`) + route guard in `layout.tsx:261` | Guard allows all 4 roles — correct for personal settings, but no tab-level gating for admin sections |
| Personal profile | `GET /users/me`, `GET /auth/me`, `GET /auth/me/permissions` under `AuthContext` | Read-only in header/sidebar; no self-service edit |
| Password change | `PUT /users/{id}` (admin-only, `RoleChecker(["superadmin","manager"])`) hashes via `identity/service.py:update_user` | No self-service `POST /auth/change-password` — users must ask an admin to reset |
| Language | `User.locale_pref` (`ar`/`en`) persisted in DB, toggled via header `Globe` button (`layout.tsx:156`) | Toggle writes via `PUT /users/{id}` (admin path) — no direct user-facing preference control + no persistence feedback |
| Notifications | `notifications` module + `NotificationBell` in header | No per-user preference (mute, retention) UI |
| Institute / system config | `apps/erp/backend/app/core/config.py` Settings are env-only (`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `TIMEZONE`, etc.) | No DB-backed institute profile (name, logo, address, contact), no runtime-editable defaults |

**User-facing symptom:** Every role sees "Coming soon" under Settings. Changing a password or language preference requires an admin. No place to manage institute branding or notification preferences.

---

## 2. Goals / Non-Goals

**Goals:**
- Replace the stub with a real, bilingual (ar/en, RTL), permission-aware Settings page following `Professional Minimalist` (`frontend-design-rules.md`) and `globals.css` primitives (`.card`, `.input-field`, `.btn-primary`).
- Let any authenticated user manage their own account safely (profile view, password change, language).
- Gate admin sections so direct-URL bypass is impossible (defense in depth: sidebar hiding + `ROUTE_PERMISSION_MAP` + backend `RoleChecker`/`PermissionChecker`).

**Non-goals (deferred):**
- Dark mode (`memory.md` / `frontend-design-rules.md` — explicitly unsupported).
- New infra (Redis, etc.) — 4-container limit (`memory.md §1`).
- Billing / subscription management — not in current domain.
- Avatar upload / file storage beyond existing `uploads/` — defer to Phase 3 if requested.

---

## 3. UX — Information Architecture

Single page `/{locale}/dashboard/settings` with tab navigation (tabs are client-state, not sub-routes — keeps `middleware.ts` and `ROUTE_PERMISSION_MAP` simple).

```
Tabs (role-filtered)
├── Profile        — every authenticated user (email read-only)
├── Security       — every authenticated user
├── Preferences    — every authenticated user (language only for v1)
└── System         — superadmin only
```

| Tab | Contents | Primary action |
|---|---|---|
| **Profile** | Read-only card: full name (from `employee.full_name`), email (read-only for now — edit via Users/Employees admin pages), role badge, employee type, `is_superadmin` flag. Locale shown, edit moved to Preferences. | View |
| **Security** | Change password form: current password, new password, confirm. Strength meter + server errors. On success: toast + optional re-login nudge. | `POST /auth/change-password` |
| **Preferences** | Language selector (`ar`/`en`) with RTL preview. Persists via `PATCH /users/me`. Notification prefs deferred — show "Coming soon" placeholder in this tab (small ship). | Save preferences |
| **System** | Institute profile: display name ("Al-Drasat ERP"), address, phone + runtime defaults (timezone display `Asia/Riyadh`, default teacher percentage, backup retention hint). Logo: static preview from `BrandLogo` `/logo.jpeg` with "Coming soon" edit placeholder (upload deferred). Edit gated to `superadmin` only. Backed by `system_settings` KV table. | `GET/PUT /settings/system` |

Design notes:
- Follow `health/page.tsx` + `revenue/page.tsx` patterns: `max-w-6xl mx-auto`, `.card` sections, `lucide-react` icons, `recharts` not needed here.
- Bilingual strings live inline in the page (same pattern as `layout.tsx` `t.ar`/`t.en`) or a small `lib/i18n/settings.ts` helper — no new i18n framework.
- All inputs through `sanitizeInput` discipline already used in reports/revenue.

---

## 4. Backend Design

### 4.1 Reuse vs New

- **Reuse:** `identity/service.py:update_user`, `get_password_hash`/`verify_password`, `get_current_user`, `RoleChecker`.
- **New:** Two self-service endpoints + one optional system-settings module. Keep each function < 50 lines, matching `dashboard/service.py` style.

### 4.2 Phase 1 — Self-service account endpoints (no migration)

Add to `apps/erp/backend/app/modules/identity/router.py` (or a new `settings_router` mounted at `/api/v1`):

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/users/me` (existing) | `GET` | `get_current_user` | Already returns `UserResponse` — used by Profile tab as-is |
| `/auth/change-password` | `POST` | `get_current_user` + rate limit `5/minute` | Body: `{ current_password, new_password }`. Verify current with `verify_password`, validate strength via existing `_validate_password_strength`, hash and save, revoke other refresh tokens optionally, audit log `PASSWORD_CHANGED` |
| `/users/me` | `PATCH` | `get_current_user` | Body: `{ locale_pref?: "ar"|"en" }` (whitelist). Self-service only — never allows `role_id`, `is_superadmin`, `is_active` changes. Returns `UserResponse`. Audit `USER_PREFS_UPDATED` |

Schemas (in `identity/schemas.py`):

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    _validate = field_validator("new_password")(_validate_password_strength)

class UpdateMeRequest(BaseModel):
    locale_pref: Optional[str] = Field(None, pattern="^(ar|en)$")
```

Security:
- `current_password` required — prevents session-hijack password takeover.
- Rate limit via `slowapi` (`@limiter.limit("5/minute")`) matching login/refresh pattern.
- `AuthContext` refresh after locale change so header/dir updates without full reload.
- Audit logs via `identity/service.py:create_audit_log`.

No migration for Phase 1 — uses existing `users.locale_pref` column.

### 4.3 Phase 2 — Notification preferences — Deferred (Coming soon)

Deferred per 2026-08-11 decision (small ship). Preferences tab shows a "Coming soon" placeholder for notification prefs. No backend change in v1. Future options when revisited:
- **A (no migration):** `localStorage` mute hint (non-sensitive).
- **B (one column):** `users.notification_enabled BOOLEAN DEFAULT true` + `PATCH /users/me` extension.

### 4.4 Phase 3 — System / Institute settings (requires migration) — Superadmin-only, includes runtime defaults

New table `system_settings`:

```sql
CREATE TABLE system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
-- Seed: ('institute_profile', {"name":"Al-Drasat ERP","address":null,"phone":null,"logo_path":"/logo.jpeg"})
-- Seed: ('defaults', {"timezone":"Asia/Riyadh","default_teacher_percentage":null,"backup_retention_days":null})
```

Module `apps/erp/backend/app/modules/settings/` (mirror `reports/` layout):

```
settings/
  __init__.py
  schemas.py   # SystemSettingsResponse, SystemSettingsUpdate
  service.py   # get_system_settings(db), update_system_settings(db, key, value, actor)
  router.py    # settings_router = APIRouter(prefix="/settings", tags=["settings"])
```

Endpoints (superadmin-only per 2026-08-11 decision):

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/settings/system` | `GET` | `RoleChecker(["superadmin"])` | Return all settings KV (institute profile + defaults) |
| `/settings/system` | `PUT` | `RoleChecker(["superadmin"])` | Upsert one or more keys, audit `SYSTEM_SETTINGS_UPDATED` |

Registration in `apps/erp/backend/app/main.py`:

```python
from app.modules.settings.router import settings_router
app.include_router(settings_router, prefix="/api/v1")
```

Migration: `alembic/versions/<ts>_add_system_settings.py` — create table + seed rows. Down drops table.

### 4.5 Permissions

- No new `page_settings` permission — it already exists and is correctly in `PAGE_PERMISSION_MAP` / `ROUTE_PERMISSION_MAP`. Tab-level gating is role-based (`superadmin` for System), not a new permission.
- If Phase 3 needs finer grain, add `page_settings_system` permission seeded to `superadmin` only — but YAGNI for v1.

---

## 5. Frontend Design

### 5.1 Route

Keep single file `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/settings/page.tsx` (no sub-routes). Mark `"use client"`.

Tabs via local `useState<"profile"|"security"|"preferences"|"system">`. `System` tab rendered only if `user.is_superadmin` (superadmin-only per 2026-08-11 decision). Direct-URL to `#system` still blocked by conditional render — backend is authoritative. Logo edit in System tab is a static preview + "Coming soon" placeholder (upload deferred).

### 5.2 Components

Reuse `globals.css` primitives; new small components colocated:

```
apps/erp/frontend/app/[locale]/(dashboard)/dashboard/settings/
  page.tsx                 # tab switcher + data fetching via apiClient
  components/
    ProfileCard.tsx        # reads useAuth().user, GET /users/me — email read-only
    ChangePasswordForm.tsx # POST /auth/change-password
    PreferencesForm.tsx    # PATCH /users/me (language); notification prefs = Coming soon
    SystemForm.tsx         # GET/PUT /settings/system (superadmin) — logo = Coming soon; includes runtime defaults
```

Keep page < 400 lines by pushing each tab into its component — same guidance as reports `ReportShell` extraction.

### 5.3 State & API

- `apiClient` (`lib/api.ts`) already handles CSRF (`X-CSRF-Token`), idempotency (`Idempotency-Key`), 401 refresh, 403, retries, Sentry.
- After `PATCH /users/me` (locale), call `checkSession()`/`refreshPermissions()` from `AuthContext` so `layout.tsx` `dir` and `t` update.
- Forms use `useState` + inline validation; server errors surfaced via `ConfirmModal` or toast pattern already in codebase (`UndoToast`).

### 5.4 Layout wiring

No `layout.tsx` change needed for Phase 1/2 (route + guard already correct). For Phase 3, optionally add a `System` sub-badge in the sidebar entry — not required.

---

## 6. RBAC Matrix

| Tab / Endpoint | superadmin | manager | secretary | teacher | unauthenticated |
|---|---|---|---|---|---|
| `GET /users/me` | ✓ | ✓ | ✓ | ✓ | 401 |
| `POST /auth/change-password` | ✓ | ✓ | ✓ | ✓ | 401 |
| `PATCH /users/me` (locale) | ✓ | ✓ | ✓ | ✓ | 401 |
| `GET /settings/system` | ✓ | 403 | 403 | 403 | 401 |
| `PUT /settings/system` | ✓ | 403 | 403 | 403 | 401 |
| Page `dashboard/settings` | ✓ | ✓ | ✓ | ✓ | redirect `/login` (middleware) |
| System tab visible | ✓ | hidden | hidden | hidden | — |
| Logo upload | Coming soon (static preview only) | — | — | — | — |
| Notification prefs | Coming soon | Coming soon | Coming soon | Coming soon | — |

---

## 7. Phased Delivery

### Phase 1 — Personal Settings MVP (ship first, no migration)

**Goal:** Replace "Coming soon" with useful self-service.

Backend:
- Add `POST /auth/change-password` + `PATCH /users/me` to `identity/router.py`.
- Schemas + strength validation reuse.
- Audit logs + rate limiting.

Frontend:
- Rewrite `settings/page.tsx`: tabs Profile / Security / Preferences.
- `ProfileCard` (read-only), `ChangePasswordForm`, `PreferencesForm` (language).
- Bilingual + RTL polish, loading/error/empty states, `Professional Minimalist` styling.

Tests:
- Backend pytest: change-password happy path, wrong current password (400), weak password (422), unauthenticated (401), locale patch happy/invalid/unauthenticated, audit log written.
- Frontend Playwright: settings renders for each role, change-password validation + success toast, language persists after reload, route guard (unauthenticated redirect).

**Exit gate:** Page no longer shows "Coming soon"; any role can change own password + language and see updated header/dir.

### Phase 2 — Notification Preferences — Deferred (Coming soon)

No build in v1 (small ship — per 2026-08-11 decision). Preferences tab renders a "Coming soon" placeholder for notification prefs. No backend change. Revisit as a follow-up version when needed.

### Phase 3 — System / Institute Settings (superadmin-only, includes runtime defaults)

Backend:
- New `settings` module + `system_settings` table + seed migration + `GET/PUT /settings/system` (both superadmin-only). Seeds `institute_profile` + `defaults` (timezone, default teacher percentage, backup retention).

Frontend:
- `System` tab (superadmin-only) + `SystemForm` (name, address, phone, runtime defaults, logo static preview with "Coming soon" for upload/edit).

Tests:
- Migration up/down, GET/PUT as superadmin (200) vs manager/secretary/teacher (403), audit log, frontend System tab hidden for non-superadmin.

### Phase 4 — Polish & Archive

- Playwright E2E across `ar` + `en`, mobile drawer, error states (network, 500 retry), CSRF/idempotency headers verified.
- Coverage gate: identity module stays ≥ existing (no drop), new settings module ≥ 80% if introduced.
- Archive this plan to `docs/archive/plans/settings-page.md` and update `docs/plans/current.md` (move Settings from stub to Done).

---

## 8. Invariants & Risks

- **4-container limit** (`memory.md §1`): No new service — settings lives inside `backend` container.
- **Auth cookies only** (`memory.md §6`): No localStorage for tokens; preferences may use localStorage only for non-sensitive UI state (mute hint) — never for auth.
- **Single source of truth:** Password hashing via `identity/security.py:get_password_hash`; locale via `users.locale_pref` — no duplicate stores.
- **Read-only vs write:** Profile fields that are HR-owned (`full_name` from `employees`) stay read-only here — edited via Employees page (`RoleChecker(["superadmin","manager"])`). This avoids conflicting edit paths.
- **Email read-only:** Per 2026-08-11 decision, email is read-only in Settings; edits stay in Users/Employees admin pages. Future verified email-change flow deferred.
- **Logo upload deferred:** System tab shows static `BrandLogo` `/logo.jpeg` preview + "Coming soon" placeholder for edit/upload (per 2026-08-11 decision). Future `uploads/` handling deferred.
- **Notification prefs deferred:** Preferences tab shows "Coming soon" for notification prefs (small ship — per 2026-08-11 decision).

---

## 9. Success Gates

- Stub removed; page renders real content for all 4 roles without error on empty/partial data.
- Any user can change own password (current password required) and language, with audit log and rate limiting.
- `System` tab (if shipped) is invisible to secretary/teacher and PUT-blocked server-side for non-superadmin.
- Full suite green (currently 221 backend tests baseline); no coverage regression on `identity`.
- Bilingual pass (`ar` RTL + `en` LTR) and responsive (mobile drawer) verified in Playwright.

---

## 10. Decisions (Resolved 2026-08-11)

All open questions cleared — no blocking decisions remain.

| # | Question | Decision |
|---|---|---|
| 1 | Email editing | **Read-only** in Settings; edit via Users/Employees admin pages |
| 2 | System tab visibility | **Superadmin-only** (hidden for manager/secretary/teacher; GET/PUT both superadmin-only) |
| 3 | Institute profile scope | **Include runtime defaults** — institute profile (name, address, phone) + defaults (timezone, default teacher percentage, backup retention hint); seeds `institute_profile` + `defaults` |
| 4 | Notification prefs for v1 | **Defer** — small ship; Preferences tab shows "Coming soon" placeholder |
| 5 | Logo upload | **Static logo** for now; System tab shows static preview + **"Coming soon"** edit placeholder (upload deferred) |

Deferred items are labeled **"Coming soon"** in the UI and listed as such in §6 RBAC and §7 phases — they will be revisited in a follow-up version.

---

## 11. File Map (what will change, per phase)

| File | Phase | Action |
|---|---|---|
| `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/settings/page.tsx` | 1 | Rewrite — tabs + components |
| `apps/erp/backend/app/modules/identity/router.py` | 1 | Add 2 endpoints |
| `apps/erp/backend/app/modules/identity/schemas.py` | 1 | Add 2 schemas |
| `apps/erp/backend/app/modules/identity/service.py` | 1 | (no change — reuse `update_user`) |
| `apps/erp/backend/app/modules/settings/*` | 3 | New module (only if Phase 3 approved) |
| `apps/erp/backend/alembic/versions/*_add_system_settings.py` | 3 | New migration (only Phase 3) |
| `apps/erp/backend/app/main.py` | 3 | Register `settings_router` (only Phase 3) |
| `docs/plans/current.md` | 4 | Mark Settings Done, archive this plan |

---

*Archived — see `docs/archive/plans/settings-page.md` and `docs/plans/current.md`.*
