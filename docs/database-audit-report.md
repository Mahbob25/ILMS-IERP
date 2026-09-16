# Database Audit Report — ERP Backend

**Date:** 2026-09-16
**Scope:** `apps/erp/backend/` — transactions, query optimization, DRY data access
**Auditor:** Principal Database Engineer / ORM Optimization Specialist

---

## CRITICAL

### Issue 1: N+1 Query in `set_final_grades_bulk` — SELECT per grade + per-grade notification query

**File:** `app/modules/academic/service.py:907-961`

**Anti-Pattern:** The loop calls `set_final_grade()` per student, which issues a `SELECT ... WHERE section_id=? AND student_id=?` (line 882-888) each iteration. Then it re-queries the section (line 926) inside the loop for the notification check. For a section with 30 students, this produces ~60+ queries instead of 2-3.

```python
# BEFORE — N+1
async def set_final_grades_bulk(db, section_id, grades, graded_by):
    results = []
    for g in grades:
        fg = await set_final_grade(db, section_id=section_id, ...)  # SELECT per iteration
        results.append(fg)
        section = await get_course_section(db, section_id)  # re-SELECT every iteration!
        if section and section.teacher_id:
            await emit_grade_submitted(...)
    ...
```

```python
# AFTER — 2 queries total
async def set_final_grades_bulk(db, section_id, grades, graded_by):
    section = await get_course_section(db, section_id)
    # Bulk upsert using pg_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    stmt = pg_insert(FinalGrade.__table__).values([
        {"section_id": section_id, "student_id": g["student_id"],
         "final_score": g["final_score"], "graded_by": graded_by,
         "graded_at": datetime.now(timezone.utc), "notes": g.get("notes")}
        for g in grades
    ]).on_conflict_do_update(
        index_elements=["section_id", "student_id"],
        set_={"final_score": ...}  # excluded.final_score etc.
    )
    await db.execute(stmt)

    if section and section.teacher_id:
        try:
            await emit_grade_submitted(db, section_id=section_id, teacher_employee_id=section.teacher_id)
        except Exception:
            pass

    enrolled_count = (await db.scalar(select(func.count(Enrollment.id)).where(...))) or 0
    graded_count = (await db.scalar(select(func.count(FinalGrade.id)).where(...))) or 0
    if enrolled_count > 0 and graded_count >= enrolled_count:
        await ledger_finalize_grades(db, section_id=section_id)
```

**Expected Gain:** 30-student section goes from ~60 queries to 4 queries. ~95% reduction in DB round-trips for grade submission.

---

### Issue 2: N+1 in `complete_section` — per-enrollment certificate creation + per-enrollment payment sum

**File:** `app/modules/academic/service.py:304-431`

**Anti-Pattern:** Two separate N+1 clusters in one function:
- Lines 342-366: Loops over `completion_enrollments`, calling `_sum_payments_for_enrollment()` (a SELECT SUM query) and `get_enrollment_price_components_batch()` per enrollment.
- Lines 414-428: Loops again over enrollments calling `create_certificate()` per enrollment.

```python
# BEFORE
for enrollment in completion_enrollments:
    components = price_components.get(enrollment.id) or {}
    total_paid = await _sum_payments_for_enrollment(db, enrollment.id)  # 1 query per enrollment
    ...
# Then again:
for enrollment in enrollments_result.scalars().all():
    await create_certificate(db, enrollment, ...)  # 1+ queries per enrollment
```

```python
# AFTER — batch the payment sums, batch certificate creation
enrollment_ids = [e.id for e in completion_enrollments]
total_paid_rows = await db.execute(
    select(Payment.enrollment_id, func.coalesce(func.sum(Payment.amount), 0))
    .where(Payment.enrollment_id.in_(enrollment_ids))
    .group_by(Payment.enrollment_id)
)
total_paid_map = {row[0]: Decimal(str(row[1])) for row in total_paid_rows.all()}

# Certificates: batch insert instead of per-row create
# (extract the core INSERT from create_certificate into a bulk path)
```

**Expected Gain:** For 30-enrollment section completion: ~90 queries to ~8 queries.

---

### Issue 3: N+1 in `get_eligible_recipients` — wallet query per teacher

