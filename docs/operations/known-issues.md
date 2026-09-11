# Known Issues & Deferred Work

Tracked backlog of limitations, deliberate deferrals, and technical debt discovered during
implementation. Each entry states **what** it is, **why** it exists, and **what it would take**
to resolve. Nothing here is a bug report — everything listed is known and accepted for now.

Last updated: 2026-09-11

---

## Deployment prerequisites

Things that must be run/deployed — the code is merged but the live system needs a step.

- **Run `alembic upgrade head` for the `page_portal_accounts` permission** (migration
  `202609110001`). Without it the Portal Accounts admin page stays hidden for `manager` and
  `secretary` (superadmin always bypasses). The page itself is already committed.
- **Redeploy the ERP backend and the portal BFF** to get `GET /api/v1/internal/portal/fees`
  and `GET /api/me/fees`. If the BFF is deployed but the ERP is not, the dashboard fees tile
  degrades to "Fees unavailable" (it does not break the rest of the page).

---

## Portal

### `/me` student self-view was previously reverted, then reintroduced

`get_linked_students` now resolves a **student's own** record via `portal.student_links` before
falling back to verified `portal.parent_links`. Before this, a student account received
`linked_students: []` and the entire portal dashboard rendered its empty state.

Note: `fix(portal): show linked students for student accounts, not just parents` was committed
and then **reverted** earlier in the project's history. It was reintroduced deliberately during
the dashboard work. If that revert was driven by a product decision rather than an accident,
this needs revisiting — the dashboard now depends on it.

### Today's Schedule — deferred (no recurrence model)

`SectionDTO` exposes only `id, course_name, status, start_date, end_date`. The underlying
`CourseSection` model does have `class_time`, `class_duration_minutes`, `classroom`, and
`teacher_id`, but:

- none of those are selected by the portal query, and
- **there is no `day_of_week` / recurrence column at all.**

So "which classes meet today" is not representable in the current schema. Exposing the fields
is a small change; deciding how recurrence works (day-of-week set? weekly pattern? explicit
schedule rows?) is a schema/product decision and should be made first.

### Notifications & announcements are not reachable by the portal

- **Per-user notifications**: the ERP `Notification` model is keyed on ERP `users.id`. Portal
  users have no ERP user record, so a student/parent notification feed would need a new target
  (e.g. `portal.users.id`) or a mapping table.
- **School announcements**: `Announcement` exists and the ERP already serves
  `GET /api/v1/public/announcements` unauthenticated — but the portal BFF does not proxy it.
  This one is cheap: a small BFF endpoint plus a dashboard tile.

### Online payments ("Pay Now") are not possible today

There is **no payment gateway, no invoice model, and no amount-due model** anywhere in the
codebase. Payments are recorded by staff in the ERP. Fees are therefore display-only in the
portal; the dashboard shows an outstanding balance with no payment action. Real online payment
would require gateway selection, webhooks, receipt reconciliation, and refund handling.

### Attendance rate is computed client-side

The portal dashboard computes the attendance percentage in the frontend from the full
`/me/attendance` record list (which is unpaginated). There is no server-side aggregate on the
portal path. This is fine at current volumes; if a student accumulates thousands of records,
add a server-side aggregate instead of shipping them all.

### Grades: only section-level final grades are exposed

The portal exposes `final_grades` (`final_score`, `graded_at`) only. There are no
assignment-level scores on the portal path, even though the LMS module has
`assignments` / `submissions` / `grades` tables with `Assignment.max_score` and `Grade.score`.

Consequence: the dashboard's "Overall average" is the mean of **section final scores**, not a
weighted average of assignments. `final_score` *is* a 0–100 percentage (DB CHECK constraint,
`get_grade_label` bands at 90/80/70/60), so displaying `%` is correct — but a true
assignment-weighted subject average needs the LMS grades exposed.

---

## Attendance

### No DB-level constraint on `attendance_records.status`

`status` is a plain `String(20)` with `server_default "present"` and **no CHECK constraint**.
Valid values in practice are `present`, `absent`, `late`, `partial`, `excused`. This is
pre-existing (not introduced by the `partial` work) but means any string can be persisted;
the API accepts arbitrary values too. Adding a CHECK constraint (or a Postgres enum) would
make the status set self-documenting and prevent typos, at the cost of a migration plus a
backfill/validation of existing rows.

### `partial` overlaps `late`

`late` already means "arrived late"; `partial` means "attended part of the session". These can
describe the same real-world event, and a teacher could reasonably pick either. This was
raised before the `partial` status was added and the decision was to ship it anyway. If
attendance reporting looks ambiguous later, consider collapsing the two or defining explicit
guidance for when each applies.

---

## Cross-cutting

### The attendance-rate policy is duplicated across two languages

A `partial` mark counts as attended: `rate = (present + partial) / total`.

This rule now exists in two places that cannot import each other:

- **Python** — `attendance_totals()` in `apps/erp/backend/app/modules/reports/service.py`
- **TypeScript** — the `stats` memo in
  `apps/portal/frontend/app/[locale]/(dashboard)/dashboard/page.tsx`

The Python function docstring points at the portal file, but **nothing enforces the two stay in
sync**. If the policy changes (e.g. half-credit for partial), both must be updated or the ERP
report and the portal dashboard will disagree on the same student's rate.

### `get_fees_summary` is ORM-based in an otherwise raw-SQL module

`portal_internal/service.py` is raw SQL by convention, but the fees query deliberately uses the
ORM so it can reuse the canonical `get_enrollment_price_components_batch()` helper from
`academic/pricing.py`. Re-deriving pricing in SQL would let portal balances drift from the ERP
student report. This is intentional and commented in the code — don't "fix" it back to raw SQL.

### Recharts is lazy-loaded on the dashboard

`AttendanceDonut` is loaded via `next/dynamic` with `ssr: false`. Importing recharts directly
took the dashboard route from 5.8 kB to ~103 kB (first-load 115 kB → 209 kB). Keep the dynamic
import when touching that page.

---

## Verification gaps

Untested paths — these need a running stack, so they were not exercised during implementation.

- **Portal dashboard live flow**: student login end-to-end (the core fix), a parent with two
  children switching students, force-refresh updating `X-Data-As-Of`, and a fees-endpoint
  failure degrading only its own tile.
- **Portal Accounts admin page**: list/search/filter, password reset (both modes), impersonation
  landing on the portal, and the permission gate for `manager` / `secretary` / `teacher`.
- **`partial` status in a real session**: teacher marks partial, then confirm it appears in the
  student-detail counts, section report, print sheet, CSV export, and the portal dashboard.
