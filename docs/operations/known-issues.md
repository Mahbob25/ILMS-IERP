# Known Issues & Deferred Work

Tracked backlog of limitations, deliberate deferrals, and technical debt discovered during
implementation. Each entry states **what** it is, **why** it exists, and **what it would take**
to resolve. Nothing here is a bug report — everything listed is known and accepted for now.

Last updated: 2026-09-12

---

## Deployment prerequisites

Things that must be run/deployed — the code is merged but the live system needs a step.

- **Run `alembic upgrade head` for the `page_portal_accounts` permission** (migration
  `202609110001`). Without it the Portal Accounts admin page stays hidden for `manager` and
  `secretary` (superadmin always bypasses). The page itself is already committed.
- **Redeploy the ERP backend and the portal BFF** to get `GET /api/v1/internal/portal/fees`,
  `GET /api/me/fees`, and the announcements pair
  (`GET /api/v1/internal/portal/announcements` / `GET /api/me/announcements`). If the BFF is
  deployed but the ERP is not, the dashboard's fees panel degrades to "Fees unavailable" and the
  announcements section is omitted — neither breaks the rest of the sheet.

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
- **School announcements**: reachable now. The portal proxies them through the service-key gated
  internal surface (`GET /internal/portal/announcements` → `GET /me/announcements`) and the
  dashboard renders them as a ruled notice list. The unauthenticated ERP route
  (`GET /api/v1/public/announcements`) is deliberately *not* used: the BFF only talks to the
  internal prefix, and opening a second trust path for one panel was not worth it. Notices are
  institute-wide, so the BFF caches them under the fixed pseudo-student key `global` — one entry
  shared by every account.

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

### The dashboard makes 5 proxied reads per child

The sheet needs attendance, grades, sections, payments and fees for the focused child, and the
guardian glance rail needs the headline figures for every child. There is no server-side summary
on the portal path, so each child costs 5 parallel `Promise.allSettled` reads (one failing
endpoint degrades only its own panel).

Eager loading is capped at `EAGER_LIMIT = 4` children in
`app/[locale]/(dashboard)/dashboard/page.tsx`; beyond that a child's data is fetched when they
are focused. If the BFF ever grows a `/me/overview` aggregate, that is the natural replacement —
it would also remove the per-child scaling cliff for large families.

### The dashboard renders Gregorian dates; the older pages render Hijri

`ar-SA` in `Intl.DateTimeFormat` defaults to the Umm al-Qura calendar, so the pre-existing
grades / attendance / fees pages label a Gregorian DB date with a Hijri month name. The register
components pin `ar-SA-u-ca-gregory` (`DATE_LOCALE` in `lib/utils/register.ts`) because the
attendance ribbon groups by **Gregorian** month — a Hijri label there would name the wrong
bucket.

Consequence: the dashboard and the three older pages disagree about how the same date reads.
Unifying the portal on one calendar is a small change to those pages, but it is a product
decision first (which calendar does the institute actually publish dates in?).

### The public status page cannot be reached anonymously

`app/[locale]/page.tsx` ("بوابة الطلاب تعمل") is served, but `AuthProvider` mounts on **every**
route (`app/[locale]/layout.tsx`), calls `GET /auth/me`, and on 401 the interceptor in
`lib/api.ts` cannot refresh and hard-navigates to the marketing login. An anonymous visitor
therefore never stays on the status page — verified in a real browser, not inferred.

The E2E case for that page is `test.fixme()`d with this reason. Fixing it properly means
exempting the public route from the auth bounce in `AuthProvider` (or moving that page out of
the `[locale]` layout) — a product call, since the page's own "Sign In" link implies it is meant
to be viewed.

### Portal course history includes withdrawn sections (by design)

`/me/sections` returns sections whose enrollment was **soft-deleted** (withdrawn), flagged via
`withdrawn`, so the student's academic record is complete. For an actor with a withdraw-then-
re-enroll pair, `DISTINCT ON (cs.id)` collapses them to one row preferring the live enrollment.

This is **deliberately different from the ERP enrolment views**, which filter deleted
enrollments out — so the portal course list and an ERP enrolment list will not show the same
number of rows for the same student. Don't "fix" the portal query to match the ERP without
confirming the product intent.

### Grades: only section-level final grades are exposed

The portal exposes `final_grades` (`final_score`, `graded_at`) only. There are no
assignment-level scores on the portal path, even though the LMS module has
`assignments` / `submissions` / `grades` tables with `Assignment.max_score` and `Grade.score`.

Consequence: the dashboard's «متوسط الدرجات» / "Course average" is the mean of **section final
scores**, not a weighted average of assignments — which is exactly why it is *not* labelled
«المعدل» (GPA). `final_score` *is* a 0–100 percentage (DB CHECK constraint, `get_grade_label`
bands at 90/80/70/60), so displaying `%` is correct — but a true credit-weighted average needs
`courses.credits` on `SectionDTO`, and a true assignment-weighted average needs the LMS grades
exposed.

