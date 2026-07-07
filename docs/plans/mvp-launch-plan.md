# MVP Launch Plan — LIMS v1.7

**Target:** Production-ready deployment to local server with remote push-to-deploy via GitHub Actions self-hosted runner.

**Scope:** Only the items that block or materially risk the launch. Everything else is deferred.

---

## Phase 0: Container Infrastructure (⏱ 1h)

### 0.1 — Uncomment Backend & Frontend in docker-compose.yml

The services exist but are commented out. Uncomment them and ensure they depend on each other correctly.

**File: `docker-compose.yml`**

Uncomment the `backend:` and `frontend:` blocks. Add a `depends_on: - backend` to the `caddy` service (currently it only depends on `database`).

**Deploy command (after uncommenting):**
```bash
docker compose build backend frontend
docker compose up -d
```

**Verify:** `docker ps` shows all 4 containers: `database`, `backend`, `frontend`, `caddy`.

---

### 0.2 — Non-Root User in Backend Dockerfile

**File: `backend/Dockerfile`**

Add a non-root user before the `COPY . .` line so the container doesn't run as root:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies from builder stage
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# ── Non-root user for security ──
RUN groupadd -r lims && useradd -r -g lims -d /app -s /sbin/nologin lims \
    && chown -R lims:lims /app
USER lims
# ──────────────────────────────

COPY --chown=lims:lims . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Verify:** Rebuild and run — `docker exec lims_backend whoami` returns `lims`.

---

## Phase 1: Security Hardening (⏱ 2h)

### 1.1 — CSP Headers in Caddy

**File: `infrastructure/caddy/Caddyfile`**

Add a Content-Security-Policy header to both the API and frontend routes:

```
aldrasat.edu {
    # Frontend reverse proxy
    handle_path /api/v1/* {
        reverse_proxy backend:8000 {
            header_up X-Real-IP {remote_host}
        }
    }

    handle {
        reverse_proxy frontend:3000
    }

    # Security headers
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://localhost:*;"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }

    # TLS
    tls internal
}
```

### 1.2 — Database Backup Script

**File: `/opt/lims/scripts/backup.sh`** (on the local server)

```bash
#!/bin/bash
# Database backup script — runs daily via cron
# Restore:   docker exec -i lims_database psql -U lims lims < backup.sql

BACKUP_DIR="/opt/lims/backups"
DB_CONTAINER="lims_database"
DB_USER="lims"
DB_NAME="lims"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)


mkdir -p "$BACKUP_DIR"

# Dump
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" \
  --no-owner --no-acl \
  | gzip > "$BACKUP_DIR/lims_db_$TIMESTAMP.sql.gz"

# Prune old backups
find "$BACKUP_DIR" -name "lims_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup complete: lims_db_$TIMESTAMP.sql.gz"
```

**Cron:** `0 3 * * * /opt/lims/scripts/backup.sh`

### 1.3 — Verify Password Policy & Account Lockout are Active

Already implemented, but verify these are set correctly:

**`backend/app/modules/identity/security.py`**
- `bcrypt` rounds = 12 (not reduced)
- Account lockout: 5 failed attempts → 15 min lock

**Verify:**
```bash
# Check bcrypt rounds — hash should start with $2b$12$
docker exec lims_backend python -c "
from app.modules.identity.security import get_password_hash, verify_password
h = get_password_hash('TestPass123!')
print('Hash rounds:', '$2b$12$' in h)
"
```

---

## Phase 2: Monitoring & CI/CD (⏱ 3h)

### 2.1 — Sentry Error Monitoring

**Step 1:** Add `sentry-sdk[fastapi]` to `backend/requirements.txt`:
```
sentry-sdk[fastapi]==2.13.0
```

**Step 2:** Initialize in `backend/app/main.py`:

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

# Before `app = FastAPI(...)`
sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    environment=settings.ENVIRONMENT,
    integrations=[
        FastApiIntegration(),
        SqlalchemyIntegration(),
    ],
    traces_sample_rate=0.1,     # 10% sampling for performance
    send_default_pii=False,      # GDPR-safe
)
```

**Step 3:** Add `SENTRY_DSN` to `backend/app/core/config.py`:

```python
SENTRY_DSN: str = ""
```

**Step 4:** Rebuild and push. Verify by visiting `{server}/api/v1/health` and triggering a test error via a temp endpoint:

```python
@app.get("/api/v1/debug-test-sentry")
async def test_sentry():
    raise ValueError("Test Sentry error — safe to ignore")
```

---

### 2.2 — Self-Hosted GitHub Actions Runner

**On the local server:**

```bash
mkdir -p /opt/actions-runner && cd /opt/actions-runner

# Download runner (Linux example — adjust for your OS)
curl -o actions-runner-linux-x64-2.320.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.320.0/actions-runner-linux-x64-2.320.0.tar.gz
tar xzf actions-runner-linux-x64-2.320.0.tar.gz

# Configure — GET TOKEN from GitHub: Settings → Actions → Runners → New runner
./config.sh --url https://github.com/YOUR_ORG/YOUR_REPO --token YOUR_TOKEN \
  --name lims-prod --labels lims-prod --work /opt/lims/_work

