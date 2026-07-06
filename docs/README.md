# LIMS Documentation

**Learning Institution Management System** — Lean MVP v1.7

> FastAPI + Next.js + PostgreSQL 16 (pgvector) — 4 containers, 4 backend modules, 22 database tables.

## Architecture

| File | What it covers |
|------|----------------|
| `architecture/overview.md` | Tech stack, container layout, modules, auth flow, RBAC, key decisions |
| `architecture/database-schema.md` | All 22 tables with columns, types, FKs, relationships |
| `architecture/memory.md` | Immutable rules — MUST be followed by every session |
| `architecture/frontend-design-rules.md` | Design language: Professional Minimalist, colors, typography |

## Plans

| File | What it covers |
|------|----------------|
| `plans/current.md` | Active v1.7 ERP requirements — the current direction |
| `plans/Plan-v1.6.md` | Original MVP foundation plan (archived reference) |

## Guides

| File | What it covers |
|------|----------------|
| `guides/development.md` | Setup, Docker vs local, common commands, troubleshooting |
| `guides/security.md` | Active security posture + deferred improvements |

## Operations

| File | What it covers |
|------|----------------|
| `operations/active-task.md` | What's being worked on right now |
| `operations/changelog.md` | Version history — v1.6 → v1.7 |
| `operations/deletion-log.md` | Record of removed code and dependencies |
| `production-readiness-assessment.md` | Production readiness assessment — scorecard, gap analysis, CI/CD blueprint |
