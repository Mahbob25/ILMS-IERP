# LIMS Production Launch Guide — Step by Step

**Version:** 2.0
**Date:** 2026-07-14
**Target:** Local on-premise server deployment (aldrasat.edu)
**Current Readiness Score:** 4.3/10

---

## How to Use This Guide

Every task is tagged with where it runs:

| Icon | Location | Description |
|------|----------|-------------|
| 💻 | **Laptop** | Code/config changes done in development environment, committed to git |
| 🧪 | **Laptop Test** | Tests run in development environment before deployment |
| 📦 | **Transfer** | Moving code to the production server |
| 🖥️ | **Server** | Steps executed directly on the production server |

---

## Table of Contents

### LAPTOP WORK (Chapters 1-12)
1. [Phase 1: DB CHECK Constraints + Partial Unique Index](#phase-1-db-check-constraints--partial-unique-index)
2. [Phase 2: DB Sequences for Receipt/Voucher/Certificate Numbers](#phase-2-db-sequences-for-receiptvouchercertificate-numbers)
3. [Phase 3: Conditional UPDATE Patterns + Orphaned State Transactions](#phase-3-conditional-update-patterns--orphaned-state-transactions)
4. [Phase 4: SELECT FOR UPDATE + Concurrency Locks](#phase-4-select-for-update--concurrency-locks)
5. [Phase 5: Idempotency Key Middleware](#phase-5-idempotency-key-middleware)
6. [Phase 6: Backend Silent Failures — Logging & Error Propagation](#phase-6-backend-silent-failures--logging--error-propagation)
7. [Phase 7a: Infrastructure Code Changes (Laptop)](#phase-7a-infrastructure-code-changes-laptop)
8. [Phase 8: Rate Limiting + CSRF + Security Headers](#phase-8-rate-limiting--csrf--security-headers)
9. [Phase 9: Frontend Resilience](#phase-9-frontend-resilience)
10. [Phase 11a: Production docker-compose.yml (Prepare File)](#phase-11a-production-docker-composeyml-prepare-file)

### LAPTOP TESTING (Chapter 11)
11. [Phase 10: Testing — Run Everything Locally](#phase-10-testing--run-everything-locally)

### TRANSFER TO SERVER (Chapter 12)
12. [Migration: Move Codebase to Production Server](#migration-move-codebase-to-production-server)

### SERVER SETUP (Chapters 13-17)
13. [Phase 7b: Infrastructure Server Setup](#phase-7b-infrastructure-server-setup)
14. [Phase 11b: Deploy Docker Containers](#phase-11b-deploy-docker-containers)
15. [Phase 12: Pre-Launch Checklist](#phase-12-pre-launch-checklist)
16. [Phase 13: Launch Day](#phase-13-launch-day)
17. [Phase 14-15: Post-Launch Monitoring & Hardening](#phase-14-15-post-launch-monitoring--hardening)

---

# PART 1: LAPTOP WORK (CODE + CONFIG)

> All work in this section happens on your development machine. Every change is committed to git.

---

## Phase 1: DB CHECK Constraints + Partial Unique Index

**Source:** `docs/plans/qa-chaos-remediation/phase-01-db-constraints.md`
**Status:** ⬜ NOT STARTED

### 💻 Steps

1. Create a new Alembic migration:

```bash
cd backend
alembic revision --autogenerate -m "add_check_constraints_and_partial_unique_index"
```

2. Edit the generated migration file with 13 CHECK constraints:

```sql
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);
ALTER TABLE pending_refunds ADD CONSTRAINT pending_refunds_amount_check CHECK (amount > 0);
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_check CHECK (amount > 0);
ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_balance_check CHECK (balance >= 0);
ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_frozen_balance_check CHECK (frozen_balance >= 0);
ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_frozen_lte_balance CHECK (frozen_balance <= balance);
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_delta_check CHECK (available_delta + frozen_delta = total_amount);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_discount_check CHECK (0 <= admin_discount AND admin_discount <= 100);
ALTER TABLE final_grades ADD CONSTRAINT final_grades_score_check CHECK (0 <= final_score AND final_score <= 100);
ALTER TABLE grades ADD CONSTRAINT grades_score_check CHECK (score >= 0);
ALTER TABLE course_sections ADD CONSTRAINT course_sections_price_check CHECK (price >= 0);
ALTER TABLE section_contracts ADD CONSTRAINT section_contracts_holdback_check CHECK (0 <= holdback_rate AND holdback_rate <= 1);
```

3. Add partial unique index for soft-delete enrollments:

```sql
CREATE UNIQUE INDEX uq_enrollments_active
  ON enrollments (student_id, section_id)
  WHERE deleted_at IS NULL;
```

4. Add pre-constraint data validation in the migration:

```python
# In the migration's upgrade():
# Check for data that would violate constraints before applying them
op.execute("""
    DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM payments WHERE amount <= 0) THEN
            RAISE EXCEPTION 'payments table has rows with amount <= 0';
        END IF;
        -- Add similar checks for other constraints
    END $$;
""")
```

5. Apply migration:

```bash
alembic upgrade head
```

6. Record the migration revision ID — Phases 2 and 5 need it as `down_revision`.

### 🧪 Verify

```bash
docker exec lims_database psql -U lims -d lims -c "\d+ payments"
# Should show: payments_amount_check CHECK (amount > 0)
```

### 📝 Commit

```bash
git add backend/alembic/versions/
git commit -m "feat: add 13 DB CHECK constraints and partial unique index for enrollments"
```

---

## Phase 2: DB Sequences for Receipt/Voucher/Certificate Numbers

**Source:** `docs/plans/qa-chaos-remediation/phase-02-db-sequences.md`
**Dependency:** Phase 1 must be merged first (use its migration revision as `down_revision`)
**Status:** ⬜ NOT STARTED

### 💻 Steps

1. Create Alembic migration:

```bash
cd backend
alembic revision --autogenerate -m "add_db_sequences_for_numbering"
```

2. In the migration, add 4 sequences:

```sql
CREATE SEQUENCE IF NOT EXISTS seq_receipt_number START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS seq_voucher_number START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS seq_refund_receipt_number START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS seq_certificate_number START 1 INCREMENT 1;
```

3. Add certificate sequence tracker table:

```sql
CREATE TABLE IF NOT EXISTS certificate_sequence_tracker (
  year VARCHAR(4) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

4. Add `next_certificate_number()` function:

```sql
CREATE OR REPLACE FUNCTION next_certificate_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  current_year TEXT := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  next_val BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM certificate_sequence_tracker WHERE year = current_year) THEN
    ALTER SEQUENCE seq_certificate_number RESTART WITH 1;
    INSERT INTO certificate_sequence_tracker (year) VALUES (current_year)
    ON CONFLICT (year) DO NOTHING;
  END IF;
  SELECT nextval('seq_certificate_number') INTO next_val;
  RETURN 'CERT-' || current_year || '-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
```

5. Apply migration:

```bash
alembic upgrade head
```

6. After migration is applied, update service code to use these sequences.

**Edit `financial_service.py`** — replace `get_next_receipt_number()`:

```python
# OLD: SELECT COALESCE(MAX(receipt_number), '') + manual prefix + increment
async def get_next_receipt_number(db: AsyncSession, payment_date: date) -> str:
    result = await db.execute(
        select(func.nextval('seq_receipt_number'))
    )
    seq_val = result.scalar()
    prefix = f"PAY-{payment_date.strftime('%Y%m%d')}-"
    return f"{prefix}{seq_val:06d}"
```

**Edit `cashier_service.py`** — replace with sequence:

```python
async def get_next_refund_receipt_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.nextval('seq_refund_receipt_number')))
    seq_val = result.scalar()
    return f"RFD-{datetime.now().strftime('%Y%m%d')}-{seq_val:06d}"
```

**Edit `certificate_service.py`** — use the DB function:

```python
async def get_next_certificate_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.next_certificate_number()))
    return result.scalar()
```

**Edit expense voucher generation** — use `seq_voucher_number`:

```python
result = await db.execute(select(func.nextval('seq_voucher_number')))
seq_val = result.scalar()
voucher_number = f"EXP-{date.today().strftime('%Y%m%d')}-{seq_val:06d}"
```

### 🧪 Verify

```python
# Run in test/console
from sqlalchemy import func, select
result = await db.execute(select(func.nextval('seq_receipt_number')))
print(result.scalar())  # Should print 1, 2, 3...
```

### 📝 Commit

```bash
git add backend/alembic/versions/ backend/app/modules/lms/financial_service.py backend/app/modules/lms/cashier_service.py backend/app/modules/academic/certificate_service.py
git commit -m "feat: add DB sequences for receipt/voucher/certificate numbering"
```

---

## Phase 3: Conditional UPDATE Patterns + Orphaned State Transactions

**Source:** `docs/plans/qa-chaos-remediation/phase-03-conditional-updates.md`
**Status:** ⬜ NOT STARTED

### 💻 Steps

Edit the following files, replacing read-then-write patterns with atomic conditional UPDATEs:

**1. `backend/app/modules/lms/ledger_service.py`**

`activate_contract()`:
```python
# BEFORE (race condition):
contract = await db.execute(
    select(SectionContract).where(SectionContract.id == contract_id)
).scalar_one_or_none()
if not contract or contract.status != ContractStatus.ASSIGNED:
    raise ValueError("Contract not in ASSIGNED status")
contract.status = ContractStatus.ACTIVE

# AFTER (atomic conditional UPDATE):
result = await db.execute(
    update(SectionContract)
    .where(SectionContract.id == contract_id)
    .where(SectionContract.status == ContractStatus.ASSIGNED)
    .values(status=ContractStatus.ACTIVE)
    .returning(SectionContract.id)
)
if result.rowcount == 0:
    raise ValueError("Contract not in ASSIGNED status or already active")
```

`settle_contract()` — same pattern with `WHERE status = 'ACTIVE'`.

`cancel_contract()` — same pattern with `WHERE status = 'ACTIVE'`.

**2. `backend/app/modules/lms/cashier_service.py`**

`disburse_refund()`:
```python
result = await db.execute(
    update(PendingRefund)
    .where(PendingRefund.id == refund_id)
    .where(PendingRefund.status == 'UNCLAIMED')
    .values(status='CLAIMED')
    .returning(PendingRefund.id)
)
if result.rowcount == 0:
    raise ValueError("Refund not found or already claimed")
```

**3. `backend/app/modules/academic/cancellation_service.py`**

`cancel_section()` — wrap ALL writes in a single transaction. Replace `await db.commit()` (F10) with `await db.flush()`.

**4. `backend/app/modules/academic/service.py`**

- `complete_section()` — make atomic (section status + contract + certificates)
- `set_final_grades_bulk()` — make atomic (grades + contract + ledger)
- `deactivate_section()` — replace `await db.commit()` (F11) with `await db.flush()`

### 🧪 Verify

```bash
cd backend
python test_v1_7_full_e2e.py
# All existing tests should still pass
```

### 📝 Commit

```bash
git add backend/app/modules/lms/ledger_service.py backend/app/modules/lms/cashier_service.py backend/app/modules/academic/cancellation_service.py backend/app/modules/academic/service.py backend/app/modules/lms/compensation_service.py
git commit -m "fix: add conditional UPDATE patterns and transactional wraps for race conditions"
```

---

## Phase 4: SELECT FOR UPDATE + Concurrency Locks

**Source:** `docs/plans/qa-chaos-remediation/phase-04-select-for-update.md`
**Status:** ⬜ NOT STARTED

### 💻 Steps

**1. Enrollment capacity lock** — in `academic/service.py`:

```python
# Change this:
section = await db.execute(
    select(CourseSection).where(CourseSection.id == section_id)
).scalar_one_or_none()

# To this (lock the row):
section = await db.execute(
    select(CourseSection)
    .where(CourseSection.id == section_id)
    .with_for_update()
).scalar_one_or_none()
```

**2. Payment balance lock** — in `financial_service.py`:

```python
# Add with_for_update() on enrollment before computing remaining balance
enrollment = await db.execute(
    select(Enrollment)
    .where(Enrollment.id == enrollment_id)
    .with_for_update()
).scalar_one_or_none()
```

**3. Wallet upsert** — in `ledger_service.py`:

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = pg_insert(TeacherWallet).values(
    teacher_id=teacher_id, balance=0, frozen_balance=0
).on_conflict_do_nothing(index_elements=['teacher_id'])
await db.execute(stmt)
wallet = await db.execute(
    select(TeacherWallet)
    .where(TeacherWallet.teacher_id == teacher_id)
    .with_for_update()
).scalar_one()
```

**4. Advisory lock for day closure** — in `closure_service.py` and payment creation:

```python
from sqlalchemy import text
await db.execute(
    text("SELECT pg_advisory_xact_lock(hashtext('daily_closure:' || :date))"),
    {"date": str(today)}
)
```

**5. Email uniqueness** — in user creation endpoint:

```python
try:
    db.add(user)
    await db.flush()
except IntegrityError as e:
    if "users_email_key" in str(e):
        raise HTTPException(status_code=409, detail="Email already registered")
    raise
```

### 🧪 Verify

```bash
cd backend
python test_v1_7_full_e2e.py
```

### 📝 Commit

```bash
git add backend/app/modules/academic/service.py backend/app/modules/lms/financial_service.py backend/app/modules/lms/ledger_service.py backend/app/modules/lms/closure_service.py
git commit -m "fix: add SELECT FOR UPDATE locks for enrollment, payment, wallet concurrency"
```

---

## Phase 5: Idempotency Key Middleware

**Source:** `docs/plans/qa-chaos-remediation/phase-05-idempotency-keys.md`
**Dependency:** Phase 1 must be merged first
**Status:** ⬜ NOT STARTED

### 💻 Steps

**1. Create `backend/app/middleware/idempotency.py`:**

```python
import hashlib
import json
from datetime import datetime, timedelta, timezone
from fastapi import Request, Response
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from app.db.session import async_session_maker

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
        async with async_session_maker() as db:
            existing = await db.execute(
                select(IdempotencyKey).where(
                    IdempotencyKey.idempotency_key == idempotency_key,
                    IdempotencyKey.endpoint == endpoint
                )
            )
            record = existing.scalar_one_or_none()
            if record:
                return Response(
                    content=record.response_body,
                    status_code=record.response_status,
                    media_type="application/json",
                    headers={"X-Idempotency-Replayed": "true"}
                )

        # Process request
        response = await call_next(request)

        # Store result if successful
        if response.status_code < 500:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            async with async_session_maker() as db:
                db.add(IdempotencyKey(
                    idempotency_key=idempotency_key,
                    endpoint=endpoint,
                    response_status=response.status_code,
                    response_body=body.decode()
                ))
                await db.commit()

        return response
```

**2. Add `IdempotencyKey` model** to `backend/app/modules/models.py`:

```python
class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    idempotency_key = Column(String(255), nullable=False)
    endpoint = Column(String(100), nullable=False)
    response_status = Column(Integer, nullable=False)
    response_body = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))
    __table_args__ = (
        UniqueConstraint('idempotency_key', 'endpoint'),
    )
```

**3. Wire in `main.py`:**

```python
from app.middleware.idempotency import IdempotencyMiddleware
app.add_middleware(IdempotencyMiddleware)
```

**4. Create Alembic migration** for `idempotency_keys` table.

**5. Frontend interceptor** — in `frontend/lib/api.ts`, add (keep existing interceptors):

```typescript
apiClient.interceptors.request.use((config) => {
  if (['post', 'patch', 'put'].includes(config.method?.toLowerCase() || '')) {
    const key = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36)}`
    config.headers['Idempotency-Key'] = key
  }
  return config
})
```

### 🧪 Verify

```bash
# Restart backend
# Test idempotency with curl:
curl -X POST http://localhost:8000/api/v1/your-endpoint \
  -H "Idempotency-Key: test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# First call: processes normally
# Same call again: returns cached with X-Idempotency-Replayed: true
```

### 📝 Commit

```bash
git add backend/app/middleware/idempotency.py backend/app/modules/models.py backend/app/main.py backend/alembic/versions/ frontend/lib/api.ts
git commit -m "feat: add idempotency key middleware with frontend interceptor"
```

---

## Phase 6: Backend Silent Failures — Logging & Error Propagation

**Source:** `docs/plans/qa-chaos-remediation/phase-06-backend-silent-failures.md`
**Status:** ⬜ NOT STARTED

### 💻 Fixes

| # | File | Line | Change |
|---|------|------|--------|
| F01 | `academic/service.py` | ~352 | `except Exception: continue` → `logger.error()` + `raise` |
| F02 | `academic/service.py` | ~754 | `except ValueError: pass` → `logger.error()` + `raise` |
| F03 | `financial_service.py` | ~84 | `return None` → `logger.warning()` + `raise ValueError("Enrollment not found")` |
| F10 | `cancellation_service.py` | ~292 | `await db.commit()` → `await db.flush()` |
| F11 | `academic/service.py` | ~404 | `await db.commit()` → `await db.flush()` |
| S14 | Attendance handler | — | Wrap batch attendance save in transaction |

### 📝 Commit

```bash
git add backend/app/modules/academic/service.py backend/app/modules/lms/financial_service.py backend/app/modules/academic/cancellation_service.py
git commit -m "fix: propagate silent failures with proper logging instead of swallowing"
```

---

## Phase 7a: Infrastructure Code Changes (Laptop)

**Source:** `docs/plans/qa-chaos-remediation/phase-07-infrastructure.md`
**Status:** ⬜ NOT STARTED

> **Note:** This phase is split into **7a (laptop — code/config)** and **7b (server — setup/install)**. Do all of 7a now, then 7b when you're on the server.

### 💻 7a.1 Sentry SDK Integration (C-1)

**Backend:**

```bash
cd backend
pip install sentry-sdk[fastapi]
echo "sentry-sdk[fastapi]" >> requirements.txt
```

In `backend/app/main.py`, add **before** `app = FastAPI(...)`:

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        integrations=[FastApiIntegration()],
    )
```

Add `SENTRY_DSN` to `backend/app/core/config.py`:

```python
SENTRY_DSN: str = ""
```

**Frontend:**

```bash
cd frontend
npm install @sentry/nextjs
```

Create `frontend/sentry.client.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  tracesSampleRate: 0.1,
})
```

Create `frontend/sentry.server.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  tracesSampleRate: 0.1,
})
```

Create `frontend/sentry.edge.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  tracesSampleRate: 0.1,
})
```

### 💻 7a.2 Backend Docker Security (C-4)

Edit `backend/Dockerfile`, add **before** `EXPOSE 8000`:

```dockerfile
# Create non-root user
RUN useradd -m -u 1000 appuser
USER appuser
```

Add HEALTHCHECK in `backend/Dockerfile` **after** `EXPOSE 8000`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1
```

### 💻 7a.3 CI/CD Pipeline (C-3)

Create `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
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

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Lint Backend
        run: |
          cd backend
          pip install ruff
          ruff check app/

      - name: Run Backend Tests
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-asyncio
          alembic upgrade head
          pytest -v --cov=app --cov-report=term-missing

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Frontend Checks
        run: |
          cd frontend
          npm ci
          npm run lint
          npx tsc --noEmit
          npm run build

  deploy:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Deploy with Docker Compose
        working-directory: .
        run: |
          docker compose build backend frontend
          docker compose up -d --force-recreate backend frontend caddy
          docker image prune -f
      - name: Verify Deployment
        run: |
          for i in {1..12}; do
            curl -sf http://localhost:8000/api/v1/health && break
            sleep 5
          done
```

### 💻 7a.4 Database Backup Script (C-2)

Create `backend/scripts/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_HOST=${DB_HOST:-localhost}
DB_USER=${DB_USER:-lims}
DB_NAME=${DB_NAME:-lims}
BACKUP_DIR=${BACKUP_DIR:-/backups}

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: $DB_NAME to $BACKUP_DIR/lms_$TIMESTAMP.dump"

pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -F c -f "$BACKUP_DIR/lms_$TIMESTAMP.dump" \
  -Z 9  # max compression

# Encrypt with GPG if public key is configured
if [ -n "${GPG_RECIPIENT:-}" ]; then
  gpg --encrypt --recipient "$GPG_RECIPIENT" \
    "$BACKUP_DIR/lms_$TIMESTAMP.dump"
  rm "$BACKUP_DIR/lms_$TIMESTAMP.dump"
fi

# Upload to offsite storage if rclone is configured
if command -v rclone &> /dev/null && [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR/lms_$TIMESTAMP.dump.gpg" \
    "$RCLONE_REMOTE:/lims-backups/" || \
    echo "[$(date)] WARNING: rclone upload failed" >> "$BACKUP_DIR/backup.log"
fi

# Retention: keep 30 days local
find "$BACKUP_DIR" -name "lms_*.dump*" -mtime +30 -delete

echo "[$(date)] Backup complete: lms_$TIMESTAMP.dump ($(ls -lh "$BACKUP_DIR/lms_$TIMESTAMP.dump" | awk '{print $5}'))" >> "$BACKUP_DIR/backup.log"
```

### 💻 7a.5 Structured Logging (I-11)

Create `backend/app/core/logging.py`:

```python
import json
import logging
import sys
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "function": record.funcName,
            "line": record.lineno,
            "message": record.getMessage(),
        }
        if hasattr(record, "extra"):
            log_entry.update(record.extra)
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)

def setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
```

Initialize in `main.py` — add at top, after imports:

```python
from app.core.logging import setup_logging
setup_logging()
```

### 💻 7a.6 DB Pool Timeout (S28)

Verify `backend/app/db/session.py` already has pool_timeout (add if missing):

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args={"server_settings": {"timezone": settings.TIMEZONE}},
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_timeout=30,
)
```

### 💻 7a.7 Caddyfile TLS Configuration (I-10)

Edit `infrastructure/caddy/Caddyfile`:

- For **public domain** (aldrasat.edu resolves publicly): replace `tls internal` with Let's Encrypt
- For **private LAN** (no public DNS): keep `tls internal`, add a comment

```caddyfile
{
    # Internal CA configuration for LAN deployment
    pki {
        ca local {
            name "LIMS Internal CA"
            root_cn "LIMS Root CA"
        }
    }
}

aldrasat.edu {
    # For public domain: tls { issuer acme }
    # For private LAN: tls internal (distribute root CA to clients)
    tls internal
    encode gzip

    reverse_proxy /api/v1/* {env.BACKEND_URL}
    reverse_proxy /uploads/* {env.BACKEND_URL}
    reverse_proxy * {env.FRONTEND_URL}
}
```

### 💻 7a.8 Remove Hardcoded Credentials (I-13)

Edit `test_v1_7_full_e2e.py` — replace hardcoded DB password with env variable:

```python
DB_PASSWORD = os.environ.get("TEST_DB_PASSWORD", "lims_secure_pass")
```

### 💻 7a.9 Add SENTRY_DSN to Backend Config

Edit `backend/app/core/config.py` — add field:

```python
SENTRY_DSN: str = ""
```

### 📝 Commit

```bash
git add backend/Dockerfile backend/requirements.txt backend/app/main.py backend/app/core/logging.py backend/app/core/config.py backend/app/db/session.py .github/workflows/ci-cd.yml backend/scripts/backup.sh infrastructure/caddy/Caddyfile frontend/sentry.client.config.ts frontend/sentry.server.config.ts frontend/sentry.edge.config.ts frontend/package.json
git commit -m "feat: add Sentry, CI/CD, Docker security, backup script, structured logging"
```

---

## Phase 8: Rate Limiting + CSRF + Security Headers

**Source:** `docs/plans/qa-chaos-remediation/phase-08-security-rate-limiting.md`
**Status:** ⬜ NOT STARTED

### 💻 8.1 Security Headers in Caddyfile (I-05)

Edit `infrastructure/caddy/Caddyfile` — append inside the `aldrasat.edu` block:

```caddyfile
header {
    Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; form-action 'self'"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    X-XSS-Protection "0"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

### 💻 8.2 Real IP Middleware (I-08)

Create `backend/app/middleware/real_ip.py`:

```python
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

class RealIPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
            request.scope["client"] = (
                client_ip,
                request.scope.get("client", (None, 0))[1] or 0
            )
        return await call_next(request)
```

Wire in `main.py`:

```python
from app.middleware.real_ip import RealIPMiddleware
app.add_middleware(RealIPMiddleware)
```

### 💻 8.3 CSRF Protection (I-04)

Create `backend/app/middleware/csrf.py`:

```python
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class CSRFMiddleware(BaseHTTPMiddleware):
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

    async def dispatch(self, request: Request, call_next):
        if request.method in self.SAFE_METHODS:
            return await call_next(request)
        csrf_token = request.headers.get("X-CSRF-Token")
        csrf_cookie = request.cookies.get("csrf_token")
        if not csrf_token or not csrf_cookie or csrf_token != csrf_cookie:
            raise HTTPException(status_code=403, detail="CSRF token mismatch")
        return await call_next(request)
```

Wire in `main.py`:

```python
from app.middleware.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)  # Add after CORS but before other middleware
```

**Frontend side** — in `frontend/lib/api.ts`, add CSRF token interceptor:

```typescript
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token')
  if (csrfToken && ['post', 'patch', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})
```

### 💻 8.4 Global Rate Limiting (I-06)

Update `backend/app/core/rate_limit.py`:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_client_ip(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["100/minute"],
)
```

Add rate limit decorators to specific router endpoints:

| Endpoint | Router File | Limit |
|----------|-------------|-------|
| `/auth/login`, `/auth/register` | `identity/router.py` | `5/minute` |
| `/payments`, `/expenses`, `/refunds` | `lms/router.py` | `10/minute` |
| `/enrollments` | `academic/router.py` | `20/minute` |

### 📝 Commit

```bash
git add infrastructure/caddy/Caddyfile backend/app/middleware/real_ip.py backend/app/middleware/csrf.py backend/app/core/rate_limit.py backend/app/main.py frontend/lib/api.ts backend/app/modules/lms/router.py backend/app/modules/academic/router.py backend/app/modules/identity/router.py
git commit -m "feat: add CSRF protection, security headers, rate limiting, real IP middleware"
```

---

## Phase 9: Frontend Resilience

**Source:** `docs/plans/qa-chaos-remediation/phase-09-frontend-resilience.md`
**Status:** ⬜ NOT STARTED

### 💻 9.1 Fix Hung Promise (F04, S05)

In `frontend/lib/api.ts`, change line ~45:

```typescript
// FROM:
return new Promise<never>(() => {})  // HANGS FOREVER

// TO:
return Promise.reject(new Error("Session expired — please log in again"))
```

### 💻 9.2 Fix isRedirectingToLogin Never-Reset (S18)

```typescript
if (!isRedirectingToLogin) {
  isRedirectingToLogin = true
  window.location.href = `/${locale}/login`
  setTimeout(() => { isRedirectingToLogin = false }, 5000)
}
```

### 💻 9.3 Fix Error Discrimination (F09)

Add typed error handling in the Axios response interceptor:

```typescript
import axios from "axios"

class PermissionError extends Error {
  constructor(msg: string) { super(msg); this.name = "PermissionError" }
}
class ServerError extends Error {
  constructor(msg: string) { super(msg); this.name = "ServerError" }
}
class NetworkError extends Error {
  constructor(msg: string) { super(msg); this.name = "NetworkError" }
}

// In the response interceptor:
if (error.response) {
  const status = error.response.status
  if (status === 401) return handleTokenRefresh(error)
  if (status === 403) return Promise.reject(
    new PermissionError(error.response.data?.detail || "Access denied")
  )
  if (status >= 500) return Promise.reject(
    new ServerError("Server error. Please try again.")
  )
} else if (error.request) {
  return Promise.reject(new NetworkError("Network error. Check your connection."))
}
```

### 💻 9.4 Fix Logout Error Handling (F05)

In `AuthContext.tsx`:

```typescript
catch (error) {
  logger.warn("Logout API call failed, clearing session anyway", { error })
  Sentry.captureException(error)
} finally {
  document.cookie.split(";").forEach(c => {
    document.cookie = c.replace(/^ +/, "")
      .replace(/=.*/, "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/")
  })
  window.location.href = "/login"
}
```

### 💻 9.5 Add Form Submitting States (S01)

Create reusable hook `frontend/hooks/useSubmit.ts`:

```typescript
import { useState, useCallback } from "react"

export function useSubmit() {
  const [submitting, setSubmitting] = useState(false)
  const wrap = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (submitting) return
    setSubmitting(true)
    try {
      return await fn()
    } finally {
      setSubmitting(false)
    }
  }, [submitting])
  return { submitting, wrap }
}
```

Apply to every form page. Add `disabled={submitting}` to all submit buttons.

### 💻 9.6 Add Input Sanitization (S02, S03)

Create `frontend/lib/utils/input.ts`:

```typescript
export function sanitizeInput(value: string): string {
  return value.trim()
}

export function escapeLikeWildcards(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}
```

Apply to form inputs and search fields.

### 💻 9.7 Add PRG Pattern (S17)

After successful form submissions, use `router.replace()`:

```typescript
import { useRouter } from "next/navigation"
const router = useRouter()

// After successful save:
router.replace("/dashboard/sections")
```

### 💻 9.8 Create Error UI Components

`frontend/components/AccessDenied.tsx`:

```typescript
export function AccessDenied({ resourceName }: { resourceName: string }) {
  return (
    <div className="text-center py-12">
      <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
      <p className="text-gray-600">You do not have permission to access {resourceName}.</p>
    </div>
  )
}
```

`frontend/components/EmptyState.tsx`:

```typescript
export function EmptyState({ message = "No data available" }: { message?: string }) {
  return (
    <div className="text-center py-8 text-gray-400">
      <p>{message}</p>
    </div>
  )
}
```

### 💻 9.9 Create error.tsx / loading.tsx

`frontend/app/dashboard/error.tsx`:

```typescript
'use client'
export default function DashboardError({
  error, reset
}: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button onClick={reset} className="btn-primary px-4 py-2 rounded">Try again</button>
    </div>
  )
}
```

`frontend/app/dashboard/loading.tsx`:

```typescript
export default function DashboardLoading() {
  return (
    <div className="p-8 text-center">
      <div className="animate-pulse text-gray-400">Loading dashboard...</div>
    </div>
  )
}
```

Also create `error.tsx` and `loading.tsx` for each route group: sections, students, payments, etc.

### 💻 9.10 Force Dashboard Refetch (S11)

Add a `refetchKey` state to force dashboard data refresh after mutations:

```typescript
const [refetchKey, setRefetchKey] = useState(0)

// After grade submission, payment, etc:
setRefetchKey(prev => prev + 1)

// In useEffect for data fetching:
useEffect(() => {
  fetchDashboardData()
}, [refetchKey])
```

### 📝 Commit

```bash
git add frontend/lib/api.ts frontend/components/AuthContext.tsx frontend/lib/utils/input.ts frontend/components/AccessDenied.tsx frontend/components/EmptyState.tsx frontend/hooks/useSubmit.ts frontend/app/dashboard/error.tsx frontend/app/dashboard/loading.tsx
git commit -m "fix: frontend resilience - error handling, form states, sanitization, error boundaries"
```

---

## Phase 11a: Production docker-compose.yml (Prepare File)

**Status:** ⬜ NOT STARTED

### 💻 Steps

Create `docker-compose.prod.yml` (keep the original `docker-compose.yml` for development):

```yaml
version: '3.8'

networks:
  lims-internal:
    driver: bridge

services:
  database:
    image: pgvector/pgvector:pg16
    container_name: lims_database
    restart: always
    environment:
      TZ: Asia/Riyadh
      POSTGRES_USER: ${POSTGRES_USER?err}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD?err}
      POSTGRES_DB: ${POSTGRES_DB:-lims}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - lims-internal
    deploy:
      resources:
        limits: { cpus: '2.0', memory: 2G }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-lims}"]
      interval: 30s
      timeout: 10s
      retries: 3

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: lims_backend
    restart: always
    environment:
      TZ: Asia/Riyadh
      TIMEZONE: Asia/Riyadh
      ENVIRONMENT: production
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER?err}:${POSTGRES_PASSWORD?err}@database:5432/${POSTGRES_DB:-lims}
      JWT_SECRET_KEY: ${JWT_SECRET_KEY?err}
      CORS_ORIGINS: ${CORS_ORIGINS:-https://aldrasat.edu}
      SENTRY_DSN: ${SENTRY_DSN:-}
    depends_on:
      database: { condition: service_healthy }
    networks:
      - lims-internal
    deploy:
      resources:
        limits: { cpus: '2.0', memory: 2G }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      start_period: 15s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: lims_frontend
    restart: always
    environment:
      TZ: Asia/Riyadh
      NEXT_PUBLIC_API_URL: https://aldrasat.edu/api/v1
    depends_on:
      backend: { condition: service_healthy }
    networks:
      - lims-internal
    deploy:
      resources:
        limits: { cpus: '1.0', memory: 512M }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/ar/login"]
      interval: 30s
      timeout: 10s
      start_period: 10s
      retries: 3

  caddy:
    image: caddy:latest
    container_name: lims_caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infrastructure/caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      TZ: Asia/Riyadh
      BACKEND_URL: backend:8000
      FRONTEND_URL: frontend:3000
    networks:
      - lims-internal
    depends_on:
      frontend: { condition: service_healthy }
      backend: { condition: service_healthy }
    deploy:
      resources:
        limits: { cpus: '0.5', memory: 256M }

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

### 📝 Commit

```bash
git add docker-compose.prod.yml
git commit -m "feat: production docker-compose with healthchecks, resource limits, service dependencies"
```

---

# PART 2: LAPTOP TESTING

---

## Phase 10: Testing — Run Everything Locally

**Source:** `docs/plans/qa-chaos-remediation/phase-10-testing.md`
**Dependency:** ALL phases 1-9a must be committed
**Status:** ⬜ NOT STARTED

### 🧪 10.1 Backend Unit & Integration Tests

Create test files under `backend/tests/`:

| New File | What It Tests |
|-----------|--------------|
| `tests/unit/test_db_constraints.py` | All 13 CHECK constraints reject bad data |
| `tests/unit/test_db_sequences.py` | Sequences increment correctly |
| `tests/unit/test_conditional_updates.py` | Status transitions only from valid states |
| `tests/unit/test_idempotency.py` | Idempotency key rejection on replay |
| `tests/unit/test_csrf.py` | CSRF validation |
| `tests/unit/test_rate_limit.py` | Rate limit enforcement |
| `tests/integration/test_enrollment_concurrency.py` | 10 concurrent for capacity-5 section |
| `tests/integration/test_payment_concurrency.py` | 10 concurrent payments for 1000 SAR |
| `tests/integration/test_contract_activation.py` | 5 concurrent activations, 1 succeeds |
| `tests/integration/test_refund_disbursement.py` | 5 concurrent disbursements, 1 succeeds |
| `tests/integration/test_cancel_section_transaction.py` | Rollback on mid-failure |
| `tests/integration/test_orphaned_states.py` | All O01-O08 scenarios |
| `tests/integration/test_idempotency_e2e.py` | Idempotency replay across full HTTP |
| `tests/integration/test_security_headers.py` | CSP, HSTS, X-Frame-Options |

### 🧪 10.2 Run Backend Tests

```bash
cd backend

# Install test deps
pip install pytest pytest-cov pytest-asyncio httpx

# Run all tests
pytest -v --cov=app --cov-report=term-missing

# Run specific categories
pytest tests/unit/ -v
pytest tests/integration/ -v -x  # Stop on first failure for concurrency tests
```

**Target:** All tests green, 80%+ coverage.

### 🧪 10.3 Frontend Checks

```bash
cd frontend

# TypeScript check
npx tsc --noEmit
# Expected: zero errors

# Lint
npm run lint
# Expected: zero warnings

# Build
npm run build
# Expected: successful build, no errors

# Run existing E2E tests
npx playwright test
```

### 🧪 10.4 Manual Smoke Tests

Open browser to `http://localhost:3000` and verify:

- [ ] Login as superadmin
- [ ] Login as manager
- [ ] Login as secretary
- [ ] Login as teacher
- [ ] Create student → enroll in section → record payment
- [ ] Mark attendance → assign grade → complete section
- [ ] Generate certificate
- [ ] Run daily closure
- [ ] Disburse refund
- [ ] Check all 4 role dashboards load
- [ ] Switch between Arabic/English
- [ ] RTL layout renders correctly

### 🧪 10.5 Docker Build Verification

```bash
# Test that Docker builds work on your machine
docker compose -f docker-compose.prod.yml build backend frontend

# Expected: builds succeed with no errors
```

### 🧪 10.6 Final Git Commit

```bash
git add -A
git commit -m "test: add unit, integration, and E2E tests for QA remediation phases"
git push origin main
```

---

# PART 3: TRANSFER TO SERVER

---

## Migration: Move Codebase to Production Server

### 📦 Step 1: Final Laptop Checks

Before transferring, verify on your laptop:

```bash
# 1. Everything is committed
git status  # Should show "nothing to commit, working tree clean"

# 2. Log of all commits that should be present:
git log --oneline -20

# Expected commits (in order):
# - "feat: add 13 DB CHECK constraints and partial unique index for enrollments"
# - "feat: add DB sequences for receipt/voucher/certificate numbering"
# - "fix: add conditional UPDATE patterns and transactional wraps for race conditions"
# - "fix: add SELECT FOR UPDATE locks for enrollment, payment, wallet concurrency"
# - "feat: add idempotency key middleware with frontend interceptor"
# - "fix: propagate silent failures with proper logging instead of swallowing"
# - "feat: add Sentry, CI/CD, Docker security, backup script, structured logging"
# - "feat: add CSRF protection, security headers, rate limiting, real IP middleware"
# - "fix: frontend resilience - error handling, form states, sanitization, error boundaries"
# - "feat: production docker-compose with healthchecks, resource limits, service dependencies"
# - "test: add unit, integration, and E2E tests for QA remediation phases"

# 3. Ensure .env files are NOT committed
git check-ignore backend/.env frontend/.env
# Should print the paths (they're ignored)

# 4. Ensure all secrets are environment variables (not hardcoded)
grep -rn "CHANGE_ME" backend/app/ frontend/app/ --include="*.py" --include="*.ts" --include="*.tsx"
# Expected: no results (if there are any, fix them)
```

### 📦 Step 2: Push to GitHub

```bash
git push origin main
```

### 📦 Step 3: Prepare Server

SSH into the server, then:

```bash
# 3a. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 3b. Install Docker Compose plugin
sudo apt-get update
sudo apt-get install -y docker-compose-plugin

# 3c. Install other required tools
sudo apt-get install -y curl postgresql-client rclone

# 3d. Create project directory
sudo mkdir -p /opt/lims
sudo chown $USER:$USER /opt/lims
```

### 📦 Step 4: Clone the Repository

```bash
# Option A: Via GitHub (if server has internet access)
cd /opt/lims
git clone https://github.com/YOUR_ORG/lims.git .

# Option B: Via USB drive (air-gapped transfer)
# On laptop:
git bundle create lims.bundle --all
# Transfer lims.bundle via USB to server
# On server:
cd /opt/lims
git clone /path/to/usb/lims.bundle .

# Option C: Via rsync (local network)
# On laptop:
rsync -avz --exclude '.git' --exclude 'node_modules' --exclude '.venv' \
  --exclude '.env' --exclude '__pycache__' --exclude '.next' \
  /path/to/lms/ user@server:/opt/lims/
```

### 📦 Step 5: Create .env File on Server

**CRITICAL:** This file must exist before any Docker container starts.

```bash
cat > /opt/lims/.env << 'ENVEOF'
# ── Database ──────────────────────────────────────────
POSTGRES_USER=lims
POSTGRES_PASSWORD=lims_secure_pass
POSTGRES_DB=lims

# ── JWT Auth ──────────────────────────────────────────
JWT_SECRET_KEY=R26KSNDzRHt32mLYDUK3PMiNIW80xj4KNO7YTXYjwzs=

# ── Application ───────────────────────────────────────
ENVIRONMENT=production
CORS_ORIGINS=https://aldrasat.edu
TIMEZONE=Asia/Riyadh
BACKEND_URL=backend:8000
FRONTEND_URL=frontend:3000

# ── Monitoring ────────────────────────────────────────
SENTRY_DSN=https://ca8bd0c3e482d811c1c8d0c91e88384e@o4511742043947008.ingest.de.sentry.io/4511742076649552
NEXT_PUBLIC_SENTRY_DSN=https://<your-key>@o<org>.ingest.sentry.io/<project>
ENVEOF
```

Set restrictive permissions:

```bash
chmod 600 /opt/lims/.env
```

### 📦 Step 6: Create Directories for Persisted Data

```bash
mkdir -p /opt/lims/backups
mkdir -p /opt/lims/logs
```

---

# PART 4: SERVER SETUP & DEPLOYMENT

---

## Phase 7b: Infrastructure Server Setup

**Dependency:** Code changes from Phase 7a must be committed and pulled to server

### 🖥️ 7b.1 Install GitHub Actions Runner

```bash
mkdir -p /opt/actions-runner && cd /opt/actions-runner

# Download runner
curl -o actions-runner-linux-x64-2.320.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.320.0/actions-runner-linux-x64-2.320.0.tar.gz
tar xzf actions-runner-linux-x64-2.320.0.tar.gz

# Configure (get token from GitHub: Settings → Actions → Runners → New runner)
./config.sh --url https://github.com/YOUR_ORG/lims --token YOUR_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start

# Verify
sudo ./svc.sh status
```

### 🖥️ 7b.2 Set Up Backup Cron

```bash
# Make backup script executable
chmod +x /opt/lims/backend/scripts/backup.sh

# Add to crontab (run every 6 hours)
(crontab -l 2>/dev/null; echo "0 */6 * * * /opt/lims/backend/scripts/backup.sh >> /opt/lims/backups/backup.log 2>&1") | crontab -

# Also add the 2-hour micro-backup during working hours
(crontab -l 2>/dev/null; echo "0 8-20/2 * * 1-6 /opt/lims/backend/scripts/backup.sh >> /opt/lims/backups/backup.log 2>&1") | crontab -

# Verify crontab
crontab -l
```

### 🖥️ 7b.3 Set Up Log Rotation

Create `/etc/logrotate.d/lims`:

```
/opt/lims/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

Apply:

```bash
sudo chmod 644 /etc/logrotate.d/lims
sudo logrotate -f /etc/logrotate.d/lims  # Test it
```

### 🖥️ 7b.4 Distribute Caddy CA Certificate

If using `tls internal`, the Caddy root CA certificate must be distributed:

```bash
# On server: locate the CA cert
docker exec lims_caddy cat /data/caddy/pki/authorities/local/root.crt > /opt/lims/infrastructure/caddy/root_ca.crt

# Serve it via a simple HTTP endpoint (or manual distribution)
# Clients must download and trust this certificate in their OS/browser
```

---

## Phase 11b: Deploy Docker Containers

### 🖥️ Deploy Steps

```bash
cd /opt/lims

# 1. Load environment variables
set -a
source .env
set +a

# 2. Build Docker images
docker compose -f docker-compose.prod.yml build --no-cache backend frontend

# 3. Start database first (it needs time to initialize)
docker compose -f docker-compose.prod.yml up -d database
sleep 10

# 4. Verify database is ready
docker compose -f docker-compose.prod.yml exec database pg_isready -U lims

# 5. Run database migrations
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

# 6. Start all services
docker compose -f docker-compose.prod.yml up -d

# 7. Verify all containers are running
docker compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                IMAGE                          STATUS
# lims_database       pgvector/pgvector:pg16         Up (healthy)
# lims_backend        lims_backend                   Up (healthy)
# lims_frontend       lims_frontend                  Up (healthy)
# lims_caddy          caddy:latest                   Up (healthy)

# 8. Check health endpoint
curl -sf http://localhost:8000/api/v1/health

# 9. Check frontend
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/ar/login

# 10. Check via Caddy proxy
curl -sf -o /dev/null -w "%{http_code}" https://aldrasat.edu/api/v1/health
curl -sf -o /dev/null -w "%{http_code}" https://aldrasat.edu/ar/login
```

### 🖥️ Troubleshooting Deployment

| Problem | Check |
|---------|-------|
| Backend can't connect to database | Verify `DATABASE_URL` in `.env` uses `@database:5432/` not `@localhost:5440/` |
| Frontend returns 502 from Caddy | Frontend container may not be healthy yet; wait 30s |
| Alembic migration fails | Check migration chain: `docker compose exec backend alembic history` |
| Caddy can't get certificate | For LAN, ensure `tls internal` is set (not Let's Encrypt) |
| Containers keep restarting | Check logs: `docker compose logs backend` |

### 🖥️ Verify All Services

```bash
# Create a comprehensive test
curl -sf https://aldrasat.edu/api/v1/health && echo " Backend OK"
curl -sf -o /dev/null -w "Frontend: %{http_code}\n" https://aldrasat.edu/ar/login
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

---

## Phase 12: Pre-Launch Checklist

### 🖥️ Run Through Every Item

#### Security Hardening

- [ ] `JWT_SECRET_KEY` is a 64-char random hex (not the default)
- [ ] `POSTGRES_PASSWORD` is a 32+ char random password (not default)
- [ ] Sentry DSN is configured in `.env` and verified
- [ ] CSP headers are being served: `curl -sI https://aldrasat.edu | grep -i content-security-policy`
- [ ] HSTS headers are being served: `curl -sI https://aldrasat.edu | grep -i strict-transport`
- [ ] Backend Dockerfile has `USER appuser` (non-root)
- [ ] No database port exposed to host (5440 is internal only)
- [ ] Backup script is executable and cron is configured
- [ ] No hardcoded credentials in any test file
- [ ] Structured logging is active (logs are JSON)

#### QA Remediation Verification

- [ ] **13 CHECK constraints** exist: `docker compose exec database psql -U lims -d lims -c "\d+ payments"` shows constraint
- [ ] **DB sequences** exist: `docker compose exec database psql -U lims -d lims -c "\ds"` shows 4 sequences
- [ ] **Idempotency middleware** active: POST without key works, POST with same key replays
- [ ] **Rate limiting** active: rapid requests return 429
- [ ] **CSRF middleware** active: POST without CSRF token returns 403
- [ ] **Sentry capturing** events: trigger a test error

#### Functional Verification (Browser Testing)

- [ ] Login as superadmin with correct credentials
- [ ] Login with wrong password shows error, lockout after 5 attempts
- [ ] Create student, enroll in section, record payment
- [ ] Mark attendance, assign/grade assignment
- [ ] Complete section, verify certificate generated
- [ ] Run daily closure, verify financial report
- [ ] Disburse refund, verify wallet update
- [ ] All 4 role dashboards load correctly
- [ ] Arabic/English toggle works
- [ ] RTL layout renders correctly
- [ ] Session timeout redirects to login with message
- [ ] Double-click submit creates only 1 payment (idempotency)
- [ ] Search with `%` and `_` characters returns correct results
- [ ] Empty reports show "No data" message

---

## Phase 13: Launch Day

### 🖥️ Pre-Launch (2 Hours Before Go-Live)

```bash
# 1. Final database backup
docker compose -f docker-compose.prod.yml exec database \
  pg_dump -U lims -d lims -F c -f /tmp/pre_launch_backup.dump
docker compose -f docker-compose.prod.yml cp database:/tmp/pre_launch_backup.dump ./pre_launch_backup_$(date +%Y%m%d_%H%M%S).dump

# 2. Verify env vars
cat /opt/lims/.env | grep -v PASSWORD | grep -v SECRET

# 3. Check disk space
df -h /opt/lims

# 4. Check all containers are healthy
docker compose -f docker-compose.prod.yml ps

# 5. Pull latest code
git pull origin main
```

### 🖥️ Deploy

```bash
cd /opt/lims

# Build fresh images
docker compose -f docker-compose.prod.yml build backend frontend

# Recreate containers (zero-downtime for frontend, brief outage for backend)
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend caddy

# Run any pending migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Verify
docker compose -f docker-compose.prod.yml ps
curl -sf https://aldrasat.edu/api/v1/health
curl -sf -o /dev/null -w "%{http_code}" https://aldrasat.edu/ar/login
```

### 🖥️ Post-Launch Verification

- [ ] Log in as all 4 roles
- [ ] Create test data end-to-end
- [ ] Check Sentry for errors
- [ ] Verify backup ran
- [ ] Check disk space after deployment

### 🖥️ Rollback Plan

```bash
# If critical issue found:
docker compose -f docker-compose.prod.yml down
git revert HEAD
docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d

# Restore database if needed:
docker compose -f docker-compose.prod.yml up -d database
sleep 10
docker compose -f docker-compose.prod.yml exec -T database \
  pg_restore -U lims -d lims -c < ./pre_launch_backup.dump
```

---

## Phase 14-15: Post-Launch Monitoring & Hardening

### 🖥️ Week 1 Daily Checks

| Check | Command |
|-------|---------|
| Sentry errors | Open Sentry dashboard |
| Backup ran | `tail -5 /opt/lims/backups/backup.log` |
| Disk space | `df -h /opt/lims` |
| Containers healthy | `docker compose -f docker-compose.prod.yml ps` |
| App logs | `docker compose -f docker-compose.prod.yml logs --tail=50 backend` |

### 🖥️ Week 1 Tasks (in priority order)

| Task | Effort | How |
|------|--------|-----|
| Monitor & fix production crashes | Ongoing | Sentry alerts |
| Test backup restore | 2h | Restore to staging env |
| Fix N+1 queries (H-3) | 6h | Edit service files, redeploy |
| Add audit log cleanup (H-8) | 3h | Add cron job to delete old tokens |
| Add file upload validation (M-3) | 1h | Edit `storage.py` |
| Add pagination (M-8) | 2h | Add skip/limit to payment/expense lists |

### 🖥️ Month 1 Tasks

| Task | Effort | When |
|------|--------|------|
| Fix N+1 queries | 6h | Week 1 |
| Add pagination to all lists | 4h | Week 2 |
| Component tests (React Testing Library) | 2d | Week 2-3 |
| Visual regression tests | 1d | Week 3 |
| Prometheus + Grafana | 2d | Week 3-4 |
| Redis caching for dashboard | 2d | Month 2 |

---

## Effort Summary

| Stage | Phases | Effort | Location |
|-------|--------|--------|----------|
| **Laptop Code** | 1, 2, 3, 4, 5, 6, 7a, 8, 9, 11a | ~18 days | 💻 |
| **Laptop Testing** | 10 | ~5 days | 🧪 |
| **Transfer** | Migration | ~1 day | 📦 |
| **Server Setup** | 7b, 11b, 12 | ~2 days | 🖥️ |
| **Launch** | 13 | ~1 day | 🖥️ |
| **Post-Launch** | 14-15 | ~20 days | 🖥️ |

**Total code effort on laptop:** ~18 days (can be parallelized across multiple developers)
**Total server effort:** ~4 days
**Post-launch:** ~20 days (spread over first month)

---

## Architecture Constraints

From `docs/architecture/memory.md` — do not violate:

1. **Strictly 4 containers** only: caddy, frontend, backend, database
2. **Caddy is the sole gate** — ports 80 and 443 only on host
3. **PostgreSQL is single source of truth** — no external Redis/Qdrant/Celery
4. **FastAPI BackgroundTasks** for async work — no Celery workers
5. **HttpOnly Secure SameSite=Lax cookies** for auth — no localStorage
6. **JWT rotation** with access tokens (15 min) + refresh tokens (7 days)
7. **Internal CA** (Caddy `tls internal`) for LAN HTTPS
8. **SSE for real-time** — no WebSocket or Redis Pub/Sub
9. **Micro-backup every 2 hours** during active hours
10. **100% local functionality** without internet

---

## Reference Documents

| Document | Path |
|----------|------|
| Production Readiness Assessment | `docs/production-readiness-assessment.md` |
| QA Chaos Audit | `docs/qa-chaos-audit.md` |
| QA Remediation Plan (Index) | `docs/plans/qa-chaos-remediation/INDEX.md` |
| Architectural Memory | `docs/architecture/memory.md` |
| Security Guide | `docs/guides/security.md` |
| Development Guide | `docs/guides/development.md` |
| Active Task Status | `docs/operations/active-task.md` |

---

## Quick Reference: Common Commands

### Laptop Commands

```bash
# Start local DB
docker compose up database -d

# Backend
cd backend && .venv/Scripts/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm run dev

# Migrations
cd backend && alembic upgrade head

# Tests
cd backend && pytest -v --cov=app
cd frontend && npx playwright test
cd frontend && npx tsc --noEmit && npm run build
```

### Server Commands

```bash
# Deploy
cd /opt/lims && docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend

# Manual backup
/opt/lims/backend/scripts/backup.sh

# Run migration
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Restart single service
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```
