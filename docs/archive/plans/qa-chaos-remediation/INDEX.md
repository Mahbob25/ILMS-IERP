# QA & Chaos Engineering Remediation — Parallel Execution Strategy

**Date:** 2026-07-13
**Source:** `docs/qa-chaos-audit.md` (305 lines, 20 CRITICAL + 16 HIGH findings)

## Dependency Graph

```
Phase 1 ───┬──────────────┬──────────────┐
(DB Check)  │              │              │
            ├──► Phase 2  ├──► Phase 5   │   ← Schema-only phases depend
            │   (Sequences)│   (Idempot.) │     on Phase 1 migration head
            │              │              │
Phase 3 ────┤              │              │
(Conditional│              │              │
  UPDATE)   │              │              │
            ├──────────────────────────────┤
Phase 4 ────┤             ^               │
(SELECT FOR │             │  No schema     │
  UPDATE)   │             │  dependencies  │
            ├─────────────┘               │
Phase 6 ────┤                             ├──► Phase 10
(Backend    │                             │   (Testing)
  silent    │                             │
  failures) │                             │
            ├─────────────────────────────┤
Phase 7 ────┤                             │
(Infra)     │                             │
            ├─────────────────────────────┤
Phase 8 ────┤                             │
(Security)  │                             │
            ├─────────────────────────────┤
Phase 9 ────┘                             │
(Frontend)                                │
                                          │
All phases 1-9 must be MERGED ────────────┘
before Phase 10 begins.
```

**Merge order (strict):** Phase 1 → Phase 2 → {3,4,5,6,7,8,9} any order → Phase 10

**Rationale for serial schema phases:** Phase 1 sets the Alembic migration head. Phases 2 and 5 create new tables/sequences that branch from Phase 1's head. If they start before Phase 1 merges, they produce orphan migration chains. All other phases (3,4,6,7,8,9) have zero schema dependencies — they modify only application logic.

## Agent Assignment

| Phase | Name | Agent Type | Est. Days | Files Owned | Audit Items |
|-------|------|-----------|-----------|-------------|-------------|
| 1 | DB CHECK Constraints + Partial Unique Index | DB Engineer | 1 | Alembic migration only | D01–D13, S21 |
| 2 | DB Sequences for Numbers | DB Engineer | 1 | Alembic migration only | R01–R04, S29 |
| 3 | Conditional UPDATE Patterns + Orphaned State Transactions | Backend A | 3 | `academic/service.py`, `academic/cancellation_service.py`, `ledger_service.py`, `lms/cashier_service.py`, `lms/compensation_service.py` | R08–R12, O01–O06, O08, S15, S25, S27 |
| 4 | SELECT FOR UPDATE + Concurrency Locks | Backend B | 2.5 | `academic/service.py` (enrollment), `lms/financial_service.py`, `ledger_service.py` (amendment) | R05–R07, R13–R14, S16, S19–S20, S23–S24, S26, S30, S32 |
| 5 | Idempotency Key Middleware | Backend C | 2 | `app/middleware/idempotency.py` (CREATE), `app/modules/models.py` (idempotency_keys table, CREATE), Alembic migration, all `POST` routers (EDIT), `apps/erp/frontend/lib/api.ts` (EDIT — interceptor) | S01, S13 |
| 6 | Backend Silent Failures — Logging & Error Propagation | Backend D | 1.5 | `academic/service.py` (F01, F02, F11), `lms/financial_service.py` (F03), `academic/cancellation_service.py` (F10) | F01–F03, F10–F11, S14, O07 |
| 7 | Infrastructure & Deployment | DevOps | 2.5 | `Dockerfile`, `.github/workflows/ci.yml` (CREATE), `app/main.py` (EDIT — Sentry), `apps/erp/frontend/app/layout.tsx` (EDIT — Sentry), `infrastructure/caddy/Caddyfile` (EDIT — tls), `apps/erp/backend/scripts/` (backup) | I01–I03, I07, I09–I13 |
| 8 | Rate Limiting + CSRF + Security Headers | Backend E | 1.5 | `infrastructure/caddy/Caddyfile` (EDIT — headers), `app/middleware/csrf.py` (CREATE), `app/middleware/rate_limit.py` (EDIT), `tests/test_e2e.py` (EDIT — creds removal if I13 not done) | I04–I06, I08 |
| 9 | Frontend Resilience — UX, Error States, Input Validation | Frontend | 3 | `apps/erp/frontend/lib/api.ts` (EDIT), `apps/erp/frontend/components/AuthContext.tsx` (EDIT), all frontend page components (EDIT — form buttons, error display), `apps/erp/frontend/app/*/error.tsx` (CREATE), `apps/erp/frontend/app/*/loading.tsx` (CREATE) | S02–S06, S09, S11–S12, S17–S18, S22, F04–F09 |
| 10 | Testing | QA | 5 | `apps/erp/backend/tests/` (CREATE/EDIT), `apps/erp/frontend/tests/` (CREATE/EDIT) | All fix items via tests |

## Parallel Schedule

