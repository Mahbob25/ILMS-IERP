# Phase 5: Idempotency Key Middleware

**Owner:** Backend C
**Estimate:** 2 days
**Dependencies:** Phase 1 must be merged (migration must use Phase 1's head as `down_revision`)

## Audit Items Covered

- **S01:** Double-click Save Payment — idempotency key prevents duplicate payment creation
- **S13:** Network drops mid-payment — retry with same idempotency key does not create second payment

## Tasks

### 5.1 Create `idempotency_keys` Table

Create Alembic migration:

```sql
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(idempotency_key, endpoint)
);

-- TTL cleanup index (keys older than 24h can be deleted)
CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys (created_at);
```

Add SQLAlchemy model in `apps/erp/backend/app/modules/models.py` (or appropriate models file).

### 5.2 Create Idempotency Middleware

Create `apps/erp/backend/app/middleware/idempotency.py`:

```python
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import hashlib

class IdempotencyMiddleware(BaseHTTPMiddleware):
    IDEMPOTENT_METHODS = {"POST", "PATCH", "PUT"}
    TTL_HOURS = 24

    async def dispatch(self, request: Request, call_next):
        if request.method not in self.IDEMPOTENT_METHODS:
            return await call_next(request)

        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            return await call_next(request)

        endpoint = request.url.path

        # Check if key already exists
        existing = await check_idempotency_key(idempotency_key, endpoint)
        if existing:
            return Response(
                content=existing.response_body,
                status_code=existing.response_status,
                media_type="application/json",
                headers={"X-Idempotency-Replayed": "true"}
            )

        # Process request
        response = await call_next(request)

        # Store result if successful
        if response.status_code < 500:
            body = await response.body()
            await store_idempotency_key(
                idempotency_key=idempotency_key,
                endpoint=endpoint,
                response_status=response.status_code,
                response_body=body
            )

        return response
```

### 5.3 Wire Middleware in `main.py`

```python
app.add_middleware(IdempotencyMiddleware)
```

### 5.4 Add Idempotency Key Helper Functions

In `apps/erp/backend/app/modules/lms/idempotency_service.py`:

- `check_idempotency_key(key, endpoint)` — query DB for existing key
- `store_idempotency_key(key, endpoint, status, body)` — insert with TTL
- `cleanup_expired_keys()` — scheduled job to delete keys older than 24h

### 5.5 Add Idempotency Key Generation in Frontend

In `apps/erp/frontend/lib/api.ts`, add an Axios request interceptor that generates and attaches an idempotency key to every POST/PATCH/PUT request:

```typescript
// Generate a UUID for each request
api.interceptors.request.use((config) => {
  if (['post', 'patch', 'put'].includes(config.method?.toLowerCase() || '')) {
    const key = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36)}`
    config.headers['Idempotency-Key'] = key
  }
  return config
})
```

Place this as a new interceptor (do NOT modify existing interceptors).

### 5.6 Add Idempotency Cleanup Scheduled Job

Add a background task (or cron) that runs daily to purge keys older than 24h.

## Files to CREATE

| File | Purpose |
|------|---------|
| `apps/erp/backend/app/middleware/idempotency.py` | FastAPI middleware |
| `apps/erp/backend/app/modules/lms/idempotency_service.py` | Idempotency key CRUD + cleanup |
| Alembic migration | `idempotency_keys` table |

## Files to EDIT

| File | Specific Location | Changes |
|------|-------------------|---------|
| `apps/erp/backend/app/main.py` | After other middleware | Add `app.add_middleware(IdempotencyMiddleware)` |
| `apps/erp/backend/app/modules/models.py` | End of models | Add `IdempotencyKey` SQLAlchemy model |
| `apps/erp/frontend/lib/api.ts` | After existing interceptors | Add request interceptor for idempotency key header |

## Independent Boundary

- Do NOT modify any business logic in service files (idempotency is middleware, not in business logic)
- Do NOT modify DB CHECK constraints or sequences (Phase 1, 2 concerns)
- Do NOT modify conditional UPDATE patterns (Phase 3 concern)
- Do NOT add SELECT FOR UPDATE (Phase 4 concern)
- Do NOT modify any individual POST endpoint logic — middleware applies globally
- Do NOT touch `api.ts` interceptors that handle F04 (promise), F09 (error discrimination), or `isRedirectingToLogin` (Phase 9 concerns) — only add a NEW interceptor
- Do NOT modify Caddyfile or infrastructure

## Acceptance Criteria

- [ ] `idempotency_keys` table created with UNIQUE(idempotency_key, endpoint)
- [ ] Middleware intercepts all POST/PATCH/PUT requests
- [ ] First request with key → processed normally
- [ ] Second request with same key → returned cached response with `X-Idempotency-Replayed: true`
- [ ] Middleware only caches successful (2xx/4xx) responses, not 5xx
- [ ] Expired keys are cleaned up daily
- [ ] Frontend generates and attaches idempotency keys to all mutating requests
- [ ] Migration depends on Phase 1's head revision
