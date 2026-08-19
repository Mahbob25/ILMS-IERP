# Current Direction — Roadmap

**Status as of:** 2026-08-17

## Done

- **v1.7 ERP & Financial System** shipped — courses without terms, full financial engine (payments, teacher wallets, expenses, daily closures), staff payroll, POS, receipts/vouchers
- QA chaos remediation complete — 221/221 tests passing, security hardening (idempotency, rate limiting, CSRF)
- **Reports module (v1.8) shipped** — 12-report catalog, full CSV/print/PDF export, permission gating, 97% coverage on the module (see `archive/plans/reports-module.md`)
- **Financial Records Center shipped** — centralized read-only archive of receipts/vouchers/refunds with search/filter/reprint (see `archive/plans/financial-records-center.md`; zero-migration constraint upheld)
- Cloud deployment prep: Cloudflare Tunnel ingress, prod compose ready, deploy/backup scripts
- **Settings — Phases 1, 3, 4 shipped** — self-service password/language (Phase 1, no migration) + superadmin System tab with `system_settings` KV (institute profile + runtime defaults, migration `202608060005`) + Coming soon for notifications/logo upload + bilingual polish; Phase 2 (notifications) remains Coming soon per v1 decision (see `archive/plans/settings-page.md`)
- **Student & Parent Portal — Phases 0–3 shipped** (2026-08-14) — portal BFF (`apps/portal/backend`, isolated OTP auth + JWT cookies + read-through Redis cache), portal web (`apps/portal/frontend`, Next.js 14 standalone, bilingual RTL, grades/attendance/fees/settings), Redis Streams + DLQ queue (`ai:student`/`ai:ingestion`), Playwright E2E suite green, backup/DR (redis snapshot + restore-drill), Caddy hardening (2MB body cap). **AI is deferred** — student AI features labeled "coming soon"; the real `ai-service` + teacher ingestion ship later (portal plan Phase 4)
- **Unified login + auto-generated portal credentials shipped** (2026-08-17) — single email/password login at `aldirasat.com/{ar|en}/login` for staff, students, and parents; students/parents are redirected to `portal.aldirasat.com` with a one-time SSO ticket (60s, single-use, `PORTAL_SSO_SECRET`). Phone/OTP removed from the portal. Students created via the ERP now auto-provision `portal.users` accounts (username = email, password = phone, bcrypt) plus an optional parent account (parent email/phone fields on the student form) with a verified `parent_links` row. Portal users can change their password from the Settings page.
- **Frontends moved to Vercel** (2026-08-17) — the ERP and portal Next.js frontends are hosted on Vercel (`*.vercel.app`, custom domain later). EC2 serves APIs only: backend :8000, portal BFF :8001, database, redis, ai-service. Caddy is an API-only gateway (`/api/v1`, `/uploads` → backend; `/api/*` → portal BFF). Both frontends rewrite `/api/*` to the EC2 origin; no SSR/API-route changes were needed (both are fully client-side rendered).

## Now

**1. Vercel frontends live + EC2 API bridge**
- Both frontends on Vercel (`*.vercel.app`), EC2 serves APIs only (backend :8000, portal BFF :8001 via Caddy).
- **Pending (manual AWS):** open port 80 in security group `launch-wizard-1` to `0.0.0.0/0` so Vercel can reach the EC2 APIs; verify `curl http://13.50.176.4/api/v1/health` → 200.
- Add custom domain (`aldirasat.com` / `portal.aldirasat.com`) in Vercel when bought; update `NEXT_PUBLIC_*` envs and rewrite origins.

**2. Post-launch reliability**
- Backup verification (restore drill from pg_dump), Sentry alerting tuned, load smoke test
- Portal load test in isolation (`portal-backend` scaled to 2–3, Caddy handles it, ERP untouched)

**3. Reports E2E polish**
- Playwright E2E specs written (`apps/erp/frontend/tests/e2e/reports-export.spec.ts`, `browser/features/reports-export-ui.spec.ts`) but not yet exercised against a live stack — needs `docker compose up` + seeded users

## Next

**4. Portal AI (Phase 4 — deferred)**
- Extract the real `ai-service` with two queues (`ai:student` HIGH, `ai:ingestion` LOW), streaming endpoint, RO RAG contract
- Curriculum vectorization lifecycle (§9): deterministic `chunk_id MD5`, hotfix, orphan delete, resume from `current_state`
- Teacher flow: `POST /curriculum/documents` → 202 → LOW queue → bulk upsert → DAG → RAGAS → SSE `COMPLETED`
- Student AI features (explain/revision) go live

**5. Coverage backlog**
- Raise backend coverage from 67% → 80%: `financial_service`, `ledger_service`, `voucher_service`, `academic/service` (gaps listed in `archive/plans/qa-chaos-remediation/phase-10-status.md`)