**File:** `app/modules/lms/financial_service.py:281-308`

**Anti-Pattern:** Loops over all teacher Employee rows, then queries `TeacherWallet` individually per teacher inside the loop (line 294-299). Classic N+1.

```python
# BEFORE
for emp in teachers:
    wallet_result = await db.execute(
        select(TeacherWallet).where(TeacherWallet.teacher_id == emp.id)
    )  # 1 query per teacher!
    wallet = wallet_result.scalar_one_or_none()
```

```python
# AFTER — single query with join
teacher_ids = [emp.id for emp in teachers]
wallets_result = await db.execute(
    select(TeacherWallet).where(TeacherWallet.teacher_id.in_(teacher_ids))
)
wallet_map = {w.teacher_id: w for w in wallets_result.scalars().all()}

result = []
for emp in teachers:
    wallet = wallet_map.get(emp.id)
    balance = wallet.balance if wallet else Decimal("0")
    frozen = wallet.frozen_balance if wallet else Decimal("0")
    ...
```

**Expected Gain:** 20 teachers to from 21 queries to 1 query.

---

### Issue 4: N+1 in `_check_payment_deadlines` — per-enrollment payment sum

**File:** `app/modules/academic/section_startup_checks.py:170-195`

**Anti-Pattern:** For each section near its payment deadline, loops over enrollments and queries `SUM(Payment.amount)` per enrollment (line 184-188). Runs on every server boot.

```python
# BEFORE
for enrollment in enrollments:
    payments_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.enrollment_id == enrollment.id,
        )
    )  # 1 query per enrollment per section!
```

```python
# AFTER — single grouped query per section
enrollment_ids = [e.id for e in enrollments]
total_paid_rows = await db.execute(
    select(Payment.enrollment_id, func.coalesce(func.sum(Payment.amount), 0))
    .where(Payment.enrollment_id.in_(enrollment_ids))
    .group_by(Payment.enrollment_id)
)
total_paid_map = {row[0]: Decimal(str(row[1])) for row in total_paid_rows.all()}

for enrollment in enrollments:
    total_paid = total_paid_map.get(enrollment.id, Decimal("0"))
    ...
```

**Expected Gain:** 10 sections x 20 enrollments to from ~200 queries to ~10.

---

## WARNING

### Issue 5: Over-fetching + in-memory filtering in `get_student_register`

**File:** `app/modules/reports/service.py:148-192`

**Anti-Pattern:** Loads ALL student rows (full ORM objects), then separately queries ALL enrollment student_ids, then filters in Python. Should be a single SQL query with a LEFT JOIN.

```python
# BEFORE
students_result = await db.execute(select(Student).where(...))  # ALL columns
students = students_result.scalars().all()
enrolled_result = await db.execute(select(Enrollment.student_id).where(...))
enrolled_ids = {row[0] for row in enrolled_result.fetchall()}
rows = [{"student_id": str(s.id), ..., "is_enrolled": s.id in enrolled_ids} for s in students]
```

```python
# AFTER — single query, only needed columns
result = await db.execute(
    select(
        Student.id,
        Student.student_code,
        Student.full_name,
        Student.email,
        Enrollment.student_id.isnot(None).label("is_enrolled"),
    )
    .select_from(Student)
    .outerjoin(Enrollment, (Enrollment.student_id == Student.id) & (Enrollment.deleted_at.is_(None)))
    .where(Student.deleted_at.is_(None))
    .order_by(Student.full_name)
)
rows = [dict(r) for r in result.mappings().all()]
```

**Expected Gain:** 1 query instead of 2, eliminates loading unused columns, DB-side filtering replaces Python set membership.

---

### Issue 6: Over-fetching in `get_teacher_wallets` — loads full ORM models then counts in Python

**File:** `app/modules/reports/service.py:395-439`

**Anti-Pattern:** Loads full `TeacherWallet` objects (with joined `teacher_employee`), then separately queries ALL ledger entries, then counts entries per wallet in Python.

