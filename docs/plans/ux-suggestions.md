# UX Improvement Suggestions — Backlog

**Status:** Proposal · not implemented · prioritize on demand
**Scope:** New features and UX improvements (explicitly NOT performance work)
**Origin:** UX review of v1.7 (2026-08-05) — grounded in what LIMS has today

## Framing

LIMS is a bilingual (AR/EN, RTL) school ERP: RBAC (superadmin/manager/secretary/teacher),
a financial engine (payments, teacher wallets, expenses, daily closures, payroll, POS,
refunds), and academic modules (courses/sections, students, enrollments, attendance,
gradebook, certificates). The suggestions below target the highest-friction UX gaps found
in a walkthrough of the actual pages and flows — not hypothetical features.

## Top 10 Suggestions

### 1. Central notification center (bell + badges) — highest priority

Pending work is scattered: refunds, withdrawals, unlock requests, amendments, pending
grading, unenrolled students, unclosed days — each visible only inside its own dashboard
card. Add a `notifications` table + a header bell (polling; WebSocket later) so each role
sees *their* actionable items with deep links. Turns "hunt for pending work" into
"work comes to you."

**Plan:** `docs/plans/notifications-center.md`

### 2. Global command palette (Ctrl+K)

Search students, sections, courses, employees, and transactions from anywhere and jump
straight to the page. Secretaries register many records; removes 2–3 navigation steps per
lookup. Reuse existing input-sanitization patterns (`lib/utils/input`).

### 3. Bulk actions on tables

- ✅ Mark attendance for a whole section in one grid view
- ✅ Enter grades per section in one screen (row-per-student, editable cells)
- ✅ Batch-print receipts or certificates for an entire section (certificates done — checkbox selection + bulk delete + batch PDF download; receipts still pending)
- Bulk refund selection in the cashier

Today every record opens its own modal; batching collapses repetitive work.

**Plan:** `docs/plans/bulk-actions.md` (certificates v1 implemented 2026-08-06)

### 4. Guided multi-step flows (wizards) for high-frequency tasks

"Register student → enroll → collect payment + print receipt" is currently several separate
pages. Make it one 3-step wizard (student details → section enrollment with discount →
payment + receipt preview). Same idea for "create course → start section → assign teacher."
Fewer page loads, fewer dropped records halfway.

### 5. Guided confirmations instead of native `confirm()`

Destructive financial actions (refunds, withdrawals, unenrollments, cancellations) rely on
native `confirm()`. Replace with a styled modal that forces a reason + live impact summary
(amount, balance after, day-closure implications), with a 30-second soft-undo option.

### 6. Versioned receipts & voucher reprints

Receipts already print — add an audit "reprint" history + note field per reprint. Cashiers
will inevitably need "print again for the parent." Makes reprints traceable, which matters
for the daily-closure workflow.

### 7. Smart dashboard: overdue/risk radar for managers

Beyond pending counts, a server-computed "needs attention" section: days not yet closed,
sections below capacity that should be promoted/cancelled, students with large balances,
teachers with unwithdrawn wallet balances. Ranked by severity, not raw counts.

### 8. Scheduled + email reports

Reports already have a catalog with inputs (`reports` module). Add scheduling (daily
closure summary, weekly revenue, monthly payroll digest) delivered per role. Reuses the
report engine; removes the need to remember to run them.

### 9. Calendar views

- Daily closures calendar (which days are closed/unclosed, who approved)
- Attendance heatmap per section
- Simple course-schedule view

Data already exists; it's a presentation layer that makes time-aware states scannable.

### 10. Student-facing self-service portal (or lightweight statement view)

Full parent/student login to view grades, certificates, receipts, and balance — or a
minimal printable "student account statement" (payments, refunds, balance) secretaries hand
to parents. The richest UX step-up for the institution's real customers.

## Explicitly out of scope

| Item | Why |
|---|---|
| Dark mode | Deferred by design decision (`frontend-design-rules.md`) |
| AI question generation | Already on roadmap (`plans/current.md`, AI pipeline) |
| Speed/performance work | User excluded it from this backlog |

## Suggested sequencing

| Order | Item | Effort | Notes |
|---|---|---|---|
| 1 | Notification center (#1) | M | Plan exists; independent of everything else |
| 2 | Bulk actions (#3) | M | Attendance/grades first — biggest daily win |
| 3 | Wizards (#4) | L | Follows naturally after enrollment data is settled |
| 4 | Guided confirms (#5) | S | Add during financial refactors |
| 5 | Reprints (#6) | S | Small, piggybacks on receipts |
| 6 | Risk radar (#7) | M | Feeds off notification sources |
| 7 | Command palette (#2) | M | Independent; nice-to-have polish |
| 8 | Calendar views (#9) | M | Presentation layer only |
| 9 | Email scheduling (#8) | L | Needs email infra decision first |
| 10 | Student portal (#10) | XL | Needs auth design for non-staff accounts |

Effort: S = days, M = ~1 week, L = 2+ weeks, XL = multi-sprint.
