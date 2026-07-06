# Production Readiness Assessment — LIMS v1.7

**Date:** 2026-07-06
**Assessed by:** Senior Staff Engineer / DevOps Expert
**Verdict:** **CONDITIONAL GO** — Launchable after resolving 5 CRITICAL and 8 HIGH items

---

## Executive Summary

The Learning Institution Management System (LIMS) v1.7 is a well-architected bilingual (Arabic/English) platform built with Next.js 14 + FastAPI + PostgreSQL 16. The code demonstrates strong engineering practices: JWT rotation via HttpOnly cookies, bcrypt with rounds=12, account lockout, RBAC with role-based middleware, Alembic-migrated schema, and Docker Compose orchestration.

**However, the system is currently configured for local/intranet development, not production.** The `docker-compose.yml` has all application services commented out (only DB + Caddy run). Caddy uses self-signed certificates (`tls internal`). There is no CI/CD pipeline, no error monitoring, no database backups, and zero unit tests.

**Verdict: CONDITIONAL GO** — The core architecture is sound, but launch must be gated on resolving the Critical and High items below.

---

## Category Scorecard

| Category | Score | Status |
|----------|-------|--------|
| Architecture & Design | 8/10 | Solid modular monolith. 4 domain modules. Clean separation. |
| Security (Auth) | 8/10 | JWT rotation, bcrypt-12, lockout, HttpOnly cookies. Well done. |
| Security (Infra) | 3/10 | No CSP, root Docker user, no CSRF, no Sentry. |
| Testing | 2/10 | Zero unit tests. Only API-level E2E tests (no browser UI tests). |
| Observability | 1/10 | No Sentry, no structured logging, minimal health check. |
| Infrastructure | 2/10 | Services commented out in Compose. No CI/CD. No backups. |
| Data Integrity | 6/10 | Daily closures, audit logs, RLS-like patterns. But no backup/PITR. |
| Performance | 4/10 | N+1 queries in 4+ service functions. No caching. No connection pooling limits. |

**Overall Score: 4.3/10** — Strong foundation, many production gaps.

---

## Gap Analysis (with Code References)

### CRITICAL Items (Block Launch)

#### C-1: No Error Monitoring / Crash Reporting
- **Files:** `backend/app/main.py:1-45`
- **Issue:** No Sentry, OpenTelemetry, or any crash-reporter. Production errors are invisible. A 500 error spike could go unnoticed for hours.
- **Remediation:** Add `sentry-sdk` to `requirements.txt`. Initialize in `main.py` with `Sentry.init(dsn=..., traces_sample_rate=0.1)`. Configure performance tracing for FastAPI.
- **Effort:** 2 hours

#### C-2: No Database Backup Strategy
- **Files:** `docker-compose.yml:18-20`
- **Issue:** Single `pgdata` volume. No automated `pg_dump`, no WAL archiving, no PITR. A disk failure or accidental `DROP TABLE` means permanent data loss.
- **Remediation:** Implement daily `pg_dump` via cron (or use `pg_cron`). Store backups off-host (GCS/S3 via `rclone` or `pg_dump` pipe to object storage). Add WAL archiving to `postgresql.conf`.
- **Effort:** 4 hours

#### C-3: No CI/CD Pipeline
- **Files:** No `.github/` directory
- **Issue:** No automated build, test, or deployment process. Every deployment is manual and unrepeatable.
- **Remediation:** Implement GitHub Actions pipeline (see CI/CD Blueprint below). Automate: lint → unit test → build Docker → E2E test → deploy.
- **Effort:** 8 hours

#### C-4: Backend Dockerfile Runs as Root
- **File:** `backend/Dockerfile:1-29`
- **Issue:** No `USER` directive. The container runs as root. If compromised, attacker has full container root access.
- **Remediation:** Add `RUN adduser --system --uid 1001 appuser` and `USER appuser` before the `CMD` line.
- **Effort:** 15 minutes