```
Week 1:  ████████████████  Phase 1 (DB constraints, sets migration head)
Week 1:  ████████████████  Phase 3 (conditional UPDATE, no schema deps)
Week 1:  ████████████████  Phase 4 (SELECT FOR UPDATE, no schema deps)
Week 1:  ████████████████  Phase 6 (silent failures, no schema deps)
Week 1:  ████████████████  Phase 7 (infra, no schema deps)
Week 1:  ████████████████  Phase 8 (security, no schema deps)
Week 1:  ████████████████  Phase 9 (frontend, no schema deps)

         ↑ Phase 1 merges at end of Week 1 ↑

Week 2:  ████████████████  Phase 2 (sequences — needs Phase 1 head)
Week 2:  ████████████████  Phase 5 (idempotency — needs Phase 1 head)
Week 2:  ████████████████  Phase 3 continues (if >1 day)
Week 2:  ████████████████  Phase 4 continues
Week 2:  ████████████████  Phase 6 wraps (1.5 day)
Week 2:  ████████████████  Phase 7 continues
Week 2:  ████████████████  Phase 8 wraps (1.5 day)
Week 2:  ████████████████  Phase 9 continues

         ↑ Phases 2–9 merged by end of Week 2 ↑

Week 3:  ████████████████  Phase 10 (testing, integration, E2E)
Week 4:  ████████████████  Phase 10 continues (load tests, visual regression)

Total wall-clock: 3.5–4 weeks
Total effort: ~23 days
```

## Merge Conflict Avoidance

| Strategy | Detail |
|----------|--------|
| **File ownership** | Each phase owns specific files. See Agent Assignment table above. |
| **Shared files: `academic/service.py`** | Phase 3 edits `complete_section()` (line ~300), `set_final_grades_bulk()` (line ~740), `cancel_section()` (~line 400). Phase 4 edits enrollment capacity check (~line 200) and payment remaining-balance check (~line 180). Phase 6 edits lines 352–356 and 754–758 only. **Each edits a different set of functions — no two phases modify the same function.** |
| **Shared files: `ledger_service.py`** | Phase 3 edits contract status transitions (activate, settle, cancel). Phase 4 edits amendment approval wallet lock (different function). **Different functions — safe.** |
| **Shared files: `apps/erp/frontend/lib/api.ts`** | Phase 5 adds idempotency-key interceptor (new function). Phase 9 fixes F04 (promise at line 45), F09 (error discrimination), and `isRedirectingToLogin` (line 16). **Different sections — safe.** |
| **Shared files: `infrastructure/caddy/Caddyfile`** | Phase 7 edits TLS section. Phase 8 adds security headers and rate limiting. **Add headers at the END of the server block — do not edit TLS lines.** |
| **Migration files** | Phase 1 creates the first migration (head A). Phase 2 migration depends on head A. Phase 5 migration depends on head A (or head B if Phase 2 merged first). **Phase 1 must merge first.** |
| **No shared branches** | Each phase works on its own branch. No agent commits to another phase's branch. PRs are reviewed and merged by the orchestrator in dependency order. |
| **Router additions** | All phases that touch `router.py` add endpoints to the END of the file — never in the middle. |
| **New functions** | Always append new functions AFTER existing ones. Never inline-edit unless explicitly specified in the phase doc. |

## Cross-Cutting Dependencies

| Dependency | Affected Phases | Detail |
|-----------|----------------|--------|
| Alembic migration head | 2, 5 | Phase 1 sets the migration head. Phases 2 and 5 must base their migrations on Phase 1's head revision ID. |
| Idempotency middleware | All POST endpoints | Phase 5 creates middleware that Phase 3 and 4 POST endpoints inherit automatically (FastAPI middleware applies globally). No code change needed in Phase 3/4. |
| DB CHECK constraints | 3, 4, 6 (logic) | Phases 3, 4, 6 benefit from the constraints Phase 1 creates but don't depend on them for correctness (the logic fixes work independently). |
| Caddyfile changes | 7 (TLS), 8 (headers) | Phase 7 and 8 both edit Caddyfile. Phase 7 edits TLS section only. Phase 8 adds security headers at the end of the server block. Document append-only boundary. |
| Sentry integration | 6 (logging) | Phase 7 adds Sentry. Phase 6 adds `logger.error()` calls that Sentry will automatically capture. No dependency — logger calls work without Sentry. |
| Rate limiting middleware | All endpoints | Phase 8 adds global rate limiting. Endpoints modified by Phase 3, 4, 5 will be automatically rate-limited when Phase 8 middleware exists. No code change needed. |

## Risk Inventory

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Alembic migration chain broken if Phase 1 not merged first | Migration fails | Enforce strict merge order: Phase 1 → Phase 2/5 |
| Phase 3 + Phase 4 both editing `academic/service.py` | Merge conflict | Map specific function ownership. Each owns different functions. |
| Phase 5 + Phase 9 both editing `apps/erp/frontend/lib/api.ts` | Merge conflict | Phase 5 adds at interceptor section (~end). Phase 9 edits lines 16, 45, and error handler. Different lines. |
| Phase 7 + Phase 8 both editing Caddyfile | Merge conflict | Phase 7 edits TLS stanza. Phase 8 appends headers to existing server block. |
| Testing (Phase 10) depends on ALL fixes merged | Cannot start until Week 3 | Schedule Phase 10 as the final serial phase. |
