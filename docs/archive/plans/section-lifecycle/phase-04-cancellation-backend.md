# Phase 4: Cancellation Backend

**Owner:** Backend Agent C  
**Estimate:** 4.25 days  
**Dependencies:** Phase 1 (models exist: `SectionCancellation`, `PendingRefund`, `Refund` tables), Timezone module (`get_today()` from `app.core.timezone`)  
**Parallel-safe:** Yes — creates new service files (`cancellation_service.py`, `cashier_service.py`) and adds new endpoints to routers. Does NOT touch startup checks, grade enforcement, or deactivation.

## Scope

Full cancellation system: impact preview, execute cancellation with financial reversal, PendingRefund authorization, and cashier disbursement flow with receipt generation. Includes all edge cases for cancellation and disbursement.

---

## Tasks

### 4.1 Create `backend/app/modules/academic/cancellation_service.py`

#### `can_cancel_section(section: CourseSection) -> ValidationResult`

Check preconditions:
- Section is not already completed or cancelled
- No certificates issued (certificates block — legal records)
- Return list of warnings (attendance records, final grades exist)

```python
@dataclass
class CancellationPrecondition:
    can_cancel: bool
    warnings: list[str]
    has_attendance_records: bool
    has_final_grades: bool
    has_certificates: bool
```

#### `preview_cancellation_impact(db, section_id: UUID) -> ImpactPreview`

Calculate:
- Teacher wallet reversal amount (existing contract value)
- Total enrolled students count
- Total payments collected across all enrollments
- Attendance and grades status
- List of enrolled students with payment totals

```python
@dataclass
class ImpactPreview:
    section_id: UUID
    course_name: str
    teacher_name: str
    teacher_wallet_reversal_amount: Decimal
    enrolled_count: int
    payments_collected: Decimal
    has_attendance_records: bool
    has_final_grades: bool
    has_certificates: bool
```

#### `cancel_section(db, section_id, cancelled_by, reason, refund_policy) -> SectionCancellation`

Orchestrator within a **single DB transaction**:

```
1. Validate preconditions via can_cancel_section()
2. If has_certificates -> BLOCK (manager must handle manually first)
3. Reverse teacher wallet via existing cancel_contract()
4. If refund_policy == 'authorize_refunds':
     For each enrollment with payments:
       Create PendingRefund record (status: UNCLAIMED)
5. Set section.status = 'cancelled'
   Set section.cancelled_at = now()
   Set section.cancelled_by = cancelled_by
   Set section.cancellation_reason = reason
6. Create SectionCancellation audit record
7. Commit (all or nothing)
```

**Edge cases handled:**
- Certificates exist → block cancellation with clear message
- Final grades exist → pass (grades are kept as educational records; certificates block)
- Teacher wallet insufficient for reversal → block
- Partial failure protected by single transaction

#### `get_student_pending_refunds(db, student_id) -> list[PendingRefund]`

Return all UNCLAIMED refunds for a student profile view.

### 4.2 Create `backend/app/modules/lms/cashier_service.py`

#### `get_pending_refunds_queue(db, search: str | None) -> list[PendingRefund]`

All UNCLAIMED refunds, optionally searchable by student name or code.

#### `disburse_pending_refund(db, pending_refund_id, disbursed_by, notes) -> Refund`

Uses `get_today()` from `app.core.timezone` for institute-local date in daily closure check and receipt numbering.

Execute cash disbursement:

```
1. Load PendingRefund — 404 if not found
2. Check status is UNCLAIMED — idempotency guard, 400 if already CLAIMED/FORFEITED
3. Check daily closure — block if today is closed (use get_today() for institute-local date)
4. Generate receipt number: RFD-YYYYMMDD-NNNN (sequential per day, pass get_today())
5. Create Refund record with receipt_number, amount, disbursed_by, notes
6. Set PendingRefund.status = 'CLAIMED'
7. Record expense in daily cash ledger under cashier's shift
8. Commit
```

