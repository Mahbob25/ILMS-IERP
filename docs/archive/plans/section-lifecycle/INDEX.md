# Section Lifecycle — Parallel Execution Strategy

**Date:** 2026-07-10

## Dependency Graph

```
Phase 1 ──┬──► Phase 2 ──┐
  (Foundation) ├──► Phase 3 ──┤
                ├──► Phase 4 ──┤──► Phase 7 ──► Phase 8
                ├──► Phase 5 ──┤   (Reconcile)   (Testing)
                └──► Phase 6 ──┘   ↑ last parallel
                     (Frontend)      phase to merge
```

- **Sequential gate:** Phase 1 must finish before any other phase starts.
- **Fully parallel:** Phases 2, 3, 4, 5, 6 can run concurrently on separate agents after Phase 1.
- **Sequential gate:** Phase 7 starts after all five parallel phases are merged.
- **Final phase:** Phase 8 runs last, after Phase 7 is merged.

## Agent Assignment

| Phase | Agent | Est. Days | Files Owned |
|-------|-------|-----------|-------------|
| 1 — Foundation | Data Engineer | 2.75 | `models.py`, migrations, API contract |
| 2 — Startup Checks | Backend A | 1.25 | `section_startup_checks.py`, edits to `main.py` |
| 3 — Grade & Payment | Backend B | 1.75 | Edits to `service.py`, `router.py` (complete_section) |
| 4 — Cancellation | Backend C | 4.25 | `cancellation_service.py`, `cashier_service.py`, router edits |
| 5 — Deactivation | Backend D | 1.25 | Edits to `ledger_service.py`, `service.py`, `router.py` |
| 6 — Frontend | Frontend | 5.75 | All UI components, i18n strings |
| 7 — Reconciliation | Backend E | 2.0 | Reporting, monitoring, admin views |
| 8 — Testing | QA | 6.75 | Integration + E2E tests |

## Parallel Schedule

```
Week 1:  ████████████  Phase 1 (all agents blocked)
Week 2:  ████████████  Phases 2, 3, 4, 5, 6 (5 agents parallel)
Week 3:  ████████████  ↑ same (Phase 6 finishes end of week)
Week 4:  ████████████  Phase 7 (after all parallel merged)
Week 5:  ████████████  Phase 8 (testing)
```

## How to Avoid Merge Conflicts

| Strategy | Detail |
|----------|--------|
| **File ownership** | Each phase owns specific files (see above). No two parallel phases write to the same file except `router.py` and `service.py`. |
| **Router additions** | Phases 3, 4, 5 all add to `router.py` but at different route paths. Each agent adds routes to the **end** of the file. |
| **Service additions** | Phase 3 edits `complete_section()` inline. Phase 5 appends `deactivate_section()` as a **new function** after existing ones. No inline conflict. |
| **API contract** | Phase 1 produces `api-contract.json`. Phase 6 (frontend) works from this contract. Backend phases implement to it. Contract is the source of truth — update it when endpoints change. |
| **No shared branches** | Each parallel phase works on its own branch. Merge in order: Phase 1 → {2,3,4,5,6} (any order) → 7 → 8. |

## Cross-Cutting Dependency: Timezone Module

Phases 2, 3, 4, and 7 import `get_today()` / `utcnow()` from `app/core/timezone.py` (a separate infrastructure task). This module provides the institute-local date (Asia/Riyadh) and replaces all `date.today()` / `datetime.utcnow()` calls. It has no dependencies on any phase code and must exist before these phases begin.

## What Each Phase Receives

- **Phase 1 → Phase 2-6:** DB models exist, migrations applied, API contract published
- **Timezone module → Phases 2, 3, 4, 7:** `get_today()` / `utcnow()` available for date-aware operations
- **Phases 2-6 → Phase 7:** All backend features implemented and merged into main
- **Phase 7 → Phase 8:** Reconciliation features merged, system is feature-complete

## Key Principle

Every phase is **self-contained**. An agent needs only the Phase 1 output (models + API contract) to begin work. No phase calls code written by another parallel phase. Integration between phases is via the database schema and API contracts only.
