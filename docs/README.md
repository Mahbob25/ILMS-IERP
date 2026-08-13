# LIMS Documentation

**Learning Institution Management System** — FastAPI + Next.js + PostgreSQL 16 (pgvector)

Deployment: cloud VM (AWS EC2 / GCP) behind a Cloudflare Tunnel — no public ports.

## Live docs

| File | What it covers |
|------|----------------|
| `plans/portal-implementation-plan.md` | **Student & Parent Portal — Implementation Plan** — BFF + AI service, phases, file map, risks (implements `portal-architecture.md`) |
| `plans/ai-pipeline-implementation-plan.md` | AI pipeline — curriculum ingestion + RAG question generation (Lean MVP, updated 2026-08-13 for portal `ai-service` queues) |
| `plans/current.md` | Current direction: roadmap (deployment → AI pipeline) |
| `architecture/overview.md` | Tech stack, container layout, modules, auth flow, RBAC, key decisions |
| `architecture/database-schema.md` | Database tables with columns, types, FKs, relationships |
| `architecture/portal-architecture.md` | **Student & Parent Portal** — isolated BFF + AI service architecture (recommended). Caddy subdomains, cache, auth isolation, diagrams |
| `architecture/memory.md` | Immutable rules — MUST be followed by every session |
| `architecture/frontend-design-rules.md` | Frontend design language: Professional Minimalist, colors, typography |
| `architecture/templates-design-rules.md` | Receipt / voucher / certificate template design rules |
| `guides/development.md` | Setup, Docker vs local, common commands, troubleshooting |
| `guides/security.md` | Active security posture + deferred improvements |
| `guides/user-testing-guide.md` | Arabic 7-day user testing guide (`.html`/`.pdf` also available; regenerate via `scripts/build_testing_guide.py`) |
| `operations/active-task.md` | What's being worked on right now |
| `operations/changelog.md` | Version history |
| `operations/cloud-deploy.md` | Cloud VM deployment guide: provision, tunnel, deploy, backup |
| `operations/deletion-log.md` | Record of removed code and dependencies |

## Archive

Completed plans, audits, and feature docs live in `archive/` (kept for history):

- `archive/plans/` — implemented plans: v1.6 foundation, v1.7 ERP phases, section lifecycle, QA-chaos remediation, payroll, refunds, tunnel setup, and more
- `archive/audits/` — `qa-chaos-audit.md` (20 CRITICAL + 16 HIGH findings, since remediated), `production-readiness-assessment.md`
- `archive/features/` — completed feature docs: `expenses-page.md`, `staff_payroll_summary.md`
- `archive/launch-guide-v2.md` — full version of the launch guide, superseded by `production-launch-guide.md` + `operations/cloud-deploy.md`
