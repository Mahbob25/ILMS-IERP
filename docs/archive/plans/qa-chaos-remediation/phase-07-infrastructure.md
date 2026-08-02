# Phase 7: Infrastructure & Deployment

**Owner:** DevOps
**Estimate:** 2.5 days
**Dependencies:** None (no schema dependencies)

## Audit Items Covered

- **I01:** No CI/CD pipeline — create GitHub Actions workflow
- **I02:** No database backup strategy — `pg_dump` cron + offsite storage
- **I03:** Backend container runs as root — add `USER` directive to Dockerfile
- **I07:** No error monitoring — add Sentry to backend and frontend
- **I09:** No log retention/rotation — configure logrotate
- **I10:** Caddy `tls internal` — switch to Let's Encrypt
- **I11:** No structured logging — replace `print()`/`console.log()`
- **I12:** No health checks — add `HEALTHCHECK` to Dockerfiles
- **I13:** Hardcoded DB password in test script — remove, use env vars
- **S28:** DB connection pool exhaustion — configure pool size + queue timeout

## Tasks

### 7.1 Create CI/CD Pipeline (I01)

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: lims_test
          POSTGRES_USER: lims
          POSTGRES_PASSWORD: lims_test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements-dev.txt
      - run: alembic upgrade head
      - run: pytest -v --cov=app --cov-report=term-missing
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

### 7.2 Database Backup Strategy (I02)

Create `backend/scripts/backup.sh`:

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f /backups/lms_$TIMESTAMP.dump
# Upload to offsite storage (S3/R2)
aws s3 cp /backups/lms_$TIMESTAMP.dump s3://lms-backups/
# Retention: keep 30 days local, 90 days remote
find /backups -name "lms_*.dump" -mtime +30 -delete
```

Create a cron job entry for `pg_dump` runs every 6 hours:
```
0 */6 * * * /usr/local/bin/backup.sh
```

### 7.3 Backend Container Security (I03)

In `backend/Dockerfile`:

```dockerfile
# Add before CMD:
RUN useradd -m -u 1000 appuser
USER appuser
```

### 7.4 Add Sentry Error Monitoring (I07)

**Backend** — in `backend/app/main.py`:

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("APP_ENV", "development"),
    traces_sample_rate=0.1,
    integrations=[FastApiIntegration()],
)
```

**Frontend** — in `frontend/app/layout.tsx` and `frontend/lib/api.ts`:

```typescript
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  tracesSampleRate: 0.1,
})

// In api.ts error handler:
Sentry.captureException(error)
```

### 7.5 Fix DB Connection Pool (S28)

In `backend/app/core/database.py` (or wherever the engine is created):

```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,  # Wait max 30s for a connection
    pool_pre_ping=True,  # Verify connections before use
)
```

### 7.6 Hardcoded Credentials (I13)

In `tests/test_v1_7_full_e2e.py`:

- Remove hardcoded DB password
- Use environment variables or a `.env.test` file
- Document required env vars in the test file header

### 7.7 Other Infrastructure Fixes

**I09 — Log rotation:** Configure `logrotate` for application logs:
```
/var/log/lms/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

**I10 — Let's Encrypt:** In `infrastructure/caddy/Caddyfile`, replace `tls internal` with:
```
tls {
    issuer acme
}
```
Remove or comment out `tls internal` — Caddy auto-provisions Let's Encrypt certs for public domains. For private domains, keep `tls internal` but add a comment noting the limitation.

**I11 — Structured logging:**
- Backend: Replace `print()` with `logging.getLogger(__name__).info()` in all service files
- Frontend: Replace `console.log()` with structured approach (Sentry breadcrumbs or `logger.info()` wrapper)
- Create a `backend/app/core/logging.py` module with JSON formatter

**I12 — Docker HEALTHCHECK:**
In both `backend/Dockerfile` and any service Dockerfile:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
```

Or for frontend:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
```

## Files to CREATE

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI/CD pipeline |
| `backend/scripts/backup.sh` | Database backup script |
| `backend/app/core/logging.py` | Structured logging config |

## Files to EDIT

| File | Changes |
|------|---------|
| `backend/Dockerfile` | Add `USER appuser`, `HEALTHCHECK` |
| `backend/app/main.py` | Add Sentry init |
| `backend/app/core/database.py` | Configure pool_size, max_overflow, pool_timeout |
| `frontend/app/layout.tsx` | Add Sentry init |
| `frontend/lib/api.ts` | Add `Sentry.captureException()` |
| `infrastructure/caddy/Caddyfile` | Replace `tls internal` with Let's Encrypt config |
| `tests/test_v1_7_full_e2e.py` | Remove hardcoded credentials |
| Log rotate config | Add logrotate config |
| All backend service files | Replace `print()` with structured logging |
| Frontend components | Replace `console.log()` with structured logging |

## Independent Boundary

- Do NOT modify any business logic in service files (beyond logging changes)
- Do NOT modify any DB schema (Phase 1, 2 concerns)
- Do NOT add security headers or CSRF (Phase 8 concern — those go in Caddyfile HEADERS section)
- Do NOT add rate limiting (Phase 8 concern)
- Do NOT modify frontend component behavior/state management (Phase 9 concern)
- **In `infrastructure/caddy/Caddyfile`, only edit the `tls internal` line — do NOT add header directives (Phase 8)**

## Acceptance Criteria

- [ ] GitHub Actions workflow runs tests on push/PR
- [ ] Database backup script exists and runs every 6 hours
- [ ] Backend Dockerfile has `USER` directive (non-root)
- [ ] Sentry captures errors on both backend and frontend
- [ ] DB pool configured with `pool_size=10`, `max_overflow=20`, `pool_timeout=30`
- [ ] No hardcoded credentials in test scripts
- [ ] Docker HEALTHCHECK configured for all containers
- [ ] Log rotation configured
- [ ] Caddy TLS uses Let's Encrypt (or documented limitation)
- [ ] No `print()` or `console.log()` in production code