```python
# BEFORE
wallets_result = await db.execute(
    select(TeacherWallet).options(joinedload(TeacherWallet.teacher_employee))
)
wallets = wallets_result.scalars().all()
entry_counts_result = await db.execute(
    select(LedgerEntry.wallet_id, func.count(LedgerEntry.id)).group_by(LedgerEntry.wallet_id)
)
entry_counts = dict(entry_counts_result.fetchall())
for wallet in wallets:  # iterating ORM objects
    ...
    entry_counts.get(wallet.id, 0)
```

```python
# AFTER — aggregate in SQL
result = await db.execute(
    select(
        TeacherWallet.id,
        TeacherWallet.teacher_id,
        TeacherWallet.balance,
        TeacherWallet.frozen_balance,
        Employee.full_name,
        func.count(LedgerEntry.id).label("entry_count"),
    )
    .select_from(TeacherWallet)
    .join(Employee, Employee.id == TeacherWallet.teacher_id)
    .outerjoin(LedgerEntry, LedgerEntry.wallet_id == TeacherWallet.id)
    .group_by(TeacherWallet.id, Employee.full_name)
)
items = [
    {
        "teacher_id": str(row.teacher_id),
        "teacher_name": row.full_name,
        "balance": float(row.balance or 0),
        "frozen_balance": float(row.frozen_balance or 0),
        "available": float(row.balance or 0) - float(row.frozen_balance or 0),
        "entry_count": row.entry_count,
    }
    for row in result.all()
]
```

**Expected Gain:** 1 query instead of 2, no ORM hydration overhead, DB-side aggregation.

---

### Issue 7: Duplicated payment-sum query across 4 locations

**Files:**
- `app/modules/academic/service.py:1075-1083` (`_sum_payments_for_enrollment`)
- `app/modules/academic/unenrollment_service.py:141-149` (`get_enrollment_payments`)
- `app/modules/lms/financial_service.py:793-800` (`get_student_payment_summary`)
- `app/modules/reports/service.py:665-667` (inline in `_load_enrollment_for_student_section`)

**Anti-Pattern:** All four do `SELECT COALESCE(SUM(amount), 0) FROM payments WHERE enrollment_id = ?`. This is a DRY violation — should live in one repository function.

```python
# REFACTORED — single repository function (e.g., in lms/repository.py)
async def get_total_paid_for_enrollments(
    db: AsyncSession, enrollment_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Decimal]:
    """Batch version — returns {enrollment_id: total_paid} for all given IDs."""
    if not enrollment_ids:
        return {}
    rows = await db.execute(
        select(Payment.enrollment_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.enrollment_id.in_(enrollment_ids))
        .group_by(Payment.enrollment_id)
    )
    return {row[0]: Decimal(str(row[1])) for row in rows.all()}

async def get_total_paid_for_enrollment(db, enrollment_id):
    results = await get_total_paid_for_enrollments(db, [enrollment_id])
    return results.get(enrollment_id, Decimal("0"))
```

**Expected Gain:** Eliminates 4 copies of the same query pattern, single optimization point.

---

### Issue 8: Looped INSERT in `set_attendance_records` — per-record `db.add()`

**File:** `app/modules/lms/service.py:37-49`

**Anti-Pattern:** Adds each `AttendanceRecord` individually in a loop, relying on `flush()` at the end. For bulk attendance entry (e.g., 30 students), this produces 30 individual INSERT statements.

```python
# BEFORE
for r in records:
    rec = AttendanceRecord(session_id=session_id, student_id=r["student_id"], status=r["status"])
    db.add(rec)
await db.flush()
```

```python
# AFTER — single bulk insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
stmt = pg_insert(AttendanceRecord.__table__).values([
    {"session_id": session_id, "student_id": r["student_id"], "status": r["status"]}
    for r in records
])
await db.execute(stmt)
```

**Expected Gain:** 30 records to 1 INSERT instead of 30. ~97% reduction for typical attendance batch.

---

## OPTIMIZATION

### Issue 9: `get_student_section_report` — 8 sequential queries for one student-section page

**File:** `app/modules/reports/service.py:638-843`

**Anti-Pattern:** Loads enrollment, then payments sum, then payments list, then attendance summary, then attendance detail, then grade, then certificate, then unenrollment — 8 separate queries, all sequential.