# Install as a service
sudo ./svc.sh install
sudo ./svc.sh start
```

**Verify:** GitHub shows the runner as "Idle" with green status.

---

### 2.3 — CI/CD Pipeline (.github/workflows/ci-cd.yml)

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ── Cloud runner: lint & type-check ──
  lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        shell: bash

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

  # ── Self-hosted runner: build & deploy on the local server ──
  deploy:
    needs: lint
    if: github.ref == 'refs/heads/main'
    runs-on: lims-prod

    defaults:
      run:
        shell: bash

    steps:
      - uses: actions/checkout@v4

      - name: Build & Deploy
        working-directory: /opt/lims
        run: |
          # Copy new code into the working directory
          rsync -a --delete ${{ github.workspace }}/ /opt/lims/ --exclude=.env --exclude=backups --exclude=_work

          # Build and restart
          docker compose build backend frontend
          docker compose up -d --force-recreate backend frontend caddy
          docker image prune -f

      - name: Verify Health
        run: |
          for i in {1..12}; do
            if curl -sf http://localhost:8000/api/v1/health; then
              echo "✅ Deployment verified"
              exit 0
            fi
            sleep 5
          done
          echo "❌ Health check failed"
          docker compose logs --tail=50 backend
          exit 1
```

**Secrets to set in GitHub:**
| Name | Value |
|------|-------|
| `JWT_SECRET_KEY` | Production JWT secret |
| `DATABASE_URL` | Full connection string |
| `POSTGRES_PASSWORD` | DB password |
| `SENTRY_DSN` | Sentry project DSN |

---

## Phase 3: Post-Launch (Week 1)

### 3.1 — Fix N+1 Queries

Three confirmed N+1 loops in the backend. Each fix follows the same pattern: batch-load instead of looping.

#### a) `identity/service.py` — `get_teachers_with_stats()` (line 33)

**Before:** Loop over teachers, query section count + wallet per teacher.

**After:** Batch-load all section counts and wallets in 2 queries:

```python
async def get_teachers_with_stats(db: AsyncSession) -> list[dict]:
    employees_result = await db.execute(
        select(Employee).where(
            Employee.employee_type == EmployeeType.TEACHER
        ).order_by(Employee.full_name)
    )
    teachers = employees_result.scalars().all()
    if not teachers:
        return []

    teacher_ids = [t.id for t in teachers]

    # Batch-load section counts
    count_result = await db.execute(
        select(CourseSection.teacher_id, func.count().label("count"))
        .where(CourseSection.teacher_id.in_(teacher_ids))
        .group_by(CourseSection.teacher_id)
    )
    sections_map = dict(count_result.fetchall())

    # Batch-load wallets
    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id.in_(teacher_ids))
    )
    wallets_map = {w.teacher_id: w for w in wallet_result.scalars().all()}

    return [
        {
            "id": t.id,
            "full_name": t.full_name,
            "employee_type": t.employee_type.value,
            "is_active": t.is_active,
            "sections_count": sections_map.get(t.id, 0),
            "wallet_balance": float(wallets_map[t.id].balance) if t.id in wallets_map else 0.0,
            "wallet_last_updated": wallets_map[t.id].last_updated.isoformat()
                if t.id in wallets_map and wallets_map[t.id].last_updated else None,
        }
        for t in teachers
    ]
```

#### b) `identity/service.py` — `list_employees()` (line 182)

**Before:** Per-employee query to check if user account exists.

**After:** Single batch query:

```python
async def list_employees(
    db: AsyncSession,
    employee_type: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    query = select(Employee).order_by(Employee.full_name)

    if employee_type:
        try:
            type_enum = EmployeeType(employee_type)
            query = query.where(Employee.employee_type == type_enum)
        except ValueError:
            pass

    if search:
        query = query.where(Employee.full_name.ilike(f"%{search}%"))

    result = await db.execute(query)
    employees = result.scalars().all()
    if not employees:
        return []

    emp_ids = [e.id for e in employees]

    # Single query to check which employees have user accounts
    user_result = await db.execute(
        select(User.employee_id).where(User.employee_id.in_(emp_ids))
    )
    user_employee_ids = {row[0] for row in user_result.fetchall()}

    return [
        {
            "id": emp.id,
            "full_name": emp.full_name,
            "employee_type": emp.employee_type.value,
            "phone_number": emp.phone_number,
            "salary": emp.salary,
            "compensation_type": emp.compensation_type.value,
            "default_percentage": float(emp.default_percentage) if emp.default_percentage is not None else None,
            "hire_date": str(emp.hire_date) if emp.hire_date else None,
            "contract_end_date": str(emp.contract_end_date) if emp.contract_end_date else None,
            "address": emp.address,
            "is_active": emp.is_active,
            "has_user_account": emp.id in user_employee_ids,
        }
        for emp in employees
    ]
```

#### c) `lms/financial_service.py` — `get_eligible_recipients()` (line 214)

**Before:** Loop over teachers, query wallet per teacher.

