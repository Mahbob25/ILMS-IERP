# Central Notification Center — Implementation Plan

**Status:** Draft · not implemented
**Target:** v1.8
**Prereq:** None (new table + new module; no changes to existing tables)
**Backlog origin:** `docs/plans/ux-suggestions.md` #1

## Problem / Current State

Pending work is scattered across the app. Each item is only visible when a user visits the
dashboard card that happens to surface it:

| Pending item | Where it lives today | Who cares |
|---|---|---|
| Pending refunds | `cashier_service` + `dashboard/cashier/refunds` page | manager, secretary |
| Pending withdrawals | `get_manager_dashboard` (`dashboard/service.py`) | manager |
| Unlock requests | `get_manager_dashboard` (`DailyClosure.status == "unlock_requested"`) | manager |
| Pending amendments | `get_manager_dashboard` (`/lms/amendments/pending`) | manager |
| Pending grading | `get_teacher_dashboard` (ungraded submissions) | teacher |
| Students without enrollment | `get_secretary_dashboard` | secretary |
| Unclosed days | closure_service (implicit; no proactive signal) | manager, secretary |
| Section lifecycle (ready for completion, low occupancy) | `section_startup_checks` (logs only) | manager |

User-facing symptom: a manager must open the dashboard and scan cards to discover there is
work to approve; a teacher must remember to check the gradebook. There is no push model and
no history of "what happened while I was away."

## Standing Invariants

1. **Best-effort writes only.** Notification creation must NEVER break the originating
   business flow. Emitters catch/log/suppress failures (`logger.warning`); a failure to
   notify never rolls back a payment, refund, or closure.
2. **Notifications are read-only on business data.** The module only `INSERT`s notification
   rows and `UPDATE`s its own rows (`is_read`, `read_at`). It never touches ledgers,
   closures, payments, or enrollments.
3. **Per-user rows, resolved at creation time.** Emitters resolve the recipient(s) (user id)
   when the event fires. No "broadcast to role" tables, no runtime role membership checks —
   keeps the read path a simple indexed query.
4. **Bilingual content lives client-side.** DB stores a stable message key (`title_key`)
   + `params` (JSONB). The frontend renders AR/EN text from its locale dictionary, exactly
   like the existing `t` dicts in the dashboard layout. No Arabic/English strings in the DB.
5. **Dedupe by `(user_id, type, dedupe_key)`.** Entity-based events (refund id, unlock date,
   section id) must not duplicate on retries; daily-job events dedupe per date. Unique
   partial index with `ON CONFLICT DO NOTHING` insert.
6. **Ownership enforced server-side.** Every read/mark-read endpoint filters by
   `current_user.id`. A user can never see or mark another user's rows.
7. **Deep links respect existing route guards.** The frontend only renders a deep link if
   `hasPageAccess()` passes for the target route (existing `ROUTE_PERMISSION_MAP`), and
   emitters never produce links to pages a recipient role cannot open.
8. **No unbounded growth.** Daily cleanup job deletes rows older than
   `NOTIFICATION_RETENTION_DAYS` (default 90) **in batches of 1,000 per pass**
   (loop of `DELETE ... WHERE id IN (SELECT id ... ORDER BY created_at LIMIT 1000)`)
   so a large backlog of expired rows never holds a long table lock or trips a
   statement timeout. `created_at` is indexed for the sweep.

## Scope

### A. New backend module `app/modules/notifications/`

| File | Contents |
|---|---|
| `models.py` | `Notification` ORM model |
| `schemas.py` | `NotificationResponse`, `NotificationListResponse`, `UnreadCountResponse`, `MarkReadRequest` |
| `service.py` | `create_notification` (dedupe), `list_notifications`, `get_unread_count`, `mark_read`, `mark_all_read`, `delete_expired` (batched) |
| `router.py` | API endpoints (below) |
| `__init__.py` | empty |

**Model — `notifications` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID FK `users.id` ON DELETE CASCADE | indexed |
| `type` | String(50) | machine type, e.g. `refund_requested` |
| `title_key` | String(100) | e.g. `notif.refund_requested` |
| `body_key` | String(100) | nullable; e.g. `notif.refund_requested_body` |
| `params` | JSONB | interpolation values (names, amounts, dates); default `{}` |
| `target_href` | String(255) | locale-agnostic path, e.g. `dashboard/cashier/refunds` (frontend prefixes locale) |
| `priority` | String(10) | `high` / `normal` (default) / `low` |
| `dedupe_key` | String(100) | nullable; `{type}:{entity_id}` or `{type}:{date}` |
| `is_read` | Boolean | default `false`, indexed |
| `created_at` | timestamptz | default `now()` |
| `read_at` | timestamptz | nullable |
| `expires_at` | timestamptz | nullable (soft expiry, e.g. day-specific) |

