# Timezone & Proxy Infrastructure Plan

**Target:** Consistent timezone handling across dev and production (Asia/Riyadh UTC+3) with proxy-ready outbound internet access.

**Scope:** Application code changes only. Docker/proxy configuration is preparation for future internet-dependent features.

---

## Related Plans

This module is a cross-cutting dependency for the Section Lifecycle plans. Phases 2, 3, 4, and 7 import `get_today()` or `utcnow()` from `app.core.timezone` to ensure all date calculations use the institute-local timezone (Asia/Riyadh) rather than the server OS timezone.

- **Section Lifecycle Phase 2** — `section_startup_checks.py` imports `get_today()` for the idempotency gate and overdue detection
- **Section Lifecycle Phase 3** — `complete_section()` uses `get_today()` for daily closure checks
- **Section Lifecycle Phase 4** — `disburse_pending_refund()` uses `get_today()` for daily closure checks and receipt numbering; `expire_stale_pending_refunds()` uses `utcnow()` for forfeiture cutoff
- **Section Lifecycle Phase 7** — reconciliation reports use `get_today()` as the default query date

---

## Problem Statement

### Timezone

Two leakage points make "today" inconsistent:

1. **Python-side:** `date.today()` reads the server/container OS timezone. Inconsistent across machines.
2. **Database-side:** `func.date(Enrollment.enrolled_at)` extracts date using PostgreSQL's session timezone. If the session defaults to UTC, date boundaries shift by +3 hours from Riyadh time.

All timestamps are stored as `DateTime(timezone=True)` with `server_default=timezone('utc'::text, now())` — UTC in the DB, but date comparisons don't account for the conversion to the institute's local time.

### Internet

The backend currently makes **zero outbound HTTP calls**. Internet access is preparation for:
- Payment gateway integration
- SMS/email notifications
- Package/security updates
- Let's Encrypt SSL (currently using self-signed `tls internal`)

---

## Solution Architecture

### Single Source of Truth

```
.env / Docker env var
        │
        ▼
Settings.TIMEZONE = "Asia/Riyadh"
        │
        ├──► app/core/timezone.py :: get_today()
        │       replaces all date.today() calls
        │       uses zoneinfo (Python 3.9+ stdlib — zero deps)
        │
        └──► app/db/session.py :: connect_args
                server_settings.timezone = "Asia/Riyadh"
                tells PostgreSQL session to use Riyadh time
                fixes func.date() extraction in queries
```

**Dev:** `TIMEZONE=Asia/Riyadh` in `apps/erp/backend/.env` — read by Pydantic at startup
**Prod:** `TIMEZONE: Asia/Riyadh` in `docker-compose.yml` backend service env — same code, no changes

No conditional logic, no `if ENVIRONMENT == "production"` branches.

### Proxy Preparation

Add optional `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` to Settings. Create a proxy-aware HTTP client factory in `app/core/http_client.py`. All values default to `""` (no proxy). In dev, nothing changes. In prod, Docker env sets them.

---

## Files to Change

### New Files

| File | Purpose |
|------|---------|
| `apps/erp/backend/app/core/timezone.py` | `get_today()`, `utcnow()`, `localize()` helpers |
| `apps/erp/backend/app/core/http_client.py` | Proxy-aware `httpx.AsyncClient` factory |

### Modified Files

| File | Changes |
|------|---------|
| `apps/erp/backend/app/core/config.py` | Add `TIMEZONE`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` settings |
| `apps/erp/backend/app/db/session.py` | Add `connect_args` with `server_settings.timezone` |
| `apps/erp/backend/app/modules/dashboard/service.py` | Replace `date.today()` → `get_today()` (3 locations) |
| `apps/erp/backend/app/modules/lms/financial_service.py` | Replace `date.today()` → `get_today()` (3 locations); fix line 255 to use `get_today()` instead of `datetime.now(timezone.utc).date()` |
| `apps/erp/backend/.env` | Add `TIMEZONE=Asia/Riyadh` |
| `docker-compose.yml` | Add `TZ`, `TIMEZONE`, `BACKEND_URL`, `FRONTEND_URL`, proxy env vars |
| `infrastructure/caddy/Caddyfile` | Replace hardcoded `host.docker.internal` with `{env.BACKEND_URL}` / `{env.FRONTEND_URL}` |

---

## Implementation Details

### 1. `apps/erp/backend/app/core/config.py`

```python
class Settings(BaseSettings):
    # ... existing settings ...
    TIMEZONE: str = "Asia/Riyadh"
    HTTP_PROXY: str = ""
    HTTPS_PROXY: str = ""
    NO_PROXY: str = "localhost,127.0.0.1,.aldirasat.edu"
```

### 2. `apps/erp/backend/app/core/timezone.py` (NEW)

```python
from zoneinfo import ZoneInfo
from datetime import date, datetime
from app.core.config import settings

_tz = ZoneInfo(settings.TIMEZONE)

def get_today() -> date:
    """Current date in the institute's configured timezone."""
    return datetime.now(_tz).date()

def utcnow() -> datetime:
    """Current UTC datetime (replaces datetime.now(timezone.utc))."""
    return datetime.now(ZoneInfo("UTC"))

def localize(dt: datetime) -> datetime:
    """Convert a UTC-aware datetime to the institute's timezone."""
    return dt.astimezone(_tz)
```

### 3. `apps/erp/backend/app/db/session.py`

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args={"server_settings": {"timezone": settings.TIMEZONE}},
    # ... existing args ...
)
```

