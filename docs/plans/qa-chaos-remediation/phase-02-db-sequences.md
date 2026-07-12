# Phase 2: DB Sequences for Receipt, Voucher, and Certificate Numbers

**Owner:** DB Engineer
**Estimate:** 1 day
**Dependencies:** Phase 1 must be merged (migration must use Phase 1's head as `down_revision`)

## Audit Items Covered

- **R01:** Receipt number duplicate on `POST /payments` — replace read-max→increment→write with DB sequence
- **R02:** Voucher number duplicate on `POST /expenses` — same fix
- **R03:** Refund receipt number duplicate on `POST /disburse-refund` — same fix
- **R04:** Certificate number duplicate on section complete — same fix
- **S29:** Certificate number collision at year boundary — year-prefixed sequence

## Tasks

### 2.1 Create DB Sequences

Create four sequences using `CREATE SEQUENCE`:

```sql
-- Payment receipts: PAY-YYYYMMDD-NNNNNN
CREATE SEQUENCE IF NOT EXISTS seq_receipt_number
  START 1 INCREMENT 1;

-- Expense vouchers: EXP-YYYYMMDD-NNNNNN
CREATE SEQUENCE IF NOT EXISTS seq_voucher_number
  START 1 INCREMENT 1;

-- Refund receipts: RFD-YYYYMMDD-NNNNNN
CREATE SEQUENCE IF NOT EXISTS seq_refund_receipt_number
  START 1 INCREMENT 1;

-- Certificates: CERT-YYYY-NNNNNN (year-prefixed, resets yearly)
CREATE SEQUENCE IF NOT EXISTS seq_certificate_number
  START 1 INCREMENT 1;
```

### 2.2 Create Sequence Helper Function

For certificate numbers that reset yearly:

```sql
CREATE OR REPLACE FUNCTION next_certificate_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  current_year TEXT := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  next_val BIGINT;
BEGIN
  -- Restart sequence each year
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

Create the tracker table if needed:

```sql
CREATE TABLE IF NOT EXISTS certificate_sequence_tracker (
  year VARCHAR(4) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 Remove Read-Increment-Write Code

This phase creates the sequences. The actual code to USE the sequences is in Phases 3/4 (they will call `nextval()` via raw SQL or SQLAlchemy `func.nextval()`). Migration only — no code changes in this phase.

## Files to CREATE

- Alembic migration file

## Files to EDIT

None in this phase. Sequence usage is integrated by Phases 3, 4, and 5.

## Independent Boundary

- Do NOT modify any business logic files
- Do NOT modify SQLAlchemy models
- Do NOT modify frontend
- Do NOT create CHECK constraints (Phase 1 concern)
- Do NOT create the `idempotency_keys` table (Phase 5 concern)

## Acceptance Criteria

- [ ] All 4 sequences exist: `seq_receipt_number`, `seq_voucher_number`, `seq_refund_receipt_number`, `seq_certificate_number`
- [ ] `certificate_sequence_tracker` table exists
- [ ] `next_certificate_number()` function exists and returns `CERT-2026-XXXXXX` format
- [ ] Migration depends on Phase 1's head revision
- [ ] Migration is rollbackable (drops sequences if reversed)
