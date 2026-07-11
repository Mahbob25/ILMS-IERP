# Cancellation: Insufficient Teacher Balance — Implementation Plan

**Date:** 2026-07-11
**Status:** Draft for Review
**Author:** Technical Team
**Estimate:** 1.0 day
**Dependencies:** Cancellation backend (Phase 4 — `cancellation_service.py`, `cashier_service.py`, ledger reversal flow exists)

---

## 1. Problem Statement

When a section is cancelled, `cancel_contract()` in `ledger_service.py` creates reversal ledger entries to reclaim credited amounts from the teacher's wallet. However, there is **no check** that the wallet has sufficient balance before creating these reversals.

If a teacher has withdrawn their earnings (via WITHDRAWAL), the wallet balance may be less than the reversal amount. The reversal would drive `wallet.balance` below zero with no tracking mechanism — effectively creating an unrecorded institutional receivable.

Compare with `deactivate_contract()` which **does** guard against this:
```python
if wallet_balance < total_to_reverse:
    raise ValueError("Cannot deactivate: teacher has withdrawn funds...")
```

Cancellation needs the same guard, plus an override path for when cancellation must proceed.

---

## 2. Design Decision: Native Ledger Approach

No separate `TeacherDebt` or `WalletReceivable` model. A negative wallet balance **is** the receivable. The ledger already captures every financial event — a negative balance is automatically tracked, and future `PAYMENT_SHARE` / `ACTIVATION_CREDIT` entries naturally absorb the deficit before the teacher can withdraw again.

The only new surface needed is a UI query: `SELECT * FROM teacher_wallets WHERE balance < 0` for the finance dashboard.

---

## 3. CRITICAL: Race Condition — TOCTOU

Every balance-check-then-write in this plan is vulnerable to a Time-of-Check to Time-of-Use (TOCTOU) race:

```
Manager cancels section          Teacher withdraws
─────────────────────            ─────────────────
Read wallet.balance → 1,000
                                  Read wallet.balance → 1,000
                                  Write WITHDRAWAL → balance = 0
Check: 1,000 >= 1,000 ✅
Write REVERSAL → balance = -1,000
```

Result: wallet is -1,000, but `force=False` was never set. Business rules violated.

### The Fix: `SELECT ... FOR UPDATE`

Every code path that reads a wallet balance **and then writes** must lock the row at the database level for the transaction's duration. The second concurrent transaction will block on the lock and re-read the updated balance after the first commits.

```python
# LOCKING VARIANT — use wherever balance is read for modification
result = await db.execute(
    select(TeacherWallet)
    .where(TeacherWallet.teacher_id == teacher_id)
    .with_for_update()                # ← row-level lock
)
wallet = result.scalar_one_or_none()
```

### Affected Code Paths

| Path | Function | File | Lock Required |
|------|----------|------|---------------|
| Cancellation | `cancel_contract()` → wallet load | `ledger_service.py:393` | ✅ |
| Cancellation | `record()` → wallet re-load | `ledger_service.py:43-46` | ✅ |
| Withdrawal | `record_expense()` → wallet load | `financial_service.py:452` | ✅ |

The preview endpoint (`GET /cancel-preview`) is **read-only** — no lock needed there.

### `get_or_create_wallet()`

The existing helper needs a locking variant. Since PostgreSQL's `FOR UPDATE` on a non-existent row simply returns no rows (no error), the create-then-lock pattern works:

```python
async def get_or_create_wallet(
    db: AsyncSession,
    teacher_id: uuid.UUID,
    lock: bool = False,       # NEW
) -> TeacherWallet:
    query = select(TeacherWallet).where(TeacherWallet.teacher_id == teacher_id)
    if lock:
        query = query.with_for_update()
    result = await db.execute(query)
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = TeacherWallet(teacher_id=teacher_id, balance=0, frozen_balance=0)
        db.add(wallet)
        await db.flush()
        # If created inside a lock request, re-fetch with lock to get the new row
        if lock:
            result = await db.execute(
                select(TeacherWallet)
                .where(TeacherWallet.id == wallet.id)
                .with_for_update()
            )
            wallet = result.scalar_one_or_none()
    return wallet
```