### 4. `apps/erp/backend/app/core/http_client.py` (NEW)

```python
import httpx
from app.core.config import settings

def get_async_client() -> httpx.AsyncClient:
    """Return an httpx.AsyncClient configured with proxy settings."""
    proxy = settings.HTTPS_PROXY or settings.HTTP_PROXY
    if proxy:
        return httpx.AsyncClient(proxies=proxy)
    return httpx.AsyncClient()
```

### 5. Replace `date.today()` in services

**`dashboard/service.py`:**
- Line 48: `today = date.today()` → `today = get_today()`
- Line 131: `today = date.today()` → `today = get_today()`
- Line 233: `first_of_month = date.today().replace(day=1)` → `first_of_month = get_today().replace(day=1)`

**`financial_service.py`:**
- Line 47: `payment_date = date.today()` → `payment_date = get_today()`
- Line 255: `now = datetime.now(timezone.utc).date()` → `now = get_today()`
- Line 380: `expense_date = date.today()` → `expense_date = get_today()`
- Line 749: `end_date = date.today()` → `end_date = get_today()`

### 6. `docker-compose.yml`

```yaml
services:
  database:
    environment:
      TZ: Asia/Riyadh
      # ... existing ...

  backend:
    environment:
      TZ: Asia/Riyadh
      TIMEZONE: Asia/Riyadh
      HTTP_PROXY: "${HTTP_PROXY:-}"
      HTTPS_PROXY: "${HTTPS_PROXY:-}"
      NO_PROXY: "${NO_PROXY:-localhost,127.0.0.1,.aldirasat.edu,database}"
      # ... existing ...

  frontend:
    environment:
      TZ: Asia/Riyadh
      # ... existing ...

  caddy:
    environment:
      TZ: Asia/Riyadh
      BACKEND_URL: "${BACKEND_URL:-host.docker.internal:8000}"
      FRONTEND_URL: "${FRONTEND_URL:-host.docker.internal:3000}"
      HTTP_PROXY: "${HTTP_PROXY:-}"
      HTTPS_PROXY: "${HTTPS_PROXY:-}"
      # ... existing ...
```

### 7. `infrastructure/caddy/Caddyfile`

```
{
    pki {
        ca local {
            name "LIMS Internal CA"
            root_cn "LIMS Root CA"
        }
    }
}

aldirasat.edu {
    tls internal
    encode gzip

    reverse_proxy /api/v1/* {env.BACKEND_URL}
    reverse_proxy /uploads/* {env.BACKEND_URL}
    reverse_proxy * {env.FRONTEND_URL}
}
```

---

## Dev vs Prod Config Matrix

| Setting | Dev (.env or compose default) | Prod (docker-compose override) |
|---------|------------------------------|-------------------------------|
| `TIMEZONE` | `Asia/Riyadh` | `Asia/Riyadh` |
| `BACKEND_URL` | `host.docker.internal:8000` | `backend:8000` |
| `FRONTEND_URL` | `host.docker.internal:3000` | `frontend:3000` |
| `HTTP_PROXY` | (empty — no proxy) | `http://proxy.aldirasat.edu:3128` |
| `HTTPS_PROXY` | (empty — no proxy) | `http://proxy.aldirasat.edu:3128` |
| `NO_PROXY` | defaults | `localhost,127.0.0.1,.aldirasat.edu,database` |

---

## Verification

### Timezone Correctness

```python
# Manual test: run from backend container or venv
python -c "
from app.core.timezone import get_today, utcnow, localize
from datetime import datetime, timezone

print('Today (Riyadh):', get_today())
print('UTC now:', utcnow())
dt = datetime.now(timezone.utc)
print('Localized:', localize(dt))
"
```

- `get_today()` should return the current date in Riyadh (UTC+3)
- At 1 AM Riyadh time (10 PM UTC previous day), `get_today()` must return the Riyadh date, not the UTC date

### Database Session Timezone

```sql
-- Connect to PostgreSQL and check session timezone
SHOW timezone;
-- Should return 'Asia/Riyadh' when connected from the backend
```

### Deployment

| Step | Command |
|------|---------|
| Dev test | `cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload` |
| Docker build | `docker compose build backend` |
| Verify health | `curl http://localhost:8000/api/v1/health` |
| Verify Caddy config | `docker compose logs caddy \| grep -i "backup\|loading"` |

---

## Edge Cases

1. **DST:** Asia/Riyadh has no daylight saving. If the timezone changes to one with DST, `zoneinfo` handles it automatically — no code change needed.
2. **Midnight race condition:** If `get_today()` is called at exactly 00:00:00.000001 Riyadh time, it returns the new day. All queries use the same `today` value within a request, so no partial-day inconsistency within a single API call.
3. **Old data:** Existing timestamps in the DB are UTC. `func.timezone('Asia/Riyadh', column)` correctly interprets them as UTC and converts to Riyadh for date extraction.
4. **No proxy in dev:** `HTTP_PROXY=""` means `httpx.AsyncClient()` is created without proxy — identical behavior to current code. No regression.

---

## What Is NOT in Scope

| Item | Reason |
|------|--------|
| Fixing `locked_until` timezone column | Separate concern — works around with `.replace(tzinfo=...)`, cosmetic only |
| Frontend timezone handling | Browser `Intl` already uses the client's local timezone. Backend is the source of truth for "today" |
| Let's Encrypt SSL | Requires internet. Deferred until proxy is operational and Caddy is configured to use it |
| NTP time sync | Server clock accuracy is a separate operational concern, not application code |