#### C-5: No CSRF Protection
- **Files:** `backend/app/main.py:24-31`
- **Issue:** CORS allows any method/header with credentials. There's no CSRF token validation. While SameSite=Lax mitigates some CSRF, it's not sufficient for all browsers/scenarios.
- **Remediation:** Add CSRF middleware (e.g., `fastapi-csrf-protect`) or implement double-submit cookie pattern.
- **Effort:** 3 hours

---

### HIGH Items (Fix Before Launch or Soon After)

#### H-1: Zero Unit Tests
- **Files:** All `backend/app/modules/*/service.py` and `router.py`
- **Issue:** No pytest or unit tests exist. Only E2E API tests (`test_v1_7_*.py`). Refactoring or upgrading dependencies is high-risk without a regression safety net.
- **Remediation:** Write pytest tests for all service-layer functions. Target 80% coverage. Add `pytest`, `pytest-cov`, `pytest-asyncio` to requirements.
- **Effort:** 40 hours (ongoing)

#### H-2: No Content Security Policy (CSP) Headers
- **Files:** `infrastructure/caddy/Caddyfile:1-21`, `backend/app/main.py:1-45`
- **Issue:** No CSP headers configured anywhere (not in Caddy, not in FastAPI, not in Next.js). XSS risk.
- **Remediation:** Add CSP headers in Caddyfile: `header /api/v1/* Content-Security-Policy "default-src 'self'"` and in Next.js `next.config.js` via `headers()`.
- **Effort:** 1 hour

#### H-3: N+1 Queries in Multiple Service Functions
- **Files:**
  - `backend/app/modules/identity/service.py:33-61` — `get_teachers_with_stats()` loops through teachers with separate queries
  - `backend/app/modules/identity/service.py:182-224` — `list_employees()` loops through employees for `has_user` check
  - `backend/app/modules/lms/financial_service.py:214-276` — `get_eligible_recipients()` loops through employees
  - `backend/app/modules/identity/service.py:64-146` — `get_teacher_detail()` runs multiple separate queries
- **Issue:** O(N) queries where O(1) would suffice. Performance degrades linearly with data growth.
- **Remediation:** Replace loop queries with batched/joined queries. Use `selectinload` or `subqueryload` for collections. Use single query with left joins where possible.
- **Effort:** 6 hours

#### H-4: No Caching Layer
- **Files:** All modules
- **Issue:** Every request hits the database. Dashboard aggregate queries (revenue, attendance, etc.) will become progressively slower. No Redis or in-memory cache.
- **Remediation:** Add Redis to Docker Compose. Cache expensive dashboard queries (TTL: 5 min). Cache reference data (roles, permissions, courses).
- **Effort:** 8 hours

#### H-5: No Rate Limiting on Financial Endpoints
- **Files:** `backend/app/modules/lms/router.py:80-96` (payments), `189-208` (expenses)
- **Issue:** Only login (3/min), refresh (10/min), and user create (10/min) have rate limits. Payment creation, expense creation, and enrollment creation are unprotected — vulnerable to abuse.
- **Remediation:** Apply `@limiter.limit("30/minute")` to payments, expenses, and enrollment creation endpoints.
- **Effort:** 30 minutes

#### H-6: Services Commented Out in Docker Compose
- **File:** `docker-compose.yml:36-72`
- **Issue:** Backend and frontend services are commented out. Running only database + Caddy. No production deployment configuration exists.
- **Remediation:** Uncomment and properly configure all services. Set environment variables. Configure proper resource limits and restart policies.
- **Effort:** 2 hours

#### H-7: No Structured Logging / Observability
- **Files:** All `backend/app/*.py`
- **Issue:** No structured logging (JSON logs), no log levels enforced, no log shipping.
- **Remediation:** Add `structlog` or `python-json-logger`. Configure structured logging at application startup. Add health endpoint that checks DB connection pool, Redis, storage.
- **Effort:** 4 hours

