"""db_sequences_phase_2

Revision ID: 202607140000
Revises: 202607130000
Create Date: 2026-07-14 00:00:00.000000

Phase 2 of QA chaos audit remediation.
Audit items: R01-R04, S29.
Creates DB sequences for receipt, voucher, and certificate numbers.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202607140000'
down_revision: Union[str, None] = '202607130000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # Step 1: Create 4 DB sequences for document numbers
    # ============================================================

    # Payment receipts: PAY-YYYYMMDD-NNNNNN
    op.execute("CREATE SEQUENCE IF NOT EXISTS seq_receipt_number START 1 INCREMENT 1")

    # Expense vouchers: EXP-YYYYMMDD-NNNNNN
    op.execute("CREATE SEQUENCE IF NOT EXISTS seq_voucher_number START 1 INCREMENT 1")

    # Refund receipts: RFD-YYYYMMDD-NNNNNN
    op.execute("CREATE SEQUENCE IF NOT EXISTS seq_refund_receipt_number START 1 INCREMENT 1")

    # Certificates: CERT-YYYY-NNNNNN (year-prefixed, resets yearly)
    op.execute("CREATE SEQUENCE IF NOT EXISTS seq_certificate_number START 1 INCREMENT 1")

    # ============================================================
    # Step 2: Create certificate_sequence_tracker table
    # ============================================================

    op.create_table(
        'certificate_sequence_tracker',
        sa.Column('year', sa.String(4), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # ============================================================
    # Step 3: Create next_certificate_number() function
    # ============================================================

    op.execute("""
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
    """)


def downgrade() -> None:
    # Drop function
    op.execute("DROP FUNCTION IF EXISTS next_certificate_number()")

    # Drop tracker table
    op.drop_table('certificate_sequence_tracker')

    # Drop sequences
    op.execute("DROP SEQUENCE IF EXISTS seq_receipt_number")
    op.execute("DROP SEQUENCE IF EXISTS seq_voucher_number")
    op.execute("DROP SEQUENCE IF EXISTS seq_refund_receipt_number")
    op.execute("DROP SEQUENCE IF EXISTS seq_certificate_number")