### What the Lock Prevents

```
Manager cancels (holds lock)       Teacher withdraws (waits for lock)
─────────────────────────────      ────────────────────────────────────
SELECT ... FOR UPDATE → row locked
Read balance: 1,000
Write REVERSAL → balance = 0       BLOCKED — waiting on lock...
COMMIT → lock released        →    Acquires lock
                                   Read balance: 0 ← updated value!
                                   Check: 500 <= 0 → FAIL ❌
                                   Withdrawal correctly rejected
```

---

## 4. Tasks

### 4.1 Add `force` Parameter + Row Lock to `cancel_contract()` in Ledger Service

File: `backend/app/modules/lms/ledger_service.py`

```python
async def cancel_contract(
    db: AsyncSession,
    contract_id: uuid.UUID,
    cancelled_by: uuid.UUID,
    reason: Optional[str] = None,
    force: bool = False,  # NEW: allow negative balance when True
) -> SectionContract:
```

Load the wallet with a row lock before the balance check:

```python
wallet = await get_or_create_wallet(db, contract.teacher_id, lock=True)  # CHANGED: lock=True
```

Logic (insert after computing `total_to_reverse`):

```python
if total_to_reverse > 0:
    wallet_balance = Decimal(str(wallet.balance or 0))

    if wallet_balance < total_to_reverse and not force:
        shortfall = total_to_reverse - wallet_balance
        raise ValueError(
            f"Cannot cancel: teacher wallet has insufficient balance. "
            f"Reversal required: {total_to_reverse}, "
            f"Wallet balance: {wallet_balance}, "
            f"Shortfall: {shortfall}. "
            f"Use force_cancellation=true to proceed and create a receivable."
        )

    await record(
        db=db,
        wallet_id=wallet.id,
        contract_id=contract.id,
        entry_type=LedgerEntryType.REVERSAL,
        total_amount=total_to_reverse,
        available_delta=-net_available,
        frozen_delta=-net_frozen,
        reference_type=None,
        reference_id=None,
        narrative=reason or f"Cancellation reversal for contract {contract_id}",
        created_by=cancelled_by,
        force=force,  # NEW
    )
```

**Edge cases:**
- Sufficient balance + `force=False` → proceeds normally (no change)
- Insufficient balance + `force=False` → blocked with shortfall message
- Insufficient balance + `force=True` → proceeds, wallet goes negative (receivable)
- No teacher (contract without teacher_id) → no wallet operations, unchanged

### 4.2 Add Row Lock + `force` Parameter to `record()` in Ledger Service

File: `backend/app/modules/lms/ledger_service.py`

Add row-level lock on the wallet select and accept `force`:

```python
async def record(
    ...
    force: bool = False,  # NEW
) -> LedgerEntry:
    # ... existing entry creation ...

    wallet_result = await db.execute(
        select(TeacherWallet)
        .where(TeacherWallet.id == wallet_id)
        .with_for_update()             # CHANGED: row lock
    )
    wallet = wallet_result.scalar_one_or_none()
```

Invariant changes:

```python
wallet.balance = Decimal(str(wallet.balance or 0)) + available_delta + frozen_delta
wallet.frozen_balance = Decimal(str(wallet.frozen_balance or 0)) + frozen_delta

if wallet.frozen_balance < 0:
    raise ValueError(
        f"Invariant violation: frozen_balance ({wallet.frozen_balance}) cannot be negative"
    )

# NEW: skip frozen > balance check when force=True (balance may be negative)
if not force and wallet.frozen_balance > wallet.balance:
    raise ValueError(
        f"Invariant violation: frozen_balance ({wallet.frozen_balance}) exceeds balance ({wallet.balance})"
    )
```

**Rationale:** The `frozen_balance > balance` invariant is a sanity check for normal operations. When balance goes negative, this check would always fail. The `frozen_balance < 0` check stays unconditional — negative frozen balance is never valid.