#### H-8: Refresh Token + Audit Log Tables Grow Unbounded
- **Files:** `backend/app/modules/identity/models.py` (RefreshToken, AuditLog)
- **Issue:** No garbage collection for expired/revoked tokens. No retention policy for audit logs. Will impact performance over months.
- **Remediation:** Add scheduled task (or background job) to delete expired tokens. Implement audit log archiving/rotation (keep 90 days online, archive to cold storage).
- **Effort:** 3 hours

---

### MEDIUM Items (Fix Post-Launch, Next Sprint)

| # | Issue | File | Remediation | Effort |
|---|-------|------|-------------|--------|
| M-1 | `update_user()` uses blind `setattr` | `identity/service.py:156-167` | Use explicit field mapping | 1h |
| M-2 | `list_employees()` deprecated endpoint | `identity/router.py:673-681` | Remove in next major version | 30m |
| M-3 | No file upload validation | `core/storage.py:1-37` | Add type/size validation to `save_upload()` | 1h |
| M-4 | Local filesystem storage | `core/storage.py:4` | Migrate to S3-compatible storage | 8h |
| M-5 | `is_superadmin` column not dropped | Schema migrations | Drop deprecated column after verifying | 1h |
| M-6 | No Next.js strict TypeScript | `frontend/tsconfig.json` | Enable `strict: true` | 2h |
| M-7 | Health check too minimal | `backend/app/main.py:42-45` | Add DB pool, Redis, disk checks | 1h |
| M-8 | No pagination on payments/expenses list | `lms/financial_service.py:172-189, 394-411` | Add skip/limit params | 2h |
| M-9 | Caddy `tls internal` for production | `infrastructure/caddy/Caddyfile:12` | Switch to Let's Encrypt `tls { email }` | 30m |

---

## CI/CD Pipeline Blueprint (Local Server Deployment)

Since your deployment target is a **local/on-premise server**, there are two viable approaches:

### Architecture Decision: Two Approaches

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **A — Self-hosted Runner** | No public IP needed, simple, runs locally | Requires Node.js on server, one-time setup | 🏆 **Recommended** |
| **B — Polling Deploy** | Zero external dependencies, pure bash | No PR checks, delayed deployment | Lightweight/backup |

---

### Branch Strategy
```
feature/*  →  main (production)
                ↓
    Self-hosted runner OR polling script
                ↓
      Local server deploys via docker compose
```

No staging environment — the local server **is** production. Test locally before pushing to `main`.

---

### Option A (Recommended): Self-Hosted GitHub Actions Runner

Install a GitHub Actions runner directly on the local server. The runner pulls code and executes deploy steps natively — no SSH tunnel needed, no public IP required.

#### Step 1: Install Runner on Local Server
```bash
# SSH into your local server, then:
mkdir actions-runner && cd actions-runner

# Download latest runner (check https://github.com/actions/runner/releases)
curl -o actions-runner-win-x64-2.320.0.zip -L \
  https://github.com/actions/runner/releases/download/v2.320.0/actions-runner-win-x64-2.320.0.zip

# Or for Linux:
# curl -o actions-runner-linux-x64-2.320.0.tar.gz -L \
#   https://github.com/actions/runner/releases/download/v2.320.0/actions-runner-linux-x64-2.320.0.tar.gz

# Configure — get the token from GitHub: Settings → Actions → Runners → New runner
./config.cmd --url https://github.com/YOUR_ORG/lims --token YOUR_TOKEN

# Run as a service
./svc.cmd install
./svc.cmd start
```

#### Step 2: Pipeline Definition