**Edge cases handled:**
- Duplicate disbursement attempt → idempotency guard (status must be UNCLAIMED)
- Disbursement on closed day → blocked, cashier must unlock day first
- Receipt number collision → retry with next sequence number

**Receipt number format:**
```python
async def _generate_receipt_number(db: AsyncSession, today: date) -> str:
    # Count existing refunds for today
    count = await db.scalar(
        select(func.count()).select_from(Refund).where(
            func.date(Refund.disbursed_at) == today
        )
    )
    seq = (count or 0) + 1
    return f"RFD-{today.strftime('%Y%m%d')}-{seq:04d}"
```

#### `get_cashier_refund_history(db, cashier_id, shift_date) -> list[Refund]`

All disbursements for a cashier's shift.

### 4.3 Manager API Endpoints

Add to `backend/app/modules/academic/router.py`:

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/course-sections/{id}/cancel-preview` | `get_cancel_preview` | Impact preview |
| `POST` | `/course-sections/{id}/cancel` | `cancel_section_endpoint` | Execute cancellation |
| `GET` | `/course-sections/{id}/cancellation` | `get_cancellation_detail` | View audit record |

### 4.4 Cashier API Endpoints

Add to `backend/app/modules/lms/router.py`:

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/cashier/pending-refunds` | `list_pending_refunds` | Queue (searchable) |
| `GET` | `/students/{id}/pending-refunds` | `get_student_refunds` | Student's pending |
| `POST` | `/cashier/pending-refunds/{id}/disburse` | `disburse_refund` | Execute + generate receipt |
| `GET` | `/cashier/refunds` | `get_refund_history` | Shift history |

### 4.5 Forfeiture Policy (Optional Time-Box)

Add optional expiry to `PendingRefund`:

```python
from app.core.timezone import utcnow

async def expire_stale_pending_refunds(db: AsyncSession, days: int = 180):
    """Background task: mark PendingRefund as FORFEITED after N days."""
    cutoff = utcnow() - timedelta(days=days)
    await db.execute(
        update(PendingRefund)
        .where(
            PendingRefund.status == "UNCLAIMED",
            PendingRefund.created_at < cutoff,
        )
        .values(status="FORFEITED")
    )
    await db.commit()
```

This can be called from the same startup lifespan after section checks, or as a standalone scheduled task.

---

## Files Touched

| File | Action |
|------|--------|
| `backend/app/modules/academic/cancellation_service.py` | **CREATE** — all cancellation logic |
| `backend/app/modules/lms/cashier_service.py` | **CREATE** — all disbursement logic |
| `backend/app/modules/academic/router.py` | **EDIT** — add 3 manager cancellation endpoints (append to end of file) |
| `backend/app/modules/lms/router.py` | **EDIT** — add 4 cashier endpoints (append to end of file) |

## Independent Boundary

This phase does NOT:
- Touch `section_startup_checks.py`
- Modify `service.py` (except to import helper functions if needed)
- Modify grade or payment enforcement logic
- Touch deactivation code

## Verification

- [ ] `can_cancel_section()` returns correct preconditions (warnings for attendance/grades, blocks on certificates)
- [ ] `preview_cancellation_impact()` returns correct financial totals
- [ ] `cancel_section()` with `authorize_refunds` creates PendingRefund records for paying students
- [ ] `cancel_section()` with `no_refund` skips PendingRefund creation
- [ ] Teacher wallet entries reversed correctly
- [ ] Section status → `cancelled`, audit record created
- [ ] Cancellation blocked if certificates exist
- [ ] `disburse_pending_refund()` generates correct receipt number format
- [ ] Duplicate disbursement → idempotency guard returns 400
- [ ] Disbursement on closed day → blocked
- [ ] PendingRefund status transitions: UNCLAIMED → CLAIMED
- [ ] All endpoints return correct response shapes per API contract
