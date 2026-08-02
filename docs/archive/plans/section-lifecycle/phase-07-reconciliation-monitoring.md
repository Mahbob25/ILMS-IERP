# Phase 7: Reconciliation & Monitoring

**Owner:** Backend Agent E  
**Estimate:** 2.0 days  
**Dependencies:** Phases 2, 3, 4, 5 (all backend features merged), Timezone module (`get_today()` from `app.core.timezone`). This is the consolidation phase that runs after all parallel phases are integrated.  
**Sequential:** Must run after Phases 2-6 are merged into main.

## Scope

Cross-cutting features that depend on the complete backend: daily reconciliation reports, admin audit views, monitoring/alerting for section health, and financial impact reporting.

---

## Tasks

### 7.1 Daily Reconciliation Report

Create `backend/app/modules/academic/reconciliation_service.py`:

```python
async def generate_daily_reconciliation_report(db: AsyncSession, report_date: date) -> dict:
    """
    Generate a daily summary of section lifecycle activity.
    Used by managers to verify system behavior and financial impact.
    """

    # Sections that became ready_for_completion today
    # Sections cancelled today (with financial summary)
    # Pending refunds created today
    # Refunds disbursed today
    # Override actions today
    # Sections still overdue
```

**Report structure:**
```json
{
  "report_date": "2026-07-10",
  "generated_at": "2026-07-10T06:00:00Z",
  "summary": {
    "total_active_sections": 45,
    "newly_ready_for_completion": 3,
    "sections_cancelled_today": 1,
    "cancellations": [
      {
        "section_id": "...",
        "course_name": "...",
        "cancelled_by": "Manager Name",
        "reason": "Insufficient enrollment",
        "refund_policy": "authorize_refunds",
        "teacher_reversal": 5000.00,
        "refunds_authorized": 12000.00
      }
    ],
    "refunds_disbursed_today": [
      {
        "receipt_number": "RFD-20260710-0001",
        "student_name": "...",
        "amount": 2500.00,
        "disbursed_by": "Cashier Name"
      }
    ],
    "overrides_today": [
      {
        "section": "...",
        "overridden_by": "Manager Name",
        "bypassed_grade_check": true,
        "bypassed_payment_check": false,
        "reason": "Student dropped out, grade exempted"
      }
    ],
    "overdue_sections_count": 2,
    "unclaimed_pending_refunds_total": 15000.00
  }
}
```

**Endpoint:**
```python
@router.get("/sections/daily-reconciliation")
async def get_daily_reconciliation(
    date: date = Query(default=get_today()),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["superadmin", "manager"])),
):
    return await generate_daily_reconciliation_report(db, date)
```

### 7.2 Admin Audit Log Views

**Cancellation History:**
```python
@router.get("/admin/audit/cancellations")
async def list_cancellations(
    page: int = Query(1),
    per_page: int = Query(20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["superadmin"])),
):
    """Paginated list of all cancellations with filters (date range, manager, section)."""
```

**Override Audit Log:**
```python
@router.get("/admin/audit/overrides")
async def list_overrides(
    page: int = Query(1),
    per_page: int = Query(20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["superadmin"])),
):
    """Paginated list of all force overrides with filters."""
```

**Refund History:**
```python
@router.get("/admin/audit/refunds")
async def list_refunds(
    page: int = Query(1),
    per_page: int = Query(20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["superadmin", "manager"])),
):
    """Paginated list of all refund disbursements with filters."""
```

### 7.3 Monitoring — Overdue Section Alerts

Add to `section_startup_checks.py` (or a new monitoring module):

```python
async def _log_overdue_alert(db: AsyncSession, section: CourseSection) -> None:
    """Log a monitoring event for severely overdue sections (>7 days past end_date)."""
    days_past = (get_today() - section.end_date).days
    if days_past >= 7:
        # Log to monitoring table or use existing logging system
        logger.warning(
            "Section severely overdue",
            extra={
                "section_id": str(section.id),
                "days_past": days_past,
                "ungraded_count": section.flags.get("ungraded_count", 0),
                "unpaid_count": section.flags.get("unpaid_count", 0),
            }
        )
```

### 7.4 Financial Impact Dashboard

**Endpoint:** `GET /sections/financial-impact`

```json
{
  "total_teacher_wallet_reversed_ytd": 50000.00,
  "total_refunds_authorized_ytd": 120000.00,
  "total_refunds_disbursed_ytd": 85000.00,
  "unclaimed_refund_liability": 35000.00,
  "sections_cancelled_ytd": 12,
  "overrides_ytd": 5
}
```

### 7.5 Update API Contract

Add all new Phase 7 endpoints (`GET /sections/daily-reconciliation`, `GET /admin/audit/cancellations`, `GET /admin/audit/overrides`, `GET /admin/audit/refunds`, `GET /sections/financial-impact`, `GET /health/startup-checks`) to `docs/plans/section-lifecycle/api-contract.json` so the contract remains the single source of truth.

### 7.6 Health Check for Startup System

```python
@router.get("/health/startup-checks")
async def check_startup_health(db: AsyncSession):
    """Returns status of the daily startup check system."""
    last_run = await db.execute(
        select(DailyJobsLog)
        .where(DailyJobsLog.job_name == "section_daily_check")
        .order_by(DailyJobsLog.last_run_date.desc())
        .limit(1)
    )
    record = last_run.scalar_one_or_none()
    return {
        "last_run_date": record.last_run_date.isoformat() if record else None,
        "healthy": record is not None and record.last_run_date >= get_today() - timedelta(days=1),
    }
```

---

## Files Touched

| File | Action |
|------|--------|
| `backend/app/modules/academic/reconciliation_service.py` | **CREATE** — DAILY REPORT |
| `backend/app/modules/academic/router.py` | **EDIT** — add reconciliation, audit, health endpoints |
| `backend/app/modules/lms/router.py` | **EDIT** — add refund history audit endpoint |
| `backend/app/modules/academic/section_startup_checks.py` | **EDIT** — add monitoring alert logging (additive) |
| `docs/plans/section-lifecycle/api-contract.json` | **EDIT** — add all new Phase 7 endpoints |

## Independent Boundary

This phase does NOT:
- Modify any core business logic (complete_section, cancel_section, deactivate_section)
- Change database schema or models
- Modify any existing endpoint behavior
- Touch frontend code

## Verification

- [ ] Daily reconciliation report returns correct data for a day with activity
- [ ] Cancellation audit log is paginated and filterable
- [ ] Override audit log shows all force completions with reasons
- [ ] Refund history shows all disbursements with receipt numbers
- [ ] Financial impact endpoint shows correct YTD totals
- [ ] Health check returns last successful run date
- [ ] Severely overdue sections generate monitoring alerts