```python
# BEFORE (sequential)
enrollment = await _load_enrollment_for_student_section(...)
total_paid = await db.execute(select(func.coalesce(func.sum(Payment.amount), 0)).where(...))
payments_result = await db.execute(select(Payment)...where(...))
attendance_summary_rows = await db.execute(...)
detail_result = await db.execute(...)
grade_result = await db.execute(...)
cert_result = await db.execute(...)
unenroll_result = await db.execute(...)
```

```python
# AFTER — parallelize independent reads
import asyncio
total_paid_calc = asyncio.create_task(_total_paid(db, enrollment.id))
payments_list_calc = asyncio.create_task(_payments_list(db, enrollment.id))
attendance_calc = asyncio.create_task(_attendance(db, student_id, section_id))
grade_calc = asyncio.create_task(_grade(db, section_id, student_id))
cert_calc = asyncio.create_task(_cert(db, student_id, section_id))
unenroll_calc = asyncio.create_task(_unenroll(db, enrollment.id))
total_paid, payments_rows, attendance_data, grade, cert, unenroll = await asyncio.gather(
    total_paid_calc, payments_list_calc, attendance_calc, grade_calc, cert_calc, unenroll_calc
)
```

**Expected Gain:** ~6 round-trips saved (8 sequential to ~2-3 sequential with the dependency on enrollment, then 6 parallel). ~60-70% latency reduction on this report.

---

### Issue 10: `get_secretary_dashboard` — loads all students to count enrolled in Python

**File:** `app/modules/dashboard/service.py:134-145`

**Anti-Pattern:** `select(Student).order_by(Student.full_name)` loads all students, then fetches a separate distinct enrollment set, then counts in Python.

```python
# AFTER
students_result = await db.execute(
    select(func.count()).select_from(Student)
)
total_students = students_result.scalar() or 0

enrolled_result = await db.execute(
    select(func.count(func.distinct(Enrollment.student_id)))
    .where(Enrollment.deleted_at.is_(None))
)
enrolled_count = enrolled_result.scalar() or 0
pending_students = total_students - enrolled_count
```

**Expected Gain:** No row loading, pure aggregation in SQL. Scales to thousands of students without memory pressure.

---

## Summary Table

| # | Severity | File | Lines | Pattern | Est. Gain |
|---|----------|------|-------|---------|-----------|
| 1 | CRITICAL | academic/service.py | 907-961 | N+1 per-grade SELECT+re-SELECT | ~95% query reduction |
| 2 | CRITICAL | academic/service.py | 304-431 | N+1 per-enrollment payment sum + cert | ~90 query reduction |
| 3 | CRITICAL | lms/financial_service.py | 281-308 | N+1 wallet per teacher | 20x fewer queries |
| 4 | CRITICAL | academic/section_startup_checks.py | 170-195 | N+1 payment sum per enrollment | ~95% for daily job |
| 5 | WARNING | reports/service.py | 148-192 | Over-fetch + Python filter | 2 queries to 1, no full ORM |
| 6 | WARNING | reports/service.py | 395-439 | Over-fetch + Python count | 2 queries to 1 |
| 7 | WARNING | 4 files | various | Duplicated SUM(payments) query | DRY — 4 copies to 1 |
| 8 | WARNING | lms/service.py | 37-49 | Looped single-row INSERT | 30x fewer INSERTs |
| 9 | OPTIMIZATION | reports/service.py | 638-843 | 8 sequential independent queries | ~60% latency cut |
| 10 | OPTIMIZATION | dashboard/service.py | 134-145 | Load all + Python count | Pure SQL aggregation |

---

## Recommended Fix Order

1. **Issue 1 + 2** (`set_final_grades_bulk` + `complete_section`) — highest user-facing impact, grade submission and section completion are daily operations.
2. **Issue 3** (`get_eligible_recipients`) — single-query fix, immediate relief on expense creation page.
3. **Issue 4** (`_check_payment_deadlines`) — fixes daily boot job from O(sections x enrollments) to O(sections).
4. **Issue 7** (DRY payment-sum) — extract repository function, refactor all 4 call sites.
5. **Issue 8** (`set_attendance_records`) — bulk insert, trivial change.
6. **Issues 5, 6, 9, 10** — report/dashboard optimizations, lower frequency but easy wins.
