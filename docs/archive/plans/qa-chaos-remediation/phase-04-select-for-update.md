# Phase 4: SELECT FOR UPDATE + Concurrency Locks

**Owner:** Backend B
**Estimate:** 2.5 days
**Dependencies:** None (no schema dependency — works with existing DB schema)

## Audit Items Covered

- **R05:** Payment overpayment — `SELECT FOR UPDATE` on enrollment's payments before computing remaining balance
- **R06:** Over-enrollment — `SELECT FOR UPDATE` on section row before capacity check
- **R07:** Double wallet creation — `INSERT ... ON CONFLICT DO NOTHING` (upsert)
- **R13:** Email uniqueness race — UNIQUE constraint + `IntegrityError` handler
- **R14:** Payment on closed day — advisory lock or serializable isolation
- **S16:** Concurrent payment + day-closure at midnight — TOCTOU with advisory lock
- **S19:** Two managers close same day — handle `IntegrityError` on date PK, add audit log
- **S20:** Withdraw before cancellation reversal — wallet balance lock
- **S23:** 50 concurrent enrollment requests — `SELECT FOR UPDATE` on section
- **S24:** 10 concurrent payment requests — `SELECT FOR UPDATE` on enrollment's payments
- **S26:** Two contracts activated for same section — row-level lock
- **S30:** Amendment approval + withdrawal race — wallet row lock
- **S32:** Two managers approve unlock request — concurrency guard

## Tasks

### 4.1 Enrollment Capacity Lock (R06, S23)

In `academic/service.py`, the enrollment function:

```python
# Current (race-prone):
section = db.query(CourseSection).filter(CourseSection.id == section_id).first()
if section.enrolled_count >= section.capacity:
    raise ValueError("Section is full")

# Fixed:
section = db.query(CourseSection).filter(
    CourseSection.id == section_id
).with_for_update().first()
if section.enrolled_count >= section.capacity:
    raise ValueError("Section is full")
```

The `with_for_update()` locks the section row until the transaction commits, preventing any concurrent read of `enrolled_count`.

### 4.2 Payment Balance Lock (R05, S24)

In `lms/financial_service.py`, the payment creation function:

```python
# Current:
enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
total_paid = db.query(func.sum(Payment.amount)).filter(
    Payment.enrollment_id == enrollment_id
).scalar() or 0

# Fixed — lock the enrollment row + payments:
enrollment = db.query(Enrollment).filter(
    Enrollment.id == enrollment_id
).with_for_update().first()
total_paid = db.query(func.sum(Payment.amount)).filter(
    Payment.enrollment_id == enrollment_id
).with_for_update().scalar() or 0
```

### 4.3 Wallet Upsert (R07)

```python
# Current:
wallet = db.query(TeacherWallet).filter(
    TeacherWallet.teacher_id == teacher_id
).first()
if not wallet:
    wallet = TeacherWallet(teacher_id=teacher_id, balance=0, frozen_balance=0)
    db.add(wallet)

# Fixed:
from sqlalchemy.dialects.postgresql import insert as pg_insert

stmt = pg_insert(TeacherWallet).values(
    teacher_id=teacher_id, balance=0, frozen_balance=0
).on_conflict_do_nothing(index_elements=['teacher_id'])
db.execute(stmt)
wallet = db.query(TeacherWallet).filter(
    TeacherWallet.teacher_id == teacher_id
).with_for_update().first()
```

### 4.4 Email Uniqueness (R13)

Add UNIQUE constraint on `users.email` (in existing migration or Phase 1 if already there). Then in the `grant_access` endpoint:

```python
try:
    db.add(user)
    db.flush()
except IntegrityError as e:
    if "users_email_key" in str(e):
        raise HTTPException(status_code=409, detail="Email already registered")
    raise
```

### 4.5 Advisory Lock for Day Closure (R14, S16)

In `close_day()` and `create_payment()`, use a PostgreSQL advisory lock:

```python
# Before day closure or payment on a date:
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('daily_closure:' || :date))"), {"date": str(today)})

# This serializes all payment + closure operations on the same date.
# Only one transaction can process a given date at a time.
```

### 4.6 Wallet Amendment Lock (R12 portion, S30)

In `ledger_service.py`, `approve_amendment()`:

```python
wallet = db.query(TeacherWallet).filter(
    TeacherWallet.teacher_id == teacher_id
).with_for_update().first()
# Now safe to read balance, compute new balance, write
```

### 4.7 Contract Activation Lock (S26)

In `ledger_service.py`, `activate_contract()`:

```python
contract = db.query(Contract).filter(
    Contract.id == contract_id
).with_for_update().first()
# Then use conditional UPDATE from Phase 3
```

### 4.8 Closure Unlock Concurrency (S32)

In the unlock-approval endpoint:
- Add `SELECT FOR UPDATE` on the daily_closures row
- Check current status before transitioning
- Audit log which manager approved

## Files to CREATE

None.

## Files to EDIT

| File | Specific Functions | Changes |
|------|-------------------|---------|
| `apps/erp/backend/app/modules/academic/service.py` | Enrollment function (capacity check) | Add `with_for_update()` before reading section |
| `apps/erp/backend/app/modules/lms/financial_service.py` | Payment creation (remaining balance) | Add `with_for_update()` on enrollment + payments |
| `apps/erp/backend/app/modules/lms/ledger_service.py` | `approve_amendment()`, `activate_contract()` | Add `with_for_update()` on wallet/contract |
| `apps/erp/backend/app/modules/lms/ledger_service.py` | Wallet upsert function | Replace read-check-create with `INSERT ... ON CONFLICT` |
| User creation endpoint | `grant_access()` | Add IntegrityError handler for email uniqueness |
| Closure payment handler | `close_day()`, payment functions | Add advisory lock for TOCTOU |
| Unlock approval endpoint | Unlock approval handler | Add `SELECT FOR UPDATE` + audit logging |

## Independent Boundary

- Do NOT modify DB schema or migrations (Phase 1, 2 concerns)
- Do NOT modify conditional UPDATE status transitions (Phase 3 concern — the if-check-then-write in Phase 4 functions uses SELECT FOR UPDATE, not the WHERE status pattern of Phase 3)
- Do NOT create idempotency keys or middleware (Phase 5 concern)
- Do NOT modify `apps/erp/frontend/` files
- Do NOT modify Caddyfile or infrastructure
- **In `academic/service.py`, only touch the enrollment capacity function — do NOT touch `complete_section()`, `set_final_grades_bulk()`, or `cancel_section()` (Phase 3 functions)**
- **In `ledger_service.py`, only touch `approve_amendment()` and wallet functions — do NOT touch contract status transition functions (Phase 3)**

## Acceptance Criteria

- [ ] Every enrollment capacity check uses `SELECT FOR UPDATE` on the section row
- [ ] Every payment remaining-balance computation uses `SELECT FOR UPDATE` on the enrollment
- [ ] `INSERT ... ON CONFLICT DO NOTHING` used for all wallet creation
- [ ] Advisory lock protects all payment + day-closure operations on the same date
- [ ] Email uniqueness has both DB constraint + application-level error handling
- [ ] Amendment approval locks the wallet row before reading balance
- [ ] Contract activation locks the row before reading status
- [ ] All changes verified with existing test suite
