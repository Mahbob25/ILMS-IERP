# Changelog

## 2026-08-02 — Cloud deployment + docs cleanup

- **Infra:** Cloudflare Tunnel (cloudflared) added to production compose; Caddy switched to HTTP-only `:80` (TLS handled by Cloudflare); Caddy host ports removed — no public ports on the server
- **Deploy:** `uploads_data` named volume so uploads survive container recreation; `.env.example`; `scripts/deploy.sh` (build → migrate → up) and `scripts/backup.sh` (pg_dump + uploads archive, 14-day retention)
- **Docs:** cloud deploy guide (`operations/cloud-deploy.md`); completed plans/audits moved to `archive/`; launch guide condensed to a checklist

## v1.7 ERP & Financial System (July 2026)

Abolished the `terms`/semesters concept. Courses are now independent stateful entities. Added a full financial engine.

### Phases 1-9 — Code Complete

| Phase | Change |
|-------|--------|
| Phase 1 | Database: payments, expenses, teacher_wallets, daily_closures tables; drop terms |
| Phase 2 | RBAC: admin→manager rename, secretary role, `require_role()` gates |
| Phase 3 | Stateful courses: pending/active/completed status, quota validation, activation |
| Phase 4 | Financial engine: payments, revenue split, teacher wallets, receipt numbers |
| Phase 5 | Expenses: general expenses, teacher withdrawals, secretary advances |
| Phase 6 | Daily closure state machine: close, lock, unlock request workflow |
| Phase 7 | Frontend: RefreshButton, role-based sidebar, student detail page, POS |
| Phase 8 | Role data cleanup: remove `is_superadmin` from responses, use role.name |
| Phase 9 | POS: student autocomplete, quick-amount buttons, receipt preview |

### QA Remediation + Testing

- 221/221 backend tests passing (50 unit, 165 integration, 6 load), 67% coverage
- QA chaos audit findings (20 CRITICAL + 16 HIGH) remediated: DB check constraints, sequences, idempotency keys, rate limiting, CSRF, security headers

### Extra

- Staff payroll module, expense type migration, receipt/voucher templates
- Transaction number on receipts, currency hardcoded in templates

---

## v1.6 Foundation (June 2026)

Initial LIMS MVP with auth system, RBAC, course management, attendance, assignments, grades.
