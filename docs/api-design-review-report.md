# API Design Review Report

**Author:** API Design Review (per `api-design` skill conventions)
**Target System:** ERP Backend (`apps/erp/backend`), Portal BFF (`apps/portal/backend`)
**Date:** September 17, 2026
**Scope:** Resource naming, HTTP methods/status codes, response & error formats,
pagination/filtering/sorting, auth, rate limiting, leakage, naming consistency,
versioning, and documentation for the full HTTP API surface.

**Method:** exhaustive inventory of every route decorator (~200 endpoints across
20 ERP routers + 4 Portal routers, all mounted under `/api/v1` and `/api`
respectively), then evaluation against the 12-point API Design Checklist.
File:line evidence is given per finding.

---

## Executive Summary

The API surface is well-structured overall: consistent router prefixes, strong
auth coverage, global + per-route rate limiting, CSRF/Idempotency middleware,
and Pydantic validation with FastAPI's native `422` behavior. The main problems
are **two dead routes caused by route-registration order**, **no shared response
envelope**, **three coexisting pagination dialects**, and **unbounded list
endpoints** that return full tables.

| # | Checklist item | Verdict |
| --- | --- | --- |
| 1 | Resource URL naming (plural, kebab-case, no verbs) | ⚠️ Partial — plural nouns used, but `snake_case` paths and verb-heavy action URLs throughout |
| 2 | Correct HTTP methods | ✅ Mostly — one `POST`-for-revoke and `PUT`-for-approve inconsistency |
| 3 | Semantic status codes (201+`Location`, 204, 404/409/422/429) | ⚠️ Partial — correct codes, but **no `Location` header on any 201** |
| 4 | Schema input validation | ⚠️ Partial — Pydantic everywhere except one raw `dict` body and loose `Body()` scalars |
| 5 | Standard error format (`{error:{code,message}}`) | ❌ Fail — FastAPI `{"detail": ...}` everywhere, no machine-readable codes |
| 6 | Pagination on list endpoints | ⚠️ Partial — three dialects (`skip/limit`, `page/per_page`, `limit/offset`) + unbounded lists |
| 7 | Authentication on all non-public routes | ✅ Pass — 2 unauthenticated findings are low-sensitivity (see M-7, L-2) |
| 8 | Authorization checks | ✅ Pass — role gates + teacher-ownership checks + service-key separation |
| 9 | Rate limiting | ✅ Mostly — global defaults + per-route limits; internal routes exempt (L-3) |
| 10 | No internal-detail leakage | ✅ Pass — generic login errors, safe 409 handler, no stack traces |
| 11 | Consistent naming (JSON casing, params) | ⚠️ Partial — JSON is consistently `snake_case` ✅, but query-param dialects differ |
| 12 | Documented (OpenAPI) | ⚠️ Partial — auto-docs exist but are **public in production** with no gating |

**Counts:** 1 high, 8 medium, 6 low. No critical (no auth bypass, no injection,
no secret leak found).

---

## Detailed Findings

### H-1 [HIGH]: `DELETE /certificates/batch` is unreachable (route shadowing)

**File:** `apps/erp/backend/app/modules/academic/router.py:407-418`

```python
@academic_router.delete("/certificates/{cert_id}", ...)   # line 407 — registered FIRST
async def delete_certificate(...)

@academic_router.delete("/certificates/batch", ...)        # line 418 — NEVER matches
async def delete_certificates_batch(...)
```

Starlette matches routes in registration order, so
`DELETE /api/v1/academic/certificates/batch` binds `{cert_id}="batch"`,
fails UUID parsing, and returns `422` — the batch-delete endpoint is dead
code. Any frontend "delete selected" flow built on it is broken.

**Fix:** move the static `/certificates/batch` route above
`/certificates/{cert_id}` (the file already follows static-first ordering for
`GET /certificates/sections`, line 302 vs 322 — apply the same rule to
`DELETE`). Add a regression test hitting `DELETE .../certificates/batch`.

---

### M-1 [MEDIUM]: Deprecated `/users/employees*` routes are shadowed (dead compat layer)

**File:** `apps/erp/backend/app/modules/identity/router.py:629-645` vs `899-918`

`GET /users/{user_id}` (line 629) is registered before the "backward compat"
`GET /users/employees` and `GET /users/employees/{user_id}` (lines 899-918),
so both compat routes bind `user_id="employees"` and return `422` instead of
serving data or a proper `410 Gone`.

**Fix:** either delete the deprecated block (preferred — grep shows no
frontend usage of `/users/employees`) or move it above `/{user_id}` and return
`301`/`410`. Dead compat code that 422s is worse than no compat code.

### M-2 [MEDIUM]: No standard error envelope (no machine-readable codes)

