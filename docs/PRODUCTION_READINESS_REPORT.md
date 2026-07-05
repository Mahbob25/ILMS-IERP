# LIMS Production Readiness Assessment Report

> **Author:** Senior Staff Engineer / DevOps Lead  
> **Date:** July 6, 2026  
> **Version Reviewed:** v1.7  
> **Project:** Learning Institution Management System (LIMS)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Production Readiness Scorecard](#3-production-readiness-scorecard)
4. [Gap Analysis](#4-gap-analysis)
5. [Critical Issues (Must-Fix Before Launch)](#5-critical-issues-must-fix-before-launch)
6. [High Priority Improvements](#6-high-priority-improvements)
7. [Medium Priority Improvements](#7-medium-priority-improvements)
8. [CI/CD Pipeline Strategy](#8-cicd-pipeline-strategy)
9. [Observability & Monitoring Plan](#9-observability--monitoring-plan)
10. [Security Hardening Checklist](#10-security-hardening-checklist)
11. [Recommended Launch Timeline](#11-recommended-launch-timeline)
12. [Appendix: Architecture Diagram](#12-appendix-architecture-diagram)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Executive Summary

LIMS (Learning Institution Management System) is a **production-capable MVP** that has been thoughtfully architected with modern patterns: modular FastAPI backend, Next.js 14 frontend, proper RBAC/authentication, rate limiting, audit logging, and database migrations. The codebase shows strong engineering discipline.

**Verdict: CONDITIONALLY READY FOR PRODUCTION** — but with **5 critical blockers** that must be resolved before launch, plus **8 high-priority items** that should be completed within the first sprint after launch.

### Overall Score: 6.5 / 10

| Category | Score | Notes |
|----------|-------|-------|
| Architecture & Design | 8/10 | Modular, clean separation of concerns |
| Security | 6/10 | Good fundamentals, missing critical hardening |
| Testing | 4/10 | E2E API tests only, no unit tests, no frontend tests |
| Observability | 3/10 | Bare minimum — no structured logging, APM, or alerts |
| Infrastructure | 5/10 | Dockerized but no CI/CD, no IaC, no backup strategy |
| Data Integrity | 7/10 | Migrations, soft deletes, audit logs — solid foundation |
| Performance | 6/10 | Connection pooling, rate limiting — but no caching layer |

---

## 2. System Overview

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 14.2.3 |
| **Frontend UI** | React 18 + Tailwind CSS | 18.3.1 / 3.4.4 |
| **Backend** | FastAPI | 0.111.0 |
| **ORM** | SQLAlchemy (async) | 2.0.30 |
| **Database** | PostgreSQL 16 + pgvector | 16 |
| **Auth** | JWT (access/refresh tokens via HttpOnly cookies) | PyJWT 2.8.0 |
| **Password Hashing** | bcrypt | 5.0.0 (rounds=12) |
| **Rate Limiting** | slowapi | 0.1.9 |
| **Migrations** | Alembic | 1.13.1 |
| **Infrastructure** | Docker Compose + Caddy | Latest |
| **Testing** | Playwright (E2E API tests) | 1.61.1 |

### Architecture Pattern

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Next.js   │────▶│  FastAPI     │────▶│  PostgreSQL   │
│   Frontend  │     │  (async)     │     │  + pgvector   │
│   :3000     │     │  :8000       │     │  :5440        │
└─────────────┘     └──────────────┘     └───────────────┘
       │                    │                     │
       │                    │                     │
       ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────┐
│                  Caddy Reverse Proxy                 │
│         TLS (self-signed internal), gzip, routing    │
└─────────────────────────────────────────────────────┘
```

### Module Breakdown

| Module | Purpose | Endpoints |
|--------|---------|-----------|
| `identity` | Auth, Users, Roles, Employees, Permissions | 20+ endpoints |
| `academic` | Courses, Sections, Students, Enrollments, Certificates | 15+ endpoints |
| `lms` | Attendance, Assignments, Grades, Submissions | 15+ endpoints |
| `financial` (in lms) | Payments, Expenses, Wallets, Daily Closures | 15+ endpoints |
| `dashboard` | Aggregated role-specific views | ~5 endpoints |

---

## 3. Production Readiness Scorecard

### ✅ Passed Checks

| Check | Status | Evidence |
|-------|--------|----------|
| Authentication | ✅ PASS | JWT access/refresh token rotation, HttpOnly cookies, SameSite=Lax |
| Password Security | ✅ PASS | bcrypt (rounds=12), strength validation (length, upper, lower, digit, special) |
| Account Lockout | ✅ PASS | 5 failed attempts → 15-min lockout |
| Rate Limiting | ✅ PASS | 3 req/min login, 10 req/min refresh, global limiter |
| RBAC | ✅ PASS | Role-based access + page-level permission checking |
| Audit Logging | ✅ PASS | All auth events, user CRUD, employee changes logged with IP |
| Soft Delete | ✅ PASS | Users/Employees soft-deleted via `is_active` flag |
| CORS | ✅ PASS | Configurable origins, credentials allowed |
| DB Connection Pooling | ✅ PASS | pool_size=10, max_overflow=20, pool_pre_ping=True |
| Input Validation (Pydantic) | ✅ PASS | Zod-equivalent via Pydantic v2 schemas |
| Database Migrations | ✅ PASS | Alembic with ~20 versioned migrations |
| Rate Limit on Login | ✅ PASS | 3 requests per minute |
| Health Check Endpoint | ✅ PASS | `GET /api/v1/health` |

### ❌ Failed / Missing Checks

| Check | Status | Impact |
|-------|--------|--------|
| Unit Tests (Backend) | ❌ MISSING | Cannot safely refactor; no regression safety net |
| Unit Tests (Frontend) | ❌ MISSING | Components untested; UI regressions invisible |
| CI/CD Pipeline | ❌ MISSING | Manual deploys only; no automated gates |
| Structured Logging | ❌ MISSING | `print()`/`console.log()` scattering; no log aggregation |
| Error Monitoring (Sentry) | ❌ MISSING | Blind to production errors |
| HTTPS (Production) | ❌ NOT CONFIGURED | Caddy uses `tls internal` (self-signed); no Let's Encrypt |
| Backup Strategy | ❌ MISSING | No automated pg_dump or point-in-time recovery |
| Container Orchestration | ❌ NOT PRODUCTION-READY | Docker Compose only; no Kubernetes or Cloud Run config |
| Secrets Management | ❌ WEAK | `.env` with `CHANGE_ME_BEFORE_PRODUCTION` committed (ignored but risky) |
| File Storage | ❌ LOCAL ONLY | Uploads to local filesystem; not cloud/S3 |
| Caching Layer | ❌ MISSING | No Redis; every request hits the database |
| Database Connection Pool Monitoring | ❌ MISSING | No visibility into pool saturation |
| API Versioning Headers | ❌ NOT IMPLEMENTED | URL-based only; no Sunset/Deprecation headers |
| Data Retention Policy | ❌ NOT DEFINED | Audit logs, refresh tokens grow unbounded |
| Rate Limit on All Endpoints | ⚠️ PARTIAL | Only login and refresh have explicit rate limits |
| Email Validation | ⚠️ PARTIAL | Pydantic `EmailStr` validates format only; no domain MX check |

---

## 4. Gap Analysis

### 4.1 Testing Gaps (HIGH RISK)

```
Current Coverage:
┌────────────────────────────────────────────────┐
│ E2E API Tests (Playwright)    ████████░░ 20 files│
│ Backend Unit Tests (pytest)   ░░░░░░░░░░  0 files│
│ Frontend Unit Tests (Jest)    ░░░░░░░░░░  0 files│
│ Frontend Component Tests      ░░░░░░░░░░  0 files│
│ Integration Tests             ░░░░░░░░░░  0 files│
└────────────────────────────────────────────────┘
```

The backend has **zero unit tests**. There are debug scripts in the root (`test_hash.py`, `check_teacher.py`, `check_expenses.py`) indicating manual testing is the norm. This is **the single highest-risk gap** for production.

### 4.2 Observability Gaps (HIGH RISK)

- **No structured logging** — The backend uses FastAPI's default logging; no JSON-formatted logs with correlation IDs
- **No error tracking** — Sentry, Rollbar, or Datadog not configured
- **No APM** — No request tracing, no slow query detection, no endpoint latency tracking
- **No health check depth** — `GET /health` returns a static `{"status":"ok"}` without checking DB connectivity, Redis, or disk space
- **No metrics** — No Prometheus metrics, no request counters, no error rate dashboards
- **No alerting** — No PagerDuty/Opsgenie integration for p99 latency or 5xx spikes

### 4.3 Infrastructure Gaps (HIGH RISK)

- **No CI/CD pipeline** — Every deploy is manual
- **No Infrastructure as Code** — No Terraform/Pulumi for cloud resources
- **No container registry strategy** — No automated image builds or tagging
- **Database backups not automated** — No cron-based pg_dump, no WAL archiving for PITR
- **Secrets management** — `.env` files with plaintext secrets; no Vault/Secret Manager integration
- **No staging environment** — Development → Production leap with no QA/staging tier

### 4.4 Performance & Scalability Gaps (MEDIUM RISK)

- **No caching** — Every page load queries the database directly. Dashboard aggregate queries will be slow as data grows
- **No pagination defaults** — Some list endpoints default to limit=50 but others could be unbounded
- **N+1 query risk** — `list_employees` and `get_teachers_with_stats` use loop-based queries for related data
- **Uploads on local disk** — Not horizontally scalable; will break with multiple container instances

### 4.5 Security Gaps (HIGH RISK)

- **JWT Secret in `.env`** — The default value `CHANGE_ME_BEFORE_PRODUCTION` is a placeholder, but the validation in `config.py` correctly rejects it. However, no automated check prevents accidental deployment
- **No Content Security Policy** — No CSP headers to prevent XSS
- **No CSRF protection** — SameSite=Lax helps but there's no CSRF token mechanism
- **Local file storage** — Uploaded files served directly from disk; no virus scanning
- **No rate limiting on most endpoints** — Only login and token refresh have explicit limits; payment/expense creation endpoints are unprotected
- **Error message verbosity** — Some Pydantic validation errors may leak schema internals

### 4.6 Data Integrity Gaps (MEDIUM RISK)

- **No database backup verification** — Backups may exist but are never tested via restore drill
- **Token cleanup** — `RefreshToken` records are never garbage-collected; the table will grow unbounded
- **Audit log retention** — `AuditLog` table has no archiving mechanism
- **No referential integrity for some cascades** — Some cascade rules use `SET NULL` which could lead to orphaned records

---

## 5. Critical Issues (Must-Fix Before Launch)

These issues will cause data loss, security breaches, or complete service failure in production.

### CRITICAL-1: JWT Secret Leak Risk

**Severity:** 🔴 CRITICAL  
**File:** `backend/.env`  
**Issue:** The `.env` file contains `JWT_SECRET_KEY=CHANGE_ME_BEFORE_PRODUCTION`. While the code validates against the default, the real risk is that someone deploys without changing it.  
**Fix:** 
1. Generate a cryptographically secure key on deploy
2. Use environment variable injection via the container runtime (not `.env` files)
3. Add a pre-start health check that crashes if `JWT_SECRET_KEY` contains known weak values

### CRITICAL-2: No Database Backup Strategy

**Severity:** 🔴 CRITICAL  
**Issue:** There is no automated backup mechanism. A single `DROP TABLE` or hardware failure means permanent data loss.  
**Fix:**
1. Implement daily `pg_dump` to cloud object storage (GCS/S3)
2. Enable PostgreSQL WAL archiving for point-in-time recovery
3. Document and test restore procedures

### CRITICAL-3: No Error Monitoring

**Severity:** 🔴 CRITICAL  
**Issue:** Production errors will be invisible. No Sentry, no crash reporting, no alerting.  
**Fix:**
1. Integrate `sentry-sdk` into the FastAPI application
2. Configure error alerting (email, Slack, PagerDuty)
3. Add error boundary in frontend for unhandled React errors

### CRITICAL-4: Local File Storage Not Horizontally Scalable

**Severity:** 🔴 CRITICAL  
**Issue:** File uploads go to `backend/uploads/`. With multiple container instances or auto-scaling, files will be lost.  
**Fix:**
1. Migrate to S3-compatible object storage (Google Cloud Storage, AWS S3, MinIO)
2. Use signed URLs for secure access
3. Implement file size limits and virus scanning

### CRITICAL-5: No Unit Tests = Blind Refactoring

**Severity:** 🔴 CRITICAL  
**Issue:** Zero unit tests means every deployment is a leap of faith. Regression bugs will reach production.  
**Fix:**
1. Add pytest + pytest-asyncio for backend unit tests
2. Cover all service layer functions (identity, academic, lms)
3. Set up CI to enforce 80%+ coverage  

---

## 6. High Priority Improvements

### HIGH-1: Implement CI/CD Pipeline

**Severity:** 🟠 HIGH  
**Rationale:** Manual deploys are error-prone and unsustainable.  
**Implementation:** See Section 8 for full strategy.

### HIGH-2: Structured Logging & Correlation IDs

**Severity:** 🟠 HIGH  
**Rationale:** Debugging production issues requires traceable logs.  
**Implementation:**
- Add `structlog` or `python-json-logger` to FastAPI
- Include `request_id` (UUID) on every log line
- Log request duration, user ID, and endpoint path

### HIGH-3: Upgrade Health Check

**Severity:** 🟠 HIGH  
**Rationale:** A static health endpoint provides zero value.  
**Fix:**
```python
@app.get("/api/v1/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    db_ok = False
    try:
        await db.execute(select(1))
        db_ok = True
    except:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.7",
        "database": "connected" if db_ok else "disconnected",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
```

### HIGH-4: Rate Limit All State-Modifying Endpoints

**Severity:** 🟠 HIGH  
**Rationale:** Payment, expense, and enrollment endpoints have no rate limiting.  
**Implementation:**
```python
@lms_router.post("/payments", ...)
@limiter.limit("10/minute")
```

### HIGH-5: Add Content Security Policy Headers

**Severity:** 🟠 HIGH  
**Rationale:** CSP prevents XSS attacks.  
**Implementation:** Add CSP in Caddyfile or Next.js middleware.

### HIGH-6: Implement Refresh Token Garbage Collection

**Severity:** 🟠 HIGH  
**Rationale:** The `refresh_tokens` table grows without bound.  
**Implementation:** Daily cleanup job for expired/revoked tokens older than 30 days.

### HIGH-7: Add Database Connection Health Monitoring

**Severity:** 🟠 HIGH  
**Rationale:** Pool exhaustion silently degrades all endpoints.  
**Implementation:** Expose pool stats via health endpoint; alert when pool utilization >80%.

### HIGH-8: N+1 Query Optimization

**Severity:** 🟠 HIGH  
**Rationale:** `list_employees()` and `get_teachers_with_stats()` query the database in loops.  
**Implementation:** Use joinedload or subquery loading instead of per-item queries.

---

## 7. Medium Priority Improvements

| # | Improvement | Rationale |
|---|-------------|-----------|
| MED-1 | Add pagination metadata to all list endpoints | Currently some endpoints return lists without `total`/`page`/`per_page` |
| MED-2 | Implement Redis caching for dashboard queries | Dashboard queries aggregate multiple tables; caching reduces load |
| MED-3 | Add API versioning strategy (Sunset headers) | Prepare for v2 without breaking existing clients |
| MED-4 | Implement data archiving for audit logs | `audit_logs` table will grow very large over time |
| MED-5 | Add rate limiting on frontend API calls | Axios interceptor should debounce rapid requests |
| MED-6 | Frontend loading/error/skeleton states | Some page transitions lack loading indicators |
| MED-7 | Add email notification for failed logins | Security team should know about brute-force attempts |
| MED-8 | Implement session timeout warning | Users should be warned before token expiry |
| MED-9 | Frontend component tests | Key dashboard components should have render tests |
| MED-10 | Accessibility audit | Ensure keyboard navigation and screen reader support |

---

## 8. CI/CD Pipeline Strategy (Local Server)

### 8.1 Architecture Overview

Since your system deploys to a **local server** with a **public IP** and you work remotely via **GitHub**, the optimal approach is:

```
[You] ──git push──▶ [GitHub] ──trigger──▶ [GitHub Actions (cloud)]
                                              │
                                    ┌─────────┴──────────┐
                                    │                    │
                                    ▼                    ▼
                              Lint + Test           SSH Deploy Job
                                                       │
                                              (SSH into local server)
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │   Local Server    │
                                              │  ┌──────────────┐ │
                                              │  │ git pull      │ │
                                              │  │ docker-compose│ │
                                              │  │ up --build -d │ │
                                              │  │ alembic upgrade│ │
                                              │  └──────────────┘ │
                                              └──────────────────┘
```

**Key principle:** GitHub Actions runs lint + tests in the cloud. Deployment happens via SSH into your local server.

### 8.2 Recommended Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| **Version Control** | GitHub | Source of truth |
| **CI/CD** | GitHub Actions | Pipeline orchestration (cloud runners) |
| **Deployment** | SSH + Docker Compose | Pull & restart on local server |
| **Container Runtime** | Docker Compose | Run backend, frontend, DB, Caddy |
| **Reverse Proxy** | Caddy (already configured) | TLS, routing, static files |
| **Database** | PostgreSQL 16 (local) | Already configured |
| **Secrets** | `.env.production` on server + GitHub Secrets | JWT keys, DB passwords |

### 8.3 Prerequisites (Local Server Setup)

Before the pipeline works, set up the local server:

```bash
# 1. Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh

# 2. Install Caddy (or use the Docker image)
# 3. Clone the repo on the server
git clone https://github.com/YOUR_ORG/lims.git /opt/lims
cd /opt/lims

# 4. Create production .env file (never committed)
cp backend/.env.example backend/.env.production
# Edit with real secrets: JWT_SECRET_KEY, DATABASE_URL, etc.

# 5. Firewall: open only ports 80, 443, and SSH (22)
# 6. Set up SSH key for GitHub Actions deploy user
```

### 8.4 Pipeline Stages

```yaml
# .github/workflows/deploy.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ──────────────────────────────────────────────
  # STAGE 1: Lint & Type Check
  # ──────────────────────────────────────────────
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Backend lint (ruff)
        run: pip install ruff && ruff check backend/

      - name: Frontend lint + type check
        run: |
          cd frontend
          npm ci
          npm run lint
          npx tsc --noEmit

  # ──────────────────────────────────────────────
  # STAGE 2: Unit Tests (80%+ coverage gate)
  # ──────────────────────────────────────────────
  test:
    needs: lint
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: lims
          POSTGRES_PASSWORD: lims_test
          POSTGRES_DB: lims_test
        ports:
          - 5440:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - name: Backend tests (pytest + coverage)
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov httpx
          DATABASE_URL=postgresql+asyncpg://lims:lims_test@localhost:5440/lims_test \
          JWT_SECRET_KEY=test-key-not-for-production \
          pytest --cov=app --cov-fail-under=80

      - name: Frontend tests (vitest)
        run: |
          cd frontend
          npm ci
          npm run test -- --coverage

  # ──────────────────────────────────────────────
  # STAGE 3: Deploy to Local Server (main only)
  # ──────────────────────────────────────────────
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: SSH into local server and deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.LOCAL_SERVER_HOST }}
          port: ${{ secrets.LOCAL_SERVER_PORT || 22 }}
          username: ${{ secrets.LOCAL_SERVER_USER }}
          key: ${{ secrets.LOCAL_SERVER_SSH_KEY }}
          script: |
            set -e
            cd /opt/lims

            # Pull latest code
            git pull origin main

            # Copy production env (never in repo)
            cp backend/.env.production backend/.env

            # Rebuild and restart containers
            docker compose build
            docker compose up -d

            # Run database migrations
            docker compose exec -T backend alembic upgrade head

            # Clean up old images
            docker image prune -f

            echo "✅ Deploy complete"
```

### 8.5 Branch Strategy

```
main (production)
  └── develop (staging)
       ├── feature/xxx
       └── fix/xxx
```

| Branch | Deploy Action | Gates |
|--------|--------------|-------|
| `feature/*` | None (PR only) | Lint + Unit tests |
| `develop` | None (manual test on dev machine) | Lint + Unit tests |
| `main` | SSH deploy to local server | Lint + Unit + Manual approval |

### 8.6 GitHub Secrets to Configure

| Secret | Description | Example |
|--------|-------------|---------|
| `LOCAL_SERVER_HOST` | Public IP or domain of local server | `203.0.113.10` |
| `LOCAL_SERVER_PORT` | SSH port (default 22) | `22` |
| `LOCAL_SERVER_USER` | SSH user | `deploy` |
| `LOCAL_SERVER_SSH_KEY` | Private SSH key (deploy user) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### 8.7 Migration Strategy

Migrations run **inside** the deploy script (not in the app container startup) to avoid:
- Multiple container instances racing migrations
- Migration failures taking down the app on restart

```bash
# Inside SSH deploy script:
docker compose exec -T backend alembic upgrade head
```

This runs alembic against the production database via the **existing** backend container, ensuring only one migration runs at a time.

### 8.8 Optional: Self-Hosted Runner Alternative

If the local server lacks a public SSH port (e.g., behind NAT), use a **self-hosted GitHub Actions runner** instead:

```bash
# On the local server:
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/YOUR_ORG/lims --token YOUR_TOKEN
sudo ./svc.sh install
sudo ./svc.sh start
```

Then add `runs-on: self-hosted` to the deploy job. The runner lives on the server, so no SSH needed — it can run `docker compose` directly.

---

## 9. Observability & Monitoring Plan (Local Server)

### 9.1 Recommended Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| **Error Tracking** | Sentry (cloud, free tier) | Catch production errors |
| **Structured Logging** | `structlog` (Python) + file rotation | JSON logs on disk |
| **Log Viewing** | `journald` + `journalctl` or `lnav` | Tail and search logs |
| **Metrics** | Prometheus + node_exporter | Server health metrics |
| **Dashboards** | Grafana (self-hosted via Docker) | Visualize metrics |
| **Uptime** | Uptime Kuma (self-hosted) or cron + healthcheck | Ping the server |
| **Backups** | `pg_dump` cron job + rsync to external storage | Database recovery |

### 9.2 Minimal Setup (Start Here)

For a single-server deployment, start simple:

```bash
# 1. Structured JSON logging (backend)
# Already implemented via structlog → logs to stdout + file

# 2. Sentry (free tier)
# Add DSN to .env.production, done.

# 3. Daily DB backup (cron on the server)
0 3 * * * pg_dump -U lims lims | gzip > /backups/lims-$(date +\%Y-\%m-\%d).sql.gz

# 4. Uptime monitoring (cron)
*/5 * * * * curl -sf http://localhost:8000/api/v1/health || echo "Down" | mail -s "LIMS Down" admin@example.com

# 5. Disk usage alert (cron)
0 * * * * df -h / | awk 'NR==2 {if ($5+0 > 80) print "Disk nearly full"}' | mail -s "LIMS Disk Alert" admin@example.com
```

### 9.3 Advanced Setup (Recommended)

For production readiness, run these as Docker containers:

```yaml
# docker-compose.observability.yml (optional, alongside main compose)
services:
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes: ["./prometheus.yml:/etc/prometheus/prometheus.yml"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    depends_on: [prometheus]

  node_exporter:
    image: prom/node-exporter:latest
    network_mode: host
    privileged: true

  uptime-kuma:
    image: louislam/uptime-kuma:latest
    ports: ["3002:3001"]
    volumes: ["./uptime-kuma:/app/data"]
```

### 9.4 Metrics to Track

| Metric | Source | Tool | Alert Threshold |
|--------|--------|------|-----------------|
| Request latency (p50/p95/p99) | FastAPI + structlog | Grafana | p99 > 2000ms |
| Error rate (5xx) | Sentry + logs | Sentry / Grafana | > 1% of requests |
| DB connection pool usage | App `/health` endpoint | Grafana | > 80% |
| CPU / RAM / Disk | node_exporter | Prometheus + Grafana | CPU > 80%, Disk > 80% |
| Failed login attempts | Audit log | Log parser | > 10/min |
| Certificate expiration | Cron + certbot | Caddy auto-renewal | < 30 days |
| Docker container status | `docker ps` | Cron check | Any container not "Up" |

### 9.5 Sentry Integration

```python
# backend/app/core/sentry.py
import sentry_sdk
from app.core.config import settings

def init_sentry():
    if settings.ENVIRONMENT == "production":
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.2,
            profiles_sample_rate=0.1,
        )
```

Sentry's **free tier** (5k events/month) is sufficient for a small team. Upgrade only if you exceed the quota.

---

## 10. Security Hardening Checklist

### Pre-Launch (Must Do)

- [x] JWT with HttpOnly, Secure, SameSite=Lax cookies
- [x] Account lockout after 5 failed attempts
- [x] Password complexity validation (8+ chars, upper, lower, digit, special)
- [x] Rate limiting on login (3 req/min)
- [x] bcrypt password hashing (rounds=12)
- [x] Audit logging for all auth events
- [ ] **Replace JWT secret with strong random value via Secret Manager**
- [ ] **Add CSP headers in Caddyfile**
- [ ] **Add rate limiting on all state-mutating endpoints**
- [ ] **Disable detailed error messages in production**
- [ ] **Add UFW firewall rules (SSH only + app ports)**
- [ ] **Enable HTTPS with Let's Encrypt (Caddy does this automatically)**

### Post-Launch (First Week)

- [ ] **Set up automated PostgreSQL backups (daily pg_dump to external storage)**
- [ ] Set up Sentry error monitoring
- [ ] Enable WAL archiving for point-in-time recovery
- [ ] Move uploads to dedicated volume or NAS mount
- [ ] Add CSRF token validation
- [ ] Implement API key rotation policy
- [ ] Run third-party security audit (npm audit, pip audit)

### Ongoing

- [ ] Weekly dependency scanning (Dependabot)
- [ ] Monthly secrets rotation
- [ ] Quarterly penetration testing
- [ ] Annual access review (active users, stale accounts)

---

## 11. Recommended Launch Timeline

```
Phase 0: NOW ──────────────────────────────────────────────
  □ Fix CRITICAL-1: JWT Secret (1 hour)
  □ Fix CRITICAL-5: Add basic unit tests (3 days)
  □ Set up Sentry error tracking (2 hours)
  □ Add db health check to /health endpoint (30 min)

Phase 1: Week 1 ──────────────────────────────────────────
  □ Set up local server (OS, Docker, firewall) (1 day)
  □ Set up GitHub SSH deploy keys + secrets (2 hours)
  □ Create CI/CD pipeline (GitHub Actions → SSH) (2 days)
  □ Add backup strategy (pg_dump cron + off-server storage) (1 day)
  □ Add basic rate limiting to all endpoints (4 hours)

Phase 2: Week 2 ──────────────────────────────────────────
  □ Implement structured logging (1 day)
  □ Add CSP headers + security headers (2 hours)
  □ Set up Docker Compose for production (1 day)
  □ Refresh token cleanup cron job (4 hours)
  □ Optimize N+1 queries (1 day)

Phase 3: Week 3 ──────────────────────────────────────────
  □ Add frontend loading/error/skeleton states (2 days)
  □ Implement Redis caching for dashboard (2 days)
  □ Add pagination metadata to all list endpoints (1 day)
  □ Set up Prometheus + Grafana monitoring (1 day)
  □ Sentry error tracking integration (2 hours)

Phase 4: Launch ──────────────────────────────────────────
  □ Production dry-run (1 day)
  □ Database migration dry-run (4 hours)
  □ SSL/TLS with Caddy + Let's Encrypt (auto) (2 hours)
  □ Deploy via CI/CD pipeline (1 hour)
  □ Monitor for 24 hours post-launch (1 day)
```

**Minimum Viable Launch Date:** July 20, 2026 (2 weeks from now)  
**Recommended Launch Date:** August 3, 2026 (4 weeks)

---

## 12. Appendix: Architecture Diagram

```
                            INTERNET
                               │
                    (HTTPS :443 / HTTP :80)
                               │
                               ▼
                      ┌─────────────────┐
                      │   Caddy Proxy   │
                      │  (TLS + gzip)   │
                      │  (Auto Let's    │
                      │   Encrypt)      │
                      └────────┬────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  Next.js App  │ │  FastAPI     │ │  Static      │
      │  :3000        │ │  :8000       │ │  Files       │
      │  ────────     │ │  ────────    │ │  /uploads/*  │
      │  AuthContext  │ │  identity    │ │              │
      │  Axios Client │ │  academic    │ │              │
      │  RTL/i18n     │ │  lms         │ │              │
      └──────────────┘ │  financial   │ └──────────────┘
                       │  dashboard   │
                       └──────┬───────┘
                              │
                              ▼
                      ┌──────────────┐
                      │  PostgreSQL  │
                      │  + pgvector  │
                      │  :5440       │
                      │              │
                      │  ┌────────┐  │
                      │  │ WAL    │  │──▶ External storage (backups)
                      │  └────────┘  │
                      └──────────────┘

          ┌──────────────────────────────────────┐
          │      LOCAL SERVER (Ubuntu/Docker)     │
          │  ┌──────┐ ┌──────────┐ ┌──────────┐  │
          │  │Caddy │ │ Backend  │ │ Frontend │  │
          │  │:443  │◀├ :8000    │◀├ :3000    │  │
          │  └──────┘ └──────────┘ └──────────┘  │
          │  ┌──────────┐ ┌────────────────────┐ │
          │  │PostgreSQL│ │ Prometheus+Grafana │ │
          │  │:5440     │ │ (optional)         │ │
          │  └──────────┘ └────────────────────┘ │
          └──────────────────────────────────────┘

Observability Stack:
┌───────────────────────────────────────────┐
│  Sentry (cloud, error tracking)           │
│  structlog (JSON logs) → journald         │
│  Prometheus + Grafana (metrics, optional) │
│  Uptime Kuma or cron (uptime monitoring)  │
└───────────────────────────────────────────┘

CI/CD Pipeline:
┌──────────┐   ┌──────────┐   ┌─────────────────────────────┐
│  git push │──▶│  GitHub  │──▶│  GitHub Actions             │
│  (you)    │   │  remote  │   │  ┌────┐ ┌──────┐ ┌──────┐  │
└──────────┘   └──────────┘   │  │Lint│→│ Test │→│Deploy│  │
                              │  └────┘ └──────┘ │  SSH  │  │
                              └──────────────────┴───────┴──┘
                                                      │
                                                      ▼
                                          ┌────────────────────┐
                                          │  Local Server      │
                                          │  git pull + restart│
                                          └────────────────────┘
```

---

## 13. Implementation Phases

### Phase 1: Server Setup & Critical Fixes (Days 1-3)

| Step | Description | Owner | Est. Time |
|------|-------------|-------|-----------|
| 1.1 | **Decide server OS + install** (recommend Ubuntu 22.04 LTS) | DevOps | 1 day |
| 1.2 | **Install Docker + Docker Compose on server** | DevOps | 2 hours |
| 1.3 | **Generate strong JWT secret** + set up `.env.production` on server | DevOps | 1 hour |
| 1.4 | Add Sentry SDK to backend and frontend | Backend | 2 hours |
| 1.5 | Add meaningful `/health` endpoint with DB check | Backend | 30 min |
| 1.6 | Add rate limits to all state-mutating endpoints | Backend | 4 hours |
| 1.7 | Write foundational unit tests for service layer | Backend | 3 days |
| 1.8 | Add CSP and security headers in Caddyfile | DevOps | 30 min |

### Phase 2: CI/CD & Infrastructure (Days 4-7)

| Step | Description | Owner | Est. Time |
|------|-------------|-------|-----------|
| 2.1 | **Set up GitHub repo + SSH deploy keys** | DevOps | 1 hour |
| 2.2 | **Clone repo to server** at `/opt/lims` + configure `.env.production` | DevOps | 1 hour |
| 2.3 | **Create GitHub Actions workflow** (lint + test + SSH deploy) | DevOps | 2 days |
| 2.4 | **Configure production Docker Compose** (env file, volumes, restart policy) | DevOps | 1 day |
| 2.5 | Add E2E test stage to CI/CD (Playwright) | QA | 1 day |
| 2.6 | Set up daily database backup (pg_dump cron → external storage) | DevOps | 4 hours |

### Phase 3: Observability & Monitoring (Days 8-10)

| Step | Description | Owner | Est. Time |
|------|-------------|-------|-----------|
| 3.1 | Implement structured JSON logging with request IDs | Backend | 1 day |
| 3.2 | Set up Prometheus + Grafana (optional Docker stack) | DevOps | 1 day |
| 3.3 | Configure alerting (cron-based health checks + email) | DevOps | 4 hours |
| 3.4 | Add frontend error boundary + performance monitoring | Frontend | 4 hours |
| 3.5 | Add slow query logging to SQLAlchemy | Backend | 2 hours |

### Phase 4: Performance & Scale (Days 11-14)

| Step | Description | Owner | Est. Time |
|------|-------------|-------|-----------|
| 4.1 | Set up dedicated volume/NAS mount for uploads | DevOps | 1 day |
| 4.2 | Add Redis caching for dashboard aggregate queries | Backend | 2 days |
| 4.3 | Optimize N+1 queries in identity and lms modules | Backend | 1 day |
| 4.4 | Add pagination metadata to all list endpoints | Backend | 1 day |
| 4.5 | Implement refresh token cleanup cron job | Backend | 4 hours |

### Phase 5: Launch Prep (Days 15-16)

| Step | Description | Owner | Est. Time |
|------|-------------|-------|-----------|
| 5.1 | Production dry-run (deploy through CI/CD pipeline) | All | 1 day |
| 5.2 | Database migration dry-run | Backend | 4 hours |
| 5.3 | Security audit (npm audit, pip audit, secrets scan) | DevOps | 4 hours |
| 5.4 | SSL/TLS with Let's Encrypt (Caddy auto-provision) | DevOps | 1 hour |
| 5.5 | Configure UFW firewall (SSH :22 + HTTP :80/443 only) | DevOps | 1 hour |
| 5.6 | Final deploy via CI/CD + 24-hour post-launch monitoring | All | 1 day |

---

## Final Recommendation

**Launch Decision:** 🟡 **CONDITIONAL GO** — Proceed with the understanding that Phases 1-2 (critical fixes + CI/CD) are **hard prerequisites** for production. Phases 3-5 can be completed within the first two weeks post-launch.

**Risk Acceptance:** If leadership accepts the risk of zero unit tests and no error monitoring, the "critical fixes" list can be reduced to just the JWT secret and backup strategy — but this is **strongly NOT recommended**.

**Next Step:** Present this report to the team, assign owners to the Phase 1 items, and begin implementation. I recommend a 30-minute planning session to triage and assign work.

---

*Report generated by Senior Staff Engineer assessment of LIMS codebase v1.7*
