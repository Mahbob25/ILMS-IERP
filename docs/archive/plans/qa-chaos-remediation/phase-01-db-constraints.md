# Phase 1: DB CHECK Constraints + Partial Unique Index

**Owner:** DB Engineer
**Estimate:** 1 day
**Dependencies:** None (this is the first phase — sets Alembic migration head)

## Audit Items Covered

- **D01–D13:** All 13 missing CHECK constraints
- **S21:** Partial unique index on `enrollments (student_id, section_id) WHERE deleted_at IS NULL`

## Tasks

### 1.1 Add 13 CHECK Constraints

Create a single Alembic migration that adds:

| # | Table | SQL |
|---|-------|-----|
| D01 | `payments` | `ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);` |
| D02 | `expenses` | `ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);` |
| D03 | `pending_refunds` | `ALTER TABLE pending_refunds ADD CONSTRAINT pending_refunds_amount_check CHECK (amount > 0);` |
| D04 | `refunds` | `ALTER TABLE refunds ADD CONSTRAINT refunds_amount_check CHECK (amount > 0);` |
| D05 | `teacher_wallets` | `ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_balance_check CHECK (balance >= 0);` |
| D06 | `teacher_wallets` | `ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_frozen_balance_check CHECK (frozen_balance >= 0);` |
| D07 | `teacher_wallets` | `ALTER TABLE teacher_wallets ADD CONSTRAINT teacher_wallets_frozen_lte_balance CHECK (frozen_balance <= balance);` |
| D08 | `ledger_entries` | `ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_delta_check CHECK (available_delta + frozen_delta = total_amount);` |
| D09 | `enrollments` | `ALTER TABLE enrollments ADD CONSTRAINT enrollments_discount_check CHECK (0 <= admin_discount AND admin_discount <= 100);` |
| D10 | `final_grades` | `ALTER TABLE final_grades ADD CONSTRAINT final_grades_score_check CHECK (0 <= final_score AND final_score <= 100);` |
| D11 | `grades` | `ALTER TABLE grades ADD CONSTRAINT grades_score_check CHECK (score >= 0);` |
| D12 | `course_sections` | `ALTER TABLE course_sections ADD CONSTRAINT course_sections_price_check CHECK (price >= 0);` |
| D13 | `section_contracts` | `ALTER TABLE section_contracts ADD CONSTRAINT section_contracts_holdback_check CHECK (0 <= holdback_rate AND holdback_rate <= 1);` |

### 1.2 Add Partial Unique Index

```sql
CREATE UNIQUE INDEX uq_enrollments_active
  ON enrollments (student_id, section_id)
  WHERE deleted_at IS NULL;
```

This ensures S21: a student re-enrolled after being soft-deleted does not conflict with their old enrollment.

### 1.3 Verify Existing Data

Before applying constraints, the migration should:
- Scan each table for rows that would violate the new constraints
- If violations exist, either fix them (update to valid values) or report them for manual resolution
- Use `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT` for large tables to avoid table locks

## Files to CREATE

- Alembic migration file (auto-generated, `revision` becomes the head that Phases 2 and 5 reference)

## Files to EDIT

None. Pure migration.

## Independent Boundary

- Do NOT modify any SQLAlchemy models (the CHECK constraints are DB-level only; models need no changes)
- Do NOT modify any business logic files
- Do NOT create any new tables (only constraints on existing tables)
- Do NOT modify any frontend code
- Do NOT touch `idempotency_keys` (Phase 5 concern)

## Acceptance Criteria

- [ ] All 13 CHECK constraints exist in the database (verify with `\d+ tablename`)
- [ ] Partial unique index `uq_enrollments_active` exists
- [ ] Existing data validated — no constraint violations in production data
- [ ] Migration revision ID documented (needed by Phase 2 and Phase 5 as `down_revision`)
- [ ] Migration can be rolled back (all `ALTER TABLE ... ADD CONSTRAINT` are reversible with `DROP CONSTRAINT`)
