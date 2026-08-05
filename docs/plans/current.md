# Current Direction — Roadmap

**Status as of:** 2026-08-06

## Done

- **v1.7 ERP & Financial System** shipped — courses without terms, full financial engine (payments, teacher wallets, expenses, daily closures), staff payroll, POS, receipts/vouchers
- QA chaos remediation complete — 221/221 tests passing, security hardening (idempotency, rate limiting, CSRF)
- **Reports module (v1.8) shipped** — 12-report catalog, full CSV/print/PDF export, permission gating, 97% coverage on the module (see `archive/plans/reports-module.md`)
- **Financial Records Center shipped** — centralized read-only archive of receipts/vouchers/refunds with search/filter/reprint (see `archive/plans/financial-records-center.md`; zero-migration constraint upheld)
- Cloud deployment prep: Cloudflare Tunnel ingress, prod compose ready, deploy/backup scripts

## Now

**1. Cloud deployment (AWS EC2 / GCP VM)**
- Provision VM per `operations/cloud-deploy.md`, install Docker, create `.env`, run tunnel + `deploy.sh`
- Gate: `https://aldrasat.edu` live behind Cloudflare Tunnel

**2. Post-launch reliability**
- Backup verification (restore drill from pg_dump), Sentry alerting tuned, load smoke test

**3. Reports E2E polish**
- Playwright E2E specs written (`frontend/tests/e2e/reports-export.spec.ts`, `browser/features/reports-export-ui.spec.ts`) but not yet exercised against a live stack — needs `docker compose up` + seeded users

## Next

**4. AI Ingestion Pipeline** (paused since v1.7 kickoff, resume after deploy)
- Document upload & parsing (PDF/DOCX)
- Gemini embeddings & text generation
- pgvector semantic search (RAG)
- Concept map extraction & DAG
- Question generation & teacher approval

**5. Coverage backlog**
- Raise backend coverage from 67% → 80%: `financial_service`, `ledger_service`, `voucher_service`, `academic/service` (gaps listed in `archive/plans/qa-chaos-remediation/phase-10-status.md`)
