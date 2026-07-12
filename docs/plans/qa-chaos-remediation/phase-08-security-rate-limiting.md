# Phase 8: Rate Limiting + CSRF + Security Headers

**Owner:** Backend E
**Estimate:** 1.5 days
**Dependencies:** None (no schema dependencies)

## Audit Items Covered

- **I04:** No CSRF protection — add CSRF middleware or double-submit cookie pattern
- **I05:** No CSP headers in Caddy — add Content-Security-Policy
- **I06:** No rate limiting on financial endpoints — slowapi on all non-auth endpoints
- **I08:** IP-based rate limiting broken behind proxy — parse `X-Forwarded-For` header

## Tasks

### 8.1 Add Security Headers to Caddyfile (I05)

In `infrastructure/caddy/Caddyfile`, append to the server block:

```
header {
    Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.example.com; form-action 'self'"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    X-XSS-Protection "0"
}
```

Also add `Strict-Transport-Security`:

```
header Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

**Important:** Add these headers at the END of the server block (do NOT touch TLS configuration).

### 8.2 Fix IP Detection for Rate Limiting (I08)

In the backend, create `backend/app/middleware/real_ip.py`:

```python
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

class RealIPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # X-Forwarded-For: client, proxy1, proxy2
            client_ip = forwarded.split(",")[0].strip()
            request.scope["client"] = (client_ip, request.scope.get("client", (None, None))[1] or 0)
        return await call_next(request)
```

Wire in `main.py`:
```python
app.add_middleware(RealIPMiddleware)
```

### 8.3 Add CSRF Protection (I04)

Create `backend/app/middleware/csrf.py`:

```python
import secrets
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class CSRFMiddleware(BaseHTTPMiddleware):
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

    async def dispatch(self, request: Request, call_next):
        if request.method in self.SAFE_METHODS:
            return await call_next(request)

        # Check CSRF token header
        csrf_token = request.headers.get("X-CSRF-Token")
        csrf_cookie = request.cookies.get("csrf_token")

        if not csrf_token or not csrf_cookie or csrf_token != csrf_cookie:
            raise HTTPException(status_code=403, detail="CSRF token mismatch")

        return await call_next(request)
```

Wire in `main.py`:
```python
app.add_middleware(CSRFMiddleware)
```

**Frontend side:** Add CSRF token to API calls. In `frontend/lib/api.ts`, add a request interceptor that reads the CSRF token from cookie and attaches as header:

```typescript
api.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token')
  if (csrfToken && ['post', 'patch', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})
```

Create a utility to read cookies:
```typescript
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}
```

### 8.4 Add Rate Limiting on All Endpoints (I06)

In `backend/app/core/rate_limit.py`:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_client_ip(request) -> str:
    """Use RealIPMiddleware's resolved IP for rate limiting."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["100/minute"],  # Default for all endpoints
)

# Per-endpoint overrides in router files:
# @router.post("/payments")
# @limiter.limit("10/minute")
# async def create_payment(...):
```

Wire in `main.py`:
```python
from app.core.rate_limit import limiter
app.state.limiter = limiter
app.add_exception_handler(429, ...)
```

Apply limits to specific endpoints:
- Financial endpoints (payments, expenses, refunds, disbursements): `10/minute`
- Auth endpoints (login, register): keep existing `5/minute`
- Enrollment endpoints: `20/minute`
- All other non-auth endpoints: `100/minute`

## Files to CREATE

| File | Purpose |
|------|---------|
| `backend/app/middleware/real_ip.py` | X-Forwarded-For header parsing |
| `backend/app/middleware/csrf.py` | CSRF token validation middleware |
| `backend/app/core/rate_limit.py` | Rate limiter config |

## Files to EDIT

| File | Changes |
|------|---------|
| `infrastructure/caddy/Caddyfile` | Append security headers to server block |
| `backend/app/main.py` | Wire RealIPMiddleware, CSRFMiddleware, rate limiter |
| `backend/app/main.py` | Add `app.state.limiter = limiter` |
| `backend/app/modules/lms/router.py` | Add `@limiter.limit("10/minute")` to payment/expense endpoints |
| `backend/app/modules/academic/router.py` | Add `@limiter.limit("20/minute")` to enrollment endpoints |
| `frontend/lib/api.ts` | Add CSRF token request interceptor + `getCookie()` |

## Independent Boundary

- Do NOT modify any business logic in service files
- Do NOT modify DB schema (Phase 1, 2 concerns)
- Do NOT add conditional UPDATE patterns (Phase 3 concern)
- Do NOT add SELECT FOR UPDATE (Phase 4 concern)
- Do NOT create idempotency key middleware (Phase 5 concern)
- Do NOT modify Dockerfile TLS or health checks (Phase 7 concerns)
- **In `infrastructure/caddy/Caddyfile`, only add headers — do NOT touch `tls internal` line or TLS config (Phase 7)**
- **In `frontend/lib/api.ts`, only add the CSRF token interceptor — do NOT touch F04 (promise fix), F09 (error discrimination), `isRedirectingToLogin` fix, or idempotency key interceptor (Phases 5 and 9)**

## Acceptance Criteria

- [ ] Caddyfile serves security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- [ ] `X-Forwarded-For` header is correctly parsed for client IP
- [ ] CSRF middleware validates `X-CSRF-Token` header against `csrf_token` cookie for all state-changing requests
- [ ] Frontend attaches CSRF token to all mutating requests
- [ ] Rate limits applied: 10/min financial, 20/min enrollment, 100/min others
- [ ] Rate limiter uses real client IP (not proxy IP)
- [ ] Rate limit exceeded returns proper 429 with `Retry-After` header