The pipeline runs on the local server directly, so it has access to `docker compose`, the `.env` file, and the local filesystem:

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # All CI jobs run on GitHub's cloud runners — no local resources needed
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Lint Backend
        run: |
          cd backend
          pip install ruff
          ruff check app/

      - name: Lint Frontend
        run: |
          cd frontend
          npm ci
          npm run lint
          npx tsc --noEmit

  # Only the deploy job runs on the local server
  deploy:
    needs: lint
    if: github.ref == 'refs/heads/main'
    runs-on: self-hosted  # ← runs on your local server

    steps:
      - uses: actions/checkout@v4

      - name: Deploy with Docker Compose
        working-directory: .  # repo root on local server
        run: |
          # Build fresh images
          docker compose build backend frontend

          # Restart services (database is excluded — preserves data)
          docker compose up -d --force-recreate backend frontend caddy

          # Clean up old images
          docker image prune -f

      - name: Verify Deployment
        run: |
          for i in {1..12}; do
            curl -sf http://localhost:8000/api/v1/health && break
            sleep 5
          done
```

#### Step 3: Secrets on Self-Hosted Runner

Self-hosted runners can access **files already on the server**. Store your `.env` file directly on the server instead of in GitHub Secrets:

```bash
# On the local server only — never commit this file
# The runner picks it up because it checks out the repo alongside the existing .env
cat > /opt/lims/.env << 'EOF'
DATABASE_URL=postgresql+asyncpg://lims:your_password@database:5432/lims
JWT_SECRET_KEY=your_secure_random_64char_hex
ENVIRONMENT=production
CORS_ORIGINS=https://lims.institute.local
EOF
```

---

### Option B (Simpler Fallback): Git-Based Polling Deploy

No GitHub Actions runner needed. A simple bash script on the local server polls for new commits every minute:

```bash
#!/bin/bash
# /opt/lims/deploy.sh — run via cron: * * * * * /opt/lims/deploy.sh

REPO_DIR="/opt/lims"
BRANCH="main"
LOG_FILE="/var/log/lims-deploy.log"

cd "$REPO_DIR" || exit 1

# Fetch latest without merging
git fetch origin "$BRANCH"

# Check if local HEAD differs from remote
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/"$BRANCH")

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] New commit detected: $REMOTE" >> "$LOG_FILE"

    # Pull latest code
    git pull origin "$BRANCH"

    # Rebuild and restart
    docker compose build backend frontend
    docker compose up -d --force-recreate backend frontend caddy

    echo "[$(date)] Deploy complete" >> "$LOG_FILE"