---

## Attendance

### No DB-level constraint on `attendance_records.status`

`status` is a plain `String(20)` with `server_default "present"` and **no CHECK constraint**.
Valid values in practice are `present`, `absent`, `late`, `partial`, `excused`. This is
pre-existing (not introduced by the `partial` work) but means any string can be persisted;
the API accepts arbitrary values too. Adding a CHECK constraint (or a Postgres enum) would
make the status set self-documenting and prevent typos, at the cost of a migration plus a
backfill/validation of existing rows.

### `partial` was briefly removed by a revert — check for orphaned rows before ever removing it again

Commit `acf8967` ("revert: pull the portal dashboard work back out of main") also removed the
`partial` status: `attendance_totals()`, `partial_count` on `StudentAttendanceSummary`, the
export column and column order, six ERP frontend surfaces, and its 173-line test — because the
dashboard work and the `partial` work happened to sit in the same revert.

That mattered beyond a missing feature. With **no CHECK constraint** on
`attendance_records.status`, any `partial` row written before the revert became invisible to
`total_sessions = present + absent + late + excused`, which silently *inflates* the attendance
rate for exactly those students. Both the dashboard and `partial` were restored together.

Before removing `partial` again, look for existing rows first:

```sql
SELECT status, count(*) FROM attendance_records GROUP BY status ORDER BY count(*) DESC;
```

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

This rule exists in two places that cannot import each other:

- **Python** — `attendance_totals()` in `apps/erp/backend/app/modules/reports/service.py`
- **TypeScript** — `attendanceStats()` in
  `apps/portal/frontend/lib/utils/attendance.ts`

Within the portal it is defined **once** (the helper) and shared by the dashboard and the
courses page — do not re-implement it inline in a new page; import the helper. But **nothing
enforces the Python/TypeScript pair staying in sync**. If the policy changes (e.g. half-credit
for partial), both must be updated or the ERP report and the portal will disagree on the same
student's rate.

### `get_fees_summary` is ORM-based in an otherwise raw-SQL module

`portal_internal/service.py` is raw SQL by convention, but the fees query deliberately uses the
ORM so it can reuse the canonical `get_enrollment_price_components_batch()` helper from
`academic/pricing.py`. Re-deriving pricing in SQL would let portal balances drift from the ERP
student report. This is intentional and commented in the code — don't "fix" it back to raw SQL.

### Recharts is no longer used by the portal

The dashboard's donut was replaced by the hand-built `AttendanceRibbon` (the register marks), so
nothing under `apps/portal/frontend` imports recharts any more. That was a deliberate call, not
only a size one: there is **no RTL axis handling anywhere in this repo** (the ERP dashboards
ignore `dir` entirely), and recharts had previously taken the dashboard route from 5.8 kB to
~103 kB. The dashboard now builds in at ~6.4 kB with recharts absent from the bundle.

The dependency is still declared in `package.json`. It is removable, but that is a
`package.json` + lockfile change and was left out of the dashboard work to keep the diff scoped.

When adding a chart to the portal, prefer building it the way `AttendanceRibbon` is built — flex
spans that inherit `dir` — over introducing a chart library.

---

## Verification gaps

Untested paths — these need a running stack, so they were not exercised during implementation.

- **Portal dashboard live flow** — *partly* covered now. The Playwright spec drives the mocked
  BFF through login → sheet → ribbon → course rows → ledger → announcements and asserts the mark
  counts, and the layout was probed for overflow at 375 / 768 / 1280 in both locales (no
  horizontal overflow, nothing escaping `<main>`). Still unverified against a real backend:
  a **student** account's `/me` resolving its own record (the whole point of the self-view fix),
  a guardian with two real children switching focus, `?refresh=1` updating `X-Data-As-Of`, and a
  fees-endpoint failure degrading only its own panel.
- **Portal Accounts admin page**: list/search/filter, password reset (both modes), impersonation
  landing on the portal, and the permission gate for `manager` / `secretary` / `teacher`.
- **`partial` status in a real session**: teacher marks partial, then confirm it appears in the
  student-detail counts, section report, print sheet, CSV export, and the portal dashboard.
- **My Courses page**: that a live section renders under Current with teacher/schedule/grade/
  attendance, a withdrawn course shows its badge and date, and a withdraw-then-re-enroll pair
  appears as a single row.

---

## Deferred by explicit decision

- **Course code and credit hours** are not shown on the portal course cards. The data is
  available (`courses.code`, `courses.credits`) — it was excluded by request, not for lack of
  data. Add the fields to `SectionDTO` if that changes.
- **Per-course drill-down** (assignments, materials per course) — the portal has no data path
  for it; would need new internal endpoints.