**After:**

```python
async def get_eligible_recipients(db: AsyncSession, recipient_type: str) -> list[dict]:
    now = datetime.now(timezone.utc).date()
    month_start = now.replace(day=1)

    if recipient_type == "teacher_withdrawal":
        employees_result = await db.execute(
            select(Employee)
            .where(Employee.employee_type == EmployeeType.TEACHER, Employee.is_active == True)
        )
        teachers = employees_result.scalars().all()
        if not teachers:
            return []

        teacher_ids = [t.id for t in teachers]

        # Single batch wallet query instead of N queries
        wallet_result = await db.execute(
            select(TeacherWallet).where(TeacherWallet.teacher_id.in_(teacher_ids))
        )
        wallets_map = {w.teacher_id: w for w in wallet_result.scalars().all()}

        return [
            {
                "id": str(emp.id),
                "full_name": emp.full_name,
                "role": "teacher",
                "available_limit": float(wallets_map[emp.id].balance) if emp.id in wallets_map else 0,
                "is_eligible": (emp.id in wallets_map and wallets_map[emp.id].balance > 0),
            }
            for emp in teachers
        ]
    # ... rest unchanged
```

### 3.2 — Rate Limiting on Financial Endpoints

**File: `backend/app/modules/lms/router.py`**

Add a per-user rate limiter for financial write endpoints. Create a key function that uses the authenticated user ID:

```python
# In rate_limit.py — add a key function for authenticated routes
def get_user_key(request) -> str:
    user = getattr(request, "user", None)
    if user:
        return f"user:{user.id}"
    return get_remote_address(request)
```

Then decorate sensitive financial endpoints:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.rate_limit import limiter

@router.post("/payments")
@limiter.limit("10/minute")
async def create_payment_endpoint(...):
    ...
```

### 3.3 — Token Cleanup & Audit Log Retention

**File: `backend/app/modules/identity/service.py`** (or a new scheduled task)

Add a cleanup function that runs once daily (via cron hitting an endpoint or a scheduled task):

```python
async def cleanup_expired_tokens(db: AsyncSession) -> int:
    """Delete expired refresh tokens older than 30 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        delete(RefreshToken).where(
            RefreshToken.expires_at < cutoff
        )
    )
    await db.commit()
    return result.rowcount


async def cleanup_old_audit_logs(db: AsyncSession) -> int:
    """Archive/delete audit logs older than 90 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    result = await db.execute(
        delete(AuditLog).where(
            AuditLog.created_at < cutoff
        )
    )
    await db.commit()
    return result.rowcount
```

---

## Timeline

| Day | Phase | Items |
|-----|-------|-------|
| **Day 1 morning** | Phase 0 | Uncomment services in compose, non-root Docker user, rebuild |
| **Day 1 afternoon** | Phase 1 | CSP headers, backup script + cron, verify password/lockout config |
| **Day 2 morning** | Phase 2 | Sentry DSN + init code, rebuild, verify error capture |
| **Day 2 afternoon** | Phase 2 | Install self-hosted runner, create `.github/workflows/ci-cd.yml`, push first deploy |
| **Day 3** | Phase 2 | Set GitHub secrets, push a trigger commit, verify full pipeline |
| **Week 1** | Phase 3 | Fix N+1 queries, add rate limiting on financial routes, token/audit log cleanup |

---

## Launch Gate Checklist

Before declaring MVP launched, verify all of these:

- [ ] `docker ps` shows 4 containers: database, backend, frontend, caddy
- [ ] Backend health check returns 200: `curl http://localhost:8000/api/v1/health`
- [ ] Frontend loads in browser: `https://aldrasat.edu`
- [ ] Login works end-to-end (credentials → cookie → dashboard)
- [ ] Backend container runs as non-root: `docker exec lims_backend whoami` → `lims`
- [ ] CSP headers present: `curl -I https://aldrasat.edu | grep -i content-security`
- [ ] Backup script runs: `bash /opt/lims/scripts/backup.sh` produces `.sql.gz`
- [ ] Sentry test error appears in sentry.io dashboard
- [ ] GitHub Actions runner shows "Idle" with green light
- [ ] Push a trivial change to `main` → pipeline runs → server auto-deploys
- [ ] `.env` file exists on server with real secrets (not defaults)
- [ ] JWT secret is not the placeholder: `docker exec lims_backend python -c "from app.core.config import settings; print('ok' if settings.JWT_SECRET_KEY != 'super_secret_key_lims_institute_2026_change_in_production' else 'FAIL')"` → `ok`

---

## What Is NOT in Scope (Deferred)

| Item | Why Deferred |
|------|--------------|
| Unit tests | MVP needs functionality over test coverage |
| Redis caching | Performance nice-to-have, not correctness-critical |
| S3 storage | File storage works locally; migrate when scale requires |
| Prometheus/Grafana | Overkill for single-server MVP |
| Structured logging | JSON logging added when log volume justifies it |
| CSRF tokens | API uses cookie-based auth + CORS origin check; SameSite=Lax mitigates CSRF for MVP |
