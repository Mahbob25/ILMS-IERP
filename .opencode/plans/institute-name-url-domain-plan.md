# Institute Name, URL & Email Domain - Implementation Plan

## Completed (previous session)
Already changed institute name references across 11 files. All old names removed.

## Remaining: URL & Email Domain Changes

### Phase 1: Config & Infrastructure (lims.institute.local → aldrasat.edu)

**1. `apps/erp/backend/app/core/config.py:13`**
```
- CORS_ORIGINS: str = "https://lims.institute.local"
+ CORS_ORIGINS: str = "https://aldrasat.edu"
```

**2. `infrastructure/caddy/Caddyfile:11`**
```
- lims.institute.local {
+ aldrasat.edu {
```

**3. `docker-compose.yml:63`**
```
- #     NEXT_PUBLIC_API_URL: https://lims.institute.local/api/v1
+ #     NEXT_PUBLIC_API_URL: https://aldrasat.edu/api/v1
```

### Phase 2: Backend Tests (@institute.dev → @aldrasat.com)

**4. `apps/erp/backend/test_v1_7_full_e2e.py`** — ~25 occurrences
Replace all `@institute.dev` with `@aldrasat.com`

**5. `apps/erp/backend/test_v1_7_e2e.py`** — ~28 occurrences
Replace all `@institute.dev` with `@aldrasat.com`

**6. `apps/erp/backend/test_phase3.py`** — ~3 occurrences
Replace all `@institute.dev` with `@aldrasat.com`

**7. `apps/erp/backend/debug_cookies.py:6`**
```
- r = client.post('/api/v1/auth/login', json={'email': 'superadmin@institute.dev', ...})
+ r = client.post('/api/v1/auth/login', json={'email': 'superadmin@aldrasat.com', ...})
```

**8. `apps/erp/backend/check_sections.py:4`**
```
- r = c.post('/api/v1/auth/login', json={'email': 'superadmin@institute.dev', ...})
+ r = c.post('/api/v1/auth/login', json={'email': 'superadmin@aldrasat.com', ...})
```

### Phase 3: Frontend E2E Tests (@institute.dev → @aldrasat.com)

**9. `apps/erp/frontend/tests/e2e/global-setup.ts`** — 4 email references
**10. `apps/erp/frontend/tests/e2e/fixtures/tokens.ts`** — 4 email references
**11. `apps/erp/frontend/tests/e2e/fixtures/api.ts`** — 8 email references
**12. `apps/erp/frontend/tests/e2e/identity/token-refresh.spec.ts`** — 1 email reference
**13. `apps/erp/frontend/tests/e2e/browser/auth/global-auth-setup.ts`** — 4 email references

Replace all `@institute.dev` → `@aldrasat.com`

### Phase 4: Documentation (lims.institute.local → aldrasat.edu)

**14. `docs/production-readiness-assessment.md`** — 1 URL reference
**15. `docs/architecture/memory.md`** — 1 URL reference
**16. `docs/plans/Plan-v1.6.md`** — multiple URL references
**17. `docs/plans/mvp-launch-plan.md`** — multiple URL references

### Skipped (per user request)
- Alembic seed migration files (`202606182315_initial_identity_setup.py`, `202606260002_seed_users.py`)

## Commands to apply each edit