Unique partial index: `UNIQUE (user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL`.

**API endpoints (all behind `get_current_user`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/notifications` | Paginated list; query `unread_only`, `page`, `per_page` (default 20, max 100); ordered `created_at DESC` |
| GET | `/api/v1/notifications/unread-count` | `{ unread_count: n }` — the bell badge poll |
| POST | `/api/v1/notifications/read` | Body `{ ids?: [uuid] }`; empty `ids` = mark all read; returns `{ updated: n }` |

Notes:
- List query uses the `(user_id, is_read, created_at DESC)` composite index.
- `POST /read` is idempotent-safe: covered by the existing IdempotencyMiddleware +
  `X-CSRF-Token` via the frontend `apiClient` interceptor (already in place).
- No permission check beyond authentication (all 4 roles get a bell); page-level
  permissions still gate the deep-link targets.

### B. Migration `202608060000_add_notifications_table.py`

- `alembic revision -m "add_notifications_table"` (down_revision: `202608050000`).
- `upgrade()`: `op.create_table("notifications", ...)`, composite index
  `ix_notifications_user_read_created` on `(user_id, is_read, created_at DESC)`,
  unique partial index on `(user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL`.
- `downgrade()`: drop indexes + table.

### C. Emitters — initial notification catalog

Emitters are thin functions in the notifications module
(`emit_*` in `service.py` or a dedicated `emitters.py`), called at existing mutation
points. They resolve recipients by role via the existing `roles` table, look up that
role's users, and call `create_notification` per user (dedupe protects retries).

| # | type | Recipient(s) | Trigger point (existing code) | Deep link | priority |
|---|---|---|---|---|---|
| 1 | `refund_requested` | manager, secretary | `cashier_service` — PendingRefund created | `dashboard/cashier/refunds` | high |
| 2 | `refund_disbursed` | secretary | `cashier_service` — Refund row created (disbursement) | `dashboard/cashier/refunds` | normal |
| 3 | `withdrawal_requested` | manager | expense creation with `type == "teacher_withdrawal"` (`lms_service`/expense route) | `dashboard/expenses` | high |
| 4 | `unlock_requested` | manager | `closure_service` — closure status → `unlock_requested` | `dashboard/daily-closures` | high |
| 5 | `amendment_pending` | manager | `compensation_service` — AmendmentStatus → PENDING | `dashboard/sections` | normal |
| 6 | `section_ready_for_completion` | manager, secretary | `section_startup_checks` / section status transition → `ready_for_completion` | `dashboard/sections` | normal |
| 7 | `section_cancelled` | secretary | `cancellation_service` — section cancelled | `dashboard/sections` | high |
| 8 | `grade_submitted` | teacher (own sections) | gradebook route — grade saved (recipient = section's teacher user) | `dashboard/gradebook` | low |

Dedupe keys: refund `refund_requested:{pending_refund_id}`; withdrawal
`withdrawal_requested:{expense_id}`; unlock `unlock_requested:{date}`; amendment
`amendment_pending:{amendment_id}`; section events `{type}:{section_id}`; grade
`grade_submitted:{submission_id}`.

Implementation rule: **an emitter must be called AFTER the business transaction
commits.** Use FastAPI `BackgroundTasks` (already the repo pattern — no Redis/Celery)
or post-commit hook so a failed insert cannot roll back the real mutation.

### D. Daily job — `run_daily_notification_checks`

Extend the startup lifespan pattern (already used for `run_daily_section_checks`):

| Check | Type | Recipients | Dedupe key |
|---|---|---|---|
| Yesterday has no `DailyClosure` row (status `closed`) | `unclosed_day` | manager, secretary | `unclosed_day:{date}` |
| Sections in `pending` with `enrolled_count < capacity` (stale, e.g. > 14 days since creation) | `section_low_occupancy` | manager | `section_low_occupancy:{section_id}` |
| Active sections past `end_date` still `active` | `section_overdue` | manager, secretary | `section_overdue:{section_id}` |

Called from `main.py` lifespan after `run_daily_section_checks`, wrapped in the same
try/except so DB unavailability never blocks startup. Idempotent by construction (dedupe
key per date/section) — safe to run more than once per day.

### E. Frontend

**1. Bell + dropdown — `components/notifications/NotificationBell.tsx`**
Mounted in `app/[locale]/(dashboard)/layout.tsx` header, next to the language toggle
(header right cluster, line ~483):

- Bell icon (lucide `Bell`) with unread-count badge (cap display at `99+`).
- Polling: `setInterval` 30s + `window` focus listener + refetch on dropdown open.
  Aborts on unmount; never polls on login page. The 30s poll is cheap by design:
  `/unread-count` is a single `COUNT` over the existing `(user_id, is_read,
  created_at DESC)` composite index — no joins, no table scan, no N+1. Interval
  stays a single frontend constant (`POLL_INTERVAL_MS`); if load ever warrants it,
  raising it to 60s costs nothing in UX because the focus listener still refreshes
  the badge the moment the user returns to the tab.
- Dropdown panel: last 10 notifications, grouped feel via `priority` accent
  (rose for high, amber for normal, slate for low), relative timestamps
  (client-side, respects `locale`).
- Click item → `router.push("/" + locale + "/" + target_href)` + `POST /read { ids: [id] }`.
- "Mark all as read" footer action (`POST /read` with empty ids).
- Empty state: friendly bilingual message ("لا توجد إشعارات / No notifications").
- Bilingual strings added to the layout `t` dicts (`ar`/`en`), following the existing
  inline-translation pattern.

**2. Full page — `app/[locale]/(dashboard)/dashboard/notifications/page.tsx`**
- Paginated history (all + unread-only filter), reuse list/pagination styling from
  `PendingRefundsTable.tsx`.
- Sidebar entry `t.menu.notifications` (icon `Bell`), added to `navigationItems`,
  `PAGE_PERMISSION_MAP` (`page_notifications: all 4 roles`),
  `ROUTE_PERMISSION_MAP` (`dashboard/notifications → page_notifications`).

**3. Notification strings module — `components/notifications/notificationMessages.ts`**
- `Record<titleKey, { ar: string; en: string }>` with `{param}` placeholders.
- `renderNotification(notification, locale)` interpolates `params` and falls back to
  the raw key if unknown (defensive; a new backend type can never crash the UI).

## Phasing

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **1 — Data + module** | Migration, model, schemas, service, router, unit tests | `pytest` green; endpoints auth-gated; ownership enforced |
| **2 — Emitters** | 8 emitters wired into existing services (post-commit) | Refund/withdrawal/unlock/amendment/grading flows create rows; origin flows unaffected (221 existing tests still pass) |
| **3 — Daily job** | `run_daily_notification_checks` + cleanup sweep in lifespan | Run twice → no duplicates; old rows purged |
| **4 — Frontend** | Bell + dropdown + full page + i18n | Polls on 30s/focus; deep links navigate; mark-read updates badge |
| **5 — E2E + hardening** | Playwright specs, rate-limit review, retention config | E2E green; README/ops note for `NOTIFICATION_RETENTION_DAYS` |

## Testing Plan

### Backend unit (`apps/erp/backend/tests/unit/notifications/`)

- `create_notification` inserts row for recipient; params JSONB round-trips.
- Dedupe: same `(user_id, type, dedupe_key)` twice → 1 row (`ON CONFLICT DO NOTHING`).
- `list_notifications`: pagination bounds (page/per_page, max 100), `unread_only` filter,
  ordering newest-first.
- `mark_read`: own ids only; unknown/foreign id → no-op or 404; empty ids → all own rows;
  sets `read_at`; returns count.
- `get_unread_count` scoped to user.
- `delete_expired` removes rows past retention only, in 1,000-row batches: loop
  terminates once a batch returns < 1,000; 2,500+ expired rows all get purged.

### Backend integration (`apps/erp/backend/tests/integration/`)

- 401 without cookie on all three endpoints.
- Emitters fire on the real flows: create pending refund → manager+secretary rows;
  withdrawal expense → manager row; closure unlock → manager row; grade saved → teacher row.
- Origin-flow regression: the 221 existing tests remain green (emitter failure must not
  change any response).
- Daily job idempotence: run twice → single `unclosed_day:{date}` row.

### Frontend E2E (`apps/erp/frontend/tests/e2e/` — Playwright)

- Bell shows badge count matching `/unread-count`.
- Open dropdown → items render bilingual; click item → navigates to deep link + badge
  decrements.
- "Mark all read" → badge clears; full page shows history with unread filter.
- Polling: mocked/unreachable API must not crash the shell (error state hidden).

## Security Review Points

- `POST /read` payload validated (`ids` array of UUIDs, max 100).
- Ownership enforced on every read path — no IDOR (test with a second user's token).
- Rate limiting: leave read endpoints unthrottled (cheap indexed queries); if needed,
  apply `limiter` (existing slowapi pattern) to `POST /read` at 30/min.
- No secrets, no PII beyond names/amounts already visible in the app; amounts are
  already shown to these roles on dashboards.
- Cleanup job is the only delete path (batched); it never touches read/unread distinction.

## Rollout & Ops

- Env var `NOTIFICATION_RETENTION_DAYS` (default 90) read in `app/core/config.py`.
- `ops/changelog.md` entry + `docs/operations/active-task.md` update when started.
- No impact on existing tables; zero-downtime deploy: migration is additive.