### 4.3 Pass `force_cancellation` Through `cancel_section()`

File: `backend/app/modules/academic/cancellation_service.py`

```python
async def cancel_section(
    db: AsyncSession,
    section_id: uuid.UUID,
    cancelled_by: uuid.UUID,
    reason: str,
    refund_policy: str,
    force_cancellation: bool = False,  # NEW
) -> SectionCancellation:
```

Pass to ledger:

```python
await ledger_cancel_contract(
    db,
    contract_id=section.contract.id,
    cancelled_by=cancelled_by,
    reason=f"Section cancellation: {reason}",
    force=force_cancellation,
)
```

### 4.4 Update Preview to Show Wallet Balance + Shortfall

File: `backend/app/modules/academic/cancellation_service.py`

Extend `ImpactPreview`:

```python
@dataclass
class ImpactPreview:
    section_id: uuid.UUID
    course_name: str
    teacher_name: str
    teacher_wallet_reversal_amount: Decimal
    teacher_wallet_balance: Decimal       # NEW
    shortfall: Decimal                     # NEW
    enrolled_count: int
    payments_collected: Decimal
    has_attendance_records: bool
    has_final_grades: bool
    has_certificates: bool
```

Add wallet query inside `preview_cancellation_impact()`:

```python
teacher_wallet_balance = Decimal("0")
shortfall = Decimal("0")
if section.contract and section.contract.teacher_id:
    wallet = await get_or_create_wallet(db, section.contract.teacher_id)
    teacher_wallet_balance = Decimal(str(wallet.balance or 0))
    if teacher_wallet_reversal_amount > teacher_wallet_balance:
        shortfall = teacher_wallet_reversal_amount - teacher_wallet_balance
```

### 4.5 Accept `force_cancellation` in Router Endpoint

File: `backend/app/modules/academic/router.py`

```python
@academic_router.post("/course-sections/{section_id}/cancel")
async def cancel_section_endpoint(
    section_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(RoleChecker(allowed_roles=["superadmin", "manager"])),
    db: AsyncSession = Depends(get_db)
):
    reason = body.get("reason")
    refund_policy = body.get("refund_policy")
    force_cancellation = body.get("force_cancellation", False)  # NEW

    # existing validation...

    try:
        cancellation = await cancellation_service.cancel_section(
            db, section_id=section_id,
            cancelled_by=current_user.id,
            reason=reason.strip(),
            refund_policy=refund_policy,
            force_cancellation=force_cancellation,  # NEW
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
```

Update preview endpoint response:

```python
return {
    ...
    "teacher_reversal_amount": float(preview.teacher_wallet_reversal_amount),
    "teacher_wallet_balance": float(preview.teacher_wallet_balance),  # NEW
    "shortfall": float(preview.shortfall),                            # NEW
    ...
}
```

### 4.6 Add Row Lock + Withdrawal Guard

File: `backend/app/modules/lms/financial_service.py`

Inside `record_expense()`, before the WITHDRAWAL ledger entry — load wallet with row lock:

```python
if expense_type == "teacher_withdrawal" and recipient_id:
    wallet = await get_or_create_wallet(db, recipient_id, lock=True)  # CHANGED: lock=True

    # NEW: prevent withdrawals that would create or deepen a negative balance
    wallet_balance = Decimal(str(wallet.balance or 0))
    if wallet_balance < amount:
        raise ValueError(
            f"Cannot withdraw: insufficient wallet balance. "
            f"Requested: {amount}, Available: {wallet_balance}. "
            f"Outstanding receivable must be cleared before further withdrawals."
        )

    await ledger_record(...)
```

**Edge cases:**
- Positive balance, withdrawal exceeds balance → blocked
- Negative balance (teacher in debt) → blocked entirely
- Zero balance → blocked

---

## 5. UX Flow

