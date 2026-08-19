# Phase 6: Backend Silent Failures — Logging & Error Propagation

**Owner:** Backend D
**Estimate:** 1.5 days
**Dependencies:** None (no schema dependencies)

## Audit Items Covered

- **F01:** `academic/service.py:352` — `try/except/continue` swallows certificate failure
- **F02:** `academic/service.py:754` — `try/except/pass` swallows ledger finalize failure
- **F03:** `lms/financial_service.py:84` — payment on non-existent enrollment silently returns None
- **F10:** `cancellation_service.py:292` — premature `commit()` inside service
- **F11:** `academic/service.py:404` — premature `commit()` inside `deactivate_section`
- **S14:** Expired auth token during attendance marking — partial batch write
- **O07:** `run_daily_section_checks` — idempotency guard via `daily_jobs_log`
- **S08:** Verify RESTRICT behavior on FK cascade — add logging if ORM bypasses
- **S09:** Network glitch retry — add retry logic in backend API client
- **S31:** Disk full during PDF generation — pre-check disk space

## Tasks

### 6.1 Fix F01 — Certificate Creation Logging

In `academic/service.py` at line 352:

```python
# Current:
try:
    await create_certificate(...)
except Exception:
    continue

# Fixed:
try:
    await create_certificate(...)
except Exception as e:
    logger.error("Certificate creation failed for student %s in section %s: %s",
                 student_id, section_id, str(e))
    raise  # Let the outer transaction rollback (after O03 fix makes it transactional)
```

### 6.2 Fix F02 — Ledger Finalize Logging

In `academic/service.py` at line 754:

```python
# Current:
try:
    await ledger_finalize_grades(...)
except ValueError:
    pass

# Fixed:
try:
    await ledger_finalize_grades(...)
except ValueError as e:
    logger.error("Ledger grade finalization failed: %s", str(e))
    raise  # Let the transaction rollback
```

### 6.3 Fix F03 — Payment Audit Logging

In `lms/financial_service.py` at line 84:

```python
# Current:
enrollment = await db.execute(...).scalar_one_or_none()
if not enrollment:
    return None

# Fixed:
enrollment = await db.execute(...).scalar_one_or_none()
if not enrollment:
    logger.warning("Payment attempted for non-existent enrollment %s from user %s",
                   enrollment_id, request.user.id)
    raise ValueError("Enrollment not found")
```

### 6.4 Fix F10 — commit → flush

In `academic/cancellation_service.py` at line 292:

```python
# Current:
await db.commit()   # premature commit
# Fixed:
await db.flush()    # let caller control the transaction boundary
```

### 6.5 Fix F11 — commit → flush

In `academic/service.py` at line 404:

```python
# Current:
await db.commit()   # premature commit
# Fixed:
await db.flush()    # let caller control the transaction boundary
```

### 6.6 Fix S14 — Partial Attendance Batch

In the attendance marking endpoint (`set_attendance_records` or similar):

```python
# Current: saves each record individually, commits partial batch
# Fixed:
try:
    for record in records:
        db.add(AttendanceRecord(...))
    db.flush()
except Exception as e:
    logger.error("Attendance batch save failed: %s", str(e))
    db.rollback()
    raise HTTPException(status_code=500, detail="Attendance save failed. Please retry.")
```

### 6.7 Fix O07 — Daily Section Checks Idempotency

In `run_daily_section_checks()`:

```python
# Current: no idempotency guard — could process same sections twice on restart
# Fixed:
existing = await db.execute(
    select(DailyJobsLog).filter(
        DailyJobsLog.job_name == "section_checks",
        DailyJobsLog.last_run_date == today
    )
).first()
if existing:
    logger.info("Section checks already ran for %s, skipping", today)
    return

# ... process sections ...

db.add(DailyJobsLog(job_name="section_checks", last_run_date=today))
db.flush()
```

### 6.8 Fix S31 — Disk Space Check

Before PDF generation in the receipt/certificate service:

```python
import shutil

def check_disk_space(path: str, required_mb: int = 100):
    usage = shutil.disk_usage(path)
    available_mb = usage.free / (1024 * 1024)
    if available_mb < required_mb:
        raise IOError(f"Insufficient disk space: {available_mb:.0f}MB available, {required_mb}MB required")
```

## Files to CREATE

None.

## Files to EDIT

| File | Line(s) | Change |
|------|---------|--------|
| `apps/erp/backend/app/modules/academic/service.py` | 352–356 | Add `logger.error()` before `continue` (F01) |
| `apps/erp/backend/app/modules/academic/service.py` | 754–758 | Add `logger.error()` before `pass` (F02) |
| `apps/erp/backend/app/modules/academic/service.py` | 404 | `commit()` → `flush()` (F11) |
| `apps/erp/backend/app/modules/lms/financial_service.py` | 84–86 | Add audit logging for missing enrollment (F03) |
| `apps/erp/backend/app/modules/academic/cancellation_service.py` | 292 | `commit()` → `flush()` (F10) |
| `apps/erp/backend/app/modules/academic/service.py` | Attendance handler | Transactional batch (S14) |
| `apps/erp/backend/app/modules/academic/section_startup_checks.py` | `run_daily_section_checks` | Add idempotency guard (O07) |
| PDF generation service | Receipt/certificate service | Add disk space check (S31) |

## Independent Boundary

- Do NOT modify DB schema or migrations (Phase 1, 2 concerns)
- Do NOT add conditional UPDATE patterns (Phase 3 concern)
- Do NOT add SELECT FOR UPDATE (Phase 4 concern)
- Do NOT create idempotency key middleware (Phase 5 concern)
- Do NOT touch `apps/erp/frontend/lib/api.ts` (Phase 9 concern)
- Do NOT modify any `router.py` files
- **In `academic/service.py`, only touch lines 352–356, 404, 754–758, and the attendance handler — do NOT touch `complete_section()` business logic, enrollment capacity, or payment functions**

## Acceptance Criteria

- [ ] Certificate failures are logged at ERROR level with student/section context
- [ ] Ledger finalize failures are logged at ERROR level
- [ ] Payment attempts on non-existent enrollments log a WARNING
- [ ] Both `commit()` → `flush()` locations verified (F10, F11)
- [ ] Attendance batch save is fully transactional
- [ ] `run_daily_section_checks` is idempotent via `daily_jobs_log`
- [ ] Disk space check exists before PDF/file generation
- [ ] No new silent failures introduced