Every error is FastAPI's `{"detail": "human sentence"}` — including the global
`IntegrityError → 409` handler
(`apps/erp/backend/app/core/error_handlers.py:23-26`) and all
`HTTPException(detail=...)` sites. Clients must string-match Arabic/English
sentences (the POS page already does `detail.includes("exceeds remaining
balance")`). There is no `code` field anywhere in the API.

**Fix:** introduce a small `{error: {code, message}}` convention for *new*
endpoints and for the handful of errors clients branch on (payments,
enrollments); keep `detail` for backward compatibility. Full migration is a
v2 task, not a flag day.

### M-3 [MEDIUM]: Three pagination dialects + inconsistent collection envelope

- Academic lists: `skip`/`limit` + `sort_by`/`sort_order`
  (`academic/router.py:44-50`, plus students/enrollments/certificates).
- Unenrollment history: `page`/`per_page`
  (`academic/router.py:1033-1035`, `1051-1053`, `1069-1071`).
- Financial-records search: `limit`/`offset`
  (`lms/router.py:270-271`).
- Envelope is always `{items, total}` (`PaginatedResponse`) — no `page`,
  `total_pages`, or `links`, so clients recompute paging differently per page.

**Fix:** standardize new endpoints on `page`/`per_page` (or keep
`skip`/`limit` — either is fine) and document the one dialect; add
`total_pages` to `PaginatedResponse`. Do not rename existing params (breaking
change for the frontends).

### M-4 [MEDIUM]: Unbounded list endpoints (full-table JSON)

These return **unfiltered, unpaginated arrays**:

- `GET /api/v1/lms/payments` → `list[PaymentResponse]`
  (`lms/router.py:241-255`; filters only, no limit)
- `GET /api/v1/users` → `List[UserResponse]`
  (`identity/router.py:479-494`; role filter only)
- `GET /api/v1/users/teachers`, `GET /api/v1/employees` (same file, no paging)
- `GET /api/v1/lms/expenses`, attendance sessions, notifications (same pattern)

`GET /lms/payments` is the worst: the payments page fetches the entire table
on load. Small today, linear degradation with business growth.

**Fix:** add `limit` (capped, e.g. `le=500`) + `offset`/`page` to these five
routes; frontends already handle `{items,total}` elsewhere, so adopt
`PaginatedResponse`.

### M-5 [MEDIUM]: No `Location` header on any 201 response

All nine `status_code=201` creations (`POST /users`, `/employees`,
`/academic/courses`, `/course-sections`, `/students`, `/enrollments*`,
`/lms/payments`, `/lms/expenses`, `/public/bookings`, `/public/contacts`,
`/announcements`, `/database-backups`) return the created body with no
`Location` header (verified: zero `Location` occurrences in any router).

**Fix:** low-cost, non-breaking — add `Location: <canonical GET URL>` to new
creates first (bookings/contacts are public API surface, start there), then
backfill internal ones.

### M-6 [MEDIUM]: Validation gaps — raw `dict` body + loose `Body()` scalars

- `cancel_section_endpoint(body: dict)` (`academic/router.py:873-882`) reads
  `reason`/`refund_policy` via `.get()` with hand-rolled checks, while its
  sibling `execute_unenroll` uses a proper `UnenrollRequest` schema. The
  OpenAPI schema for this endpoint is effectively `object` — clients get no
  contract.
- `complete_section_endpoint(force: bool = Body(False), reason: str =
  Body(None))` (`academic/router.py:232-239`) has no request model, so the
  body shape is implicit.

**Fix:** add `SectionCancelRequest` / `SectionCompleteRequest` Pydantic models
mirroring `UnenrollRequest` (including the force-requires-reason rule as a
model validator).

### M-7 [MEDIUM]: Versioning gap — Portal BFF is unversioned

ERP serves `/api/v1/*` (`erp/backend/app/main.py`), but the Portal BFF serves
bare `/api/*` (`portal/backend/app/main.py`, `version="0.1.0"`). The BFF is
consumed by a deployed SPA that cannot be force-upgraded, so the first
breaking BFF change has no clean path (no `/api/v2`, no `Sunset` strategy).

**Fix:** mount future BFF routers under `/api/v1` (keep `/api` as an alias
for now) so both backends share one versioning story before v1 needs to
change.

### M-8 [MEDIUM]: `snake_case` resource paths (convention drift)

`course-sections`, `teacher-wallets`, `staff-payroll`, `database-backups`,
`portal-accounts`, `daily-closures`, `financial-records`, `unenroll-preview`,
`cancel-preview`, `full-profile`, `unread-count`, `eligible-recipients`,
`pending-refunds` — multi-word resources use `snake_case` instead of the
skill's `kebab-case`. Internally consistent, but inconsistent with the stated
convention and with c
...[truncated 6150 chars]