1. Manager clicks "Cancel Section" → preview shows:
   - Reversal amount: 1,000 SAR
   - Wallet balance: 200 SAR
   - Shortfall: 800 SAR
   - Warning: **"Teacher wallet has insufficient funds. Cancelling will create an institutional receivable."**
   - Checkbox: `[ ] Force cancellation and create receivable`

2. Shortfall = 0 → cancel proceeds directly (no change)

3. Checkbox unchecked + shortfall > 0 → API returns 409

4. Checkbox checked → sends `force_cancellation: true`:
   - Wallet goes negative (-800)
   - Students get refunds (PendingRefund created)
   - Future PAYMENT_SHARE entries auto-absorb the -800
   - Withdrawal blocked until balance crosses above zero

---

## 6. Auto-Garnishment (Free)

Future ledger entries with positive `available_delta` automatically reduce the negative balance:

| Event | Wallet Balance |
|-------|---------------|
| Post-cancellation | -800 |
| New section payment share: +200 | -600 |
| Another payment share: +150 | -450 |
| Teacher withdrawal | ❌ Blocked while negative |

No additional logic — falls out of `wallet.balance += available_delta + frozen_delta` in `record()`.

---

## 7. Dashboard Query

Finance Manager view — single query, no new model:

```sql
SELECT
  tw.teacher_id,
  e.full_name AS teacher_name,
  tw.balance AS wallet_balance,
  tw.frozen_balance,
  tw.balance - tw.frozen_balance AS available_balance,
  (SELECT COUNT(*) FROM ledgers l WHERE l.wallet_id = tw.id) AS ledger_entries
FROM teacher_wallets tw
JOIN employees e ON e.id = tw.teacher_id
WHERE tw.balance < 0
ORDER BY tw.balance ASC;
```

---

## 8. Files Touched

| File | Action |
|------|--------|
| `backend/app/modules/lms/ledger_service.py` | **EDIT** — `get_or_create_wallet()` gains `lock` param; `record()` gains row lock + `force` param; `cancel_contract()` gains row lock + `force` param + balance check |
| `backend/app/modules/academic/cancellation_service.py` | **EDIT** — `cancel_section()` accepts `force_cancellation`; preview returns wallet fields; `ImpactPreview` extended |
| `backend/app/modules/lms/financial_service.py` | **EDIT** — `record_expense()` gains row lock on wallet load + withdrawal guard |
| `backend/app/modules/academic/router.py` | **EDIT** — cancel endpoint accepts `force_cancellation` body field; preview returns wallet fields |

---

## 9. Out of Scope

- No new database tables or models
- No changes to `can_cancel_section()` or transaction boundaries (existing transaction scopes are preserved — locks are acquired within them)
- No changes to `cashier_service.py`, deactivation, grade enforcement
- No changes to `SectionCancellation` or `PendingRefund` schemas

---

## 10. Verification

- [ ] Sufficient balance → cancellation proceeds normally (no regression)
- [ ] Insufficient balance + `force=False` → blocked with shortfall error
- [ ] Insufficient balance + `force=True` → wallet goes negative, students refunded
- [ ] Future PAYMENT_SHARE credits auto-reduce negative balance
- [ ] Withdrawal blocked when wallet would go negative
- [ ] Withdrawal blocked when wallet is already negative
- [ ] `record()` invariant `frozen_balance < 0` always enforced
- [ ] `record()` invariant `frozen_balance > balance` relaxed only when `force=True`
- [ ] Preview endpoint returns `teacher_wallet_balance` and `shortfall`
- [ ] All existing cancellation tests still pass
- [ ] `cancel_contract()` uses `with_for_update()` when loading wallet (no TOCTOU)
- [ ] `record()` uses `with_for_update()` when loading wallet (no TOCTOU)
- [ ] `record_expense()` uses `with_for_update()` when loading wallet for withdrawal (no TOCTOU)
- [ ] Concurrent cancellation and withdrawal on same wallet serializes correctly — withdrawal re-reads updated balance
- [ ] `get_or_create_wallet(lock=True)` acquires row lock; newly created wallet is locked on second fetch