fi
```

```bash
# Install as cron job — runs every minute
# crontab -e
* * * * * /opt/lims/deploy.sh
```

**Limitations:**
- No PR gate — pushes go straight to production
- No lint or test checks before deploy
- No deployment failure alerts

---

### Pipeline Comparison Summary

| Feature | Option A (Self-hosted) | Option B (Polling) |
|---------|----------------------|-------------------|
| PR checks before deploy | ✅ | ❌ |
| Lint & type checks run | ✅ | ❌ |
| Works without public IP | ✅ | ✅ |
| Zero dependencies | ❌ (needs runner) | ✅ (just bash) |
| Deploy speed | ~2 min | ~1 min |
| Setup time | 30 min | 5 min |

---

## Security Hardening Checklist

- [x] **JWT rotation** — Access token (15 min) + refresh token (7 days) with rotation
- [x] **Password hashing** — bcrypt with 12 rounds
- [x] **Account lockout** — 5 failed attempts → 15 min lock
- [x] **Password policy** — Min 8 chars, upper+lower+digit+special
- [x] **HttpOnly cookies** — Access and refresh tokens in HttpOnly, Secure, SameSite=Lax
- [x] **Config validation** — Rejects default JWT secret
- [ ] **CSP headers** — MISSING
- [ ] **CSRF protection** — MISSING
- [ ] **Rate limiting** — Only on auth; MISSING on financial endpoints
- [ ] **Non-root container** — Backend Dockerfile runs as root
- [ ] **File upload validation** — MISSING (no type/size checks)
- [ ] **Error monitoring** — MISSING (Sentry)
- [ ] **Database backups** — MISSING

---

## Observability & Monitoring Strategy

### Phase 1 (Immediate — Pre-Launch)
1. **Sentry** for error tracking (free tier: 5k events/month)
   - `sentry-sdk[fastapi]` in backend
   - Initialize in `main.py` with request tracing
2. **Health check enhancement**
   - Check DB connection pool
   - Check Caddy/backend connectivity
   - Return status per component

### Phase 2 (Week 1 Post-Launch)
3. **Structured logging** — `python-json-logger` or `structlog`
   - JSON format for log shipping
   - Request ID correlation via middleware
4. **Log shipping** — `filebeat` or `fluentd` to send logs to centralized storage

### Phase 3 (Month 1 Post-Launch)
5. **Prometheus + Grafana** for metrics
   - Request latency, error rates, DB query performance
   - Business metrics (daily revenue, enrollments)
6. **Uptime monitoring** — Healthcheck.io, Better Uptime, or similar

---

## Phased Implementation Timeline

| Phase | Items | Effort | Owner |
|-------|-------|--------|-------|
| **Pre-Launch (Week 0)** | C-1 (Sentry), C-2 (Backups), C-4 (Docker user), C-5 (CSRF), H-2 (CSP), H-5 (Rate limits), H-6 (Compose), H-8 (Cleanup), M-2 (Let's Encrypt) | 15h | Backend |
| **Launch Gate** | Blocking items resolved → **GO** | — | — |
| **Week 1 Post-Launch** | C-3 (CI/CD), H-1 (Unit tests start), H-7 (Logging), M-1, M-3, M-4 | 60h | Backend + DevOps |
| **Week 2-3 Post-Launch** | H-3 (N+1 fixes), H-4 (Redis cache), M-7 (Health check), M-8 (Pagination) | 20h | Backend |
| **Month 2** | M-5 (Column cleanup), M-6 (Strict TS), M-9 (S3 storage), Grafana dashboards | 16h | Full-stack |

---

## Appendix A: Service-Level Findings

### Backend
| File | Issue | Severity | Recommendation |
|------|-------|----------|----------------|
| `main.py:42-45` | Health check too minimal | MEDIUM | Add DB pool + dependency checks |
| `security.py:21-37` | JWT uses HS256 | LOW | Consider RS256 for multi-service |
| `dependencies.py:112-113` | `is_superadmin` in use | MEDIUM | Replace with role check |
| `rate_limit.py:1-4` | Only IP-based key func | LOW | Add per-user key for auth'd routes |
| `session.py:10-13` | pool_size=10, max_overflow=20 | LOW | Tune based on expected concurrency |
| `config.py:21` | Validates default JWT key | ✅ GOOD | Keep this pattern |
| `storage.py:1-37` | Local filesystem | MEDIUM | Migrate to S3 |

### Frontend
| File | Issue | Severity | Recommendation |
|------|-------|----------|----------------|
| `AuthContext.tsx:89` | Empty catch in logout | LOW | Log error, don't swallow |
| `api.ts:31` | Refresh via raw axios | LOW | Use apiClient for consistency |
| `middleware.ts:65-83` | Client-side JWT decode | LOW | Consider server-side validation |
| `package.json` | No `test` script | MEDIUM | Add vitest or jest for unit tests |

### Infrastructure
| File | Issue | Severity | Recommendation |
|------|-------|----------|----------------|
| `docker-compose.yml:36-72` | Services commented out | HIGH | Uncomment for production |
| `Caddyfile:12` | `tls internal` | MEDIUM | Switch to Let's Encrypt |
| `frontend/Dockerfile:25-26` | Correct non-root user | ✅ GOOD | Pattern for backend Dockerfile |
| `init.sql:1-2` | Only pgvector | LOW | Add extensions as needed |

---

*Report generated 2026-07-06. All code references are from the `main` branch at time of assessment.*
