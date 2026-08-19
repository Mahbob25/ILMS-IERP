# Phase 2: Startup Daily Checks

**Owner:** Backend Agent A  
**Estimate:** 1.25 days  
**Dependencies:** Phase 1 (models exist, `daily_jobs_log` table exists), Timezone module (`get_today()` from `app.core.timezone`)  
**Parallel-safe:** Yes — owns `section_startup_checks.py`, only touches `main.py` to wire the lifespan call

## Architectural Context

**Startup-Driven Pattern:** The physical server is powered down at night and booted manually each morning. There is NO cron, APScheduler, Celery, or any time-based scheduler. All daily checks run immediately inside the FastAPI `lifespan` startup event — the moment the server boots, it scans for overdue work.

**Catch-Up Semantics:** Since the server can be offline for multiple days, queries use `WHERE end_date <= get_today()` (date-based scanning) rather than `WHERE end_date == datetime.now()` (time-based). This ensures that after a multi-day outage, the first boot catches ALL pending sections regardless of how many days were missed.

**Idempotency Guard:** The `daily_jobs_log` table prevents duplicate execution if the server restarts mid-day for maintenance. A job runs at most once per calendar date.

**No financial mutations happen here.** This system is read-only with flag updates only. Financial actions (contract settlement, wallet entries) are always triggered by an authenticated manager session.

---

## Tasks

### 2.1 Create `apps/erp/backend/app/modules/academic/section_startup_checks.py`

```python
from app.core.timezone import get_today

async def run_daily_section_checks(db: AsyncSession) -> None:
    """
    Called from FastAPI lifespan event on every server boot.
    Checks idempotency gate, then processes overdue and upcoming sections.
    Uses get_today() from the timezone module — always returns the institute's
    local date (Asia/Riyadh), regardless of the server OS timezone.
    """

async def _process_overdue_sections(db: AsyncSession, today: date) -> list[CourseSection]:
    """
    Find active sections where end_date < today (date-based, not time-based).
    Catches up on ALL overdue sections even if server was offline for days.
    For each: check grade completeness.
      - All graded → status = 'ready_for_completion'
      - Missing grades → flags.overdue = True, flags.ungraded_count = N
    """

async def _process_upcoming_deadlines(db: AsyncSession, today: date) -> list[CourseSection]:
    """
    Find active sections where end_date is within warning window.
    Set flags.approaching_end = True.
    """

async def _check_payment_deadlines(db: AsyncSession, today: date) -> None:
    """
    For sections within payment_due_before_end_days of end date,
    flag enrollments with outstanding balances.
    """
```

**Idempotency gate logic (runs FIRST, before any processing):**
```python
today = get_today()  # Institute-local date, not server OS date
result = await db.execute(
    select(DailyJobsLog).where(
        DailyJobsLog.job_name == "section_daily_check",
        DailyJobsLog.last_run_date == today,
    )
)
if result.scalar_one_or_none():
    return  # Already ran today — prevents duplicate on mid-day reboot

# ... process sections (all queries use today for date-based scanning) ...

db.add(DailyJobsLog(job_name="section_daily_check", last_run_date=today))
await db.commit()
```

**Overdue detection logic:**
```python
overdue = await db.execute(
    select(CourseSection).where(
        CourseSection.status == "active",
        CourseSection.end_date < today,
        CourseSection.deleted_at.is_(None),
    )
)

for section in overdue.scalars().all():
    ungraded = await _count_ungraded(db, section.id)
    if ungraded == 0:
        section.status = "ready_for_completion"
    else:
        flags = section.flags or {}
        flags["overdue"] = True
        flags["ungraded_count"] = ungraded
        section.flags = flags
```

**Grade completeness query (NULL vs 0 distinction):**
```python
# Count enrolled students who are NOT graded (fg.id IS NULL)
# LEFT JOIN final_grades — only catches truly missing grades, NOT zero-scores
SELECT COUNT(*)
FROM enrollments e
LEFT JOIN final_grades fg
  ON fg.section_id = e.section_id AND fg.student_id = e.student_id
WHERE e.section_id = :sid
  AND e.deleted_at IS NULL
  AND fg.id IS NULL
```

### 2.2 Wire into FastAPI Lifespan (boot-time, not scheduled)

The lifespan event fires when the uvicorn process starts. Since the server is manually booted each morning, this is the only trigger needed. There are no timers, no background loops, no "wait until midnight" logic — the checks run immediately and exit.

In `apps/erp/backend/app/main.py`:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import async_session_maker
from app.modules.academic.section_startup_checks import run_daily_section_checks

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup-driven daily checks ──
    # Runs immediately on boot. The idempotency gate inside
    # run_daily_section_checks() prevents duplicate execution
    # if the server restarts mid-day for maintenance.
    async with async_session_maker() as db:
        await run_daily_section_checks(db)
    yield
    # Shutdown logic...
```

### 2.3 Configuration Read

Read config values from `section_lifecycle_config` table:

```python
async def _get_config_value(db: AsyncSession, key: str, default: str) -> str:
    result = await db.execute(
        select(SectionLifecycleConfig).where(SectionLifecycleConfig.key == key)
    )
    config = result.scalar_one_or_none()
    return config.value if config else default
```

---

## Files Touched

| File | Action |
|------|--------|
| `apps/erp/backend/app/modules/academic/section_startup_checks.py` | **CREATE** — all check logic |
| `apps/erp/backend/app/main.py` | **EDIT** — call `run_daily_section_checks()` inside lifespan |

## Independent Boundary

This phase does NOT:
- Modify any existing service logic (complete_section, activate, etc.)
- Touch `service.py`, `ledger_service.py`, `cancellation_service.py`, `cashier_service.py`
- Create or modify API endpoints
- Perform any financial mutations

## Verification

- [ ] Startup check runs on server boot without errors (no timer, no scheduler)
- [ ] Idempotency gate prevents duplicate runs on same day (mid-day reboot is safe)
- [ ] After multi-day outage, first boot catches ALL overdue sections (`WHERE end_date <= today`)
- [ ] Overdue active sections with all grades → status becomes `ready_for_completion`
- [ ] Overdue active sections with missing grades → `flags.overdue = True`, `flags.ungraded_count = N`
- [ ] Sections within warning window → `flags.approaching_end = True`
- [ ] `daily_jobs_log` record created after successful run
- [ ] No financial mutations occur (no wallet entries, no contract changes)
