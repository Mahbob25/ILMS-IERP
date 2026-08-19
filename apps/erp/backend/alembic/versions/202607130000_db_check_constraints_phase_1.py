"""add_db_check_constraints_phase_1

Revision ID: 202607130000
Revises: 202607120000
Create Date: 2026-07-13 00:00:00.000000

Phase 1 of QA chaos audit remediation.
Audit items: D01-D13 (CHECK constraints), S21 (partial unique index).

NOTE: Migration 202607120000 previously created a partial unique index
uq_active_enrollment on enrollments(student_id, section_id) WHERE deleted_at IS NULL.
This migration renames it to uq_enrollments_active to match the Phase 1 plan spec.
All 13 CHECK constraints (D01-D13) are new.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '202607130000'
down_revision: Union[str, None] = '202607120000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # Step 0: Fix existing data that would violate new constraints
    # ============================================================

    # D01: payments.amount > 0
    op.execute("UPDATE payments SET amount = 0.01 WHERE amount IS NOT NULL AND amount <= 0")

    # D02: expenses.amount > 0
    op.execute("UPDATE expenses SET amount = 0.01 WHERE amount IS NOT NULL AND amount <= 0")

    # D03: pending_refunds.amount > 0
    op.execute("UPDATE pending_refunds SET amount = 0.01 WHERE amount IS NOT NULL AND amount <= 0")

    # D04: refunds.amount > 0
    op.execute("UPDATE refunds SET amount = 0.01 WHERE amount IS NOT NULL AND amount <= 0")

    # D05: teacher_wallets.balance >= 0
    op.execute("UPDATE teacher_wallets SET balance = 0 WHERE balance IS NOT NULL AND balance < 0")

    # D06: teacher_wallets.frozen_balance >= 0
    op.execute("UPDATE teacher_wallets SET frozen_balance = 0 WHERE frozen_balance IS NOT NULL AND frozen_balance < 0")

    # D07: teacher_wallets.frozen_balance <= balance
    op.execute("UPDATE teacher_wallets SET frozen_balance = balance WHERE frozen_balance > balance")

    # D08: ledger_entries: available_delta + frozen_delta = total_amount
    # Existing business logic (ledger_service.py) sets total_amount as a positive
    # absolute value for reversals, withdrawals, and deactivation_reversals,
    # while deltas carry the correct sign. For grade_unfreeze, total_amount
    # is set to the gross frozen amount but the deltas sum to zero (transfer).
    # Fix existing data to make total_amount = available_delta + frozen_delta.
    op.execute("""
        UPDATE ledger_entries
        SET total_amount = available_delta + frozen_delta
        WHERE available_delta + frozen_delta != total_amount
    """)

    # D09: enrollments.admin_discount: 0 <= admin_discount <= 100
    op.execute("""
        UPDATE enrollments
        SET admin_discount = GREATEST(0, LEAST(100, admin_discount))
        WHERE admin_discount IS NOT NULL
        AND (admin_discount < 0 OR admin_discount > 100)
    """)

    # D10: final_grades.final_score: 0 <= final_score <= 100
    op.execute("""
        UPDATE final_grades
        SET final_score = GREATEST(0, LEAST(100, final_score))
        WHERE final_score < 0 OR final_score > 100
    """)

    # D11: grades.score >= 0
    op.execute("UPDATE grades SET score = 0 WHERE score IS NOT NULL AND score < 0")

    # D12: course_sections.price >= 0
    op.execute("UPDATE course_sections SET price = 0 WHERE price IS NOT NULL AND price < 0")

    # D13: section_contracts.holdback_rate: 0 <= holdback_rate <= 1
    op.execute("""
        UPDATE section_contracts
        SET holdback_rate = GREATEST(0, LEAST(1, holdback_rate))
        WHERE holdback_rate < 0 OR holdback_rate > 1
    """)

    # ============================================================
    # Step 1: Add 13 CHECK constraints (NOT VALID to avoid table lock)
    # ============================================================

    # D01
    op.execute(
        "ALTER TABLE payments "
        "ADD CONSTRAINT payments_amount_check CHECK (amount > 0) NOT VALID"
    )

    # D02
    op.execute(
        "ALTER TABLE expenses "
        "ADD CONSTRAINT expenses_amount_check CHECK (amount > 0) NOT VALID"
    )

    # D03
    op.execute(
        "ALTER TABLE pending_refunds "
        "ADD CONSTRAINT pending_refunds_amount_check CHECK (amount > 0) NOT VALID"
    )

    # D04
    op.execute(
        "ALTER TABLE refunds "
        "ADD CONSTRAINT refunds_amount_check CHECK (amount > 0) NOT VALID"
    )

    # D05
    op.execute(
        "ALTER TABLE teacher_wallets "
        "ADD CONSTRAINT teacher_wallets_balance_check CHECK (balance >= 0) NOT VALID"
    )

    # D06
    op.execute(
        "ALTER TABLE teacher_wallets "
        "ADD CONSTRAINT teacher_wallets_frozen_balance_check "
        "CHECK (frozen_balance >= 0) NOT VALID"
    )

    # D07
    op.execute(
        "ALTER TABLE teacher_wallets "
        "ADD CONSTRAINT teacher_wallets_frozen_lte_balance "
        "CHECK (frozen_balance <= balance) NOT VALID"
    )

    # D08
    op.execute(
        "ALTER TABLE ledger_entries "
        "ADD CONSTRAINT ledger_entries_delta_check "
        "CHECK (available_delta + frozen_delta = total_amount) NOT VALID"
    )

    # D09
    op.execute(
        "ALTER TABLE enrollments "
        "ADD CONSTRAINT enrollments_discount_check "
        "CHECK (0 <= admin_discount AND admin_discount <= 100) NOT VALID"
    )

    # D10
    op.execute(
        "ALTER TABLE final_grades "
        "ADD CONSTRAINT final_grades_score_check "
        "CHECK (0 <= final_score AND final_score <= 100) NOT VALID"
    )

    # D11
    op.execute(
        "ALTER TABLE grades "
        "ADD CONSTRAINT grades_score_check CHECK (score >= 0) NOT VALID"
    )

    # D12
    op.execute(
        "ALTER TABLE course_sections "
        "ADD CONSTRAINT course_sections_price_check CHECK (price >= 0) NOT VALID"
    )

    # D13
    op.execute(
        "ALTER TABLE section_contracts "
        "ADD CONSTRAINT section_contracts_holdback_check "
        "CHECK (0 <= holdback_rate AND holdback_rate <= 1) NOT VALID"
    )

    # ============================================================
    # Step 2: VALIDATE CONSTRAINT (full table scan, shared lock only)
    # ============================================================

    op.execute("ALTER TABLE payments VALIDATE CONSTRAINT payments_amount_check")
    op.execute("ALTER TABLE expenses VALIDATE CONSTRAINT expenses_amount_check")
    op.execute("ALTER TABLE pending_refunds VALIDATE CONSTRAINT pending_refunds_amount_check")
    op.execute("ALTER TABLE refunds VALIDATE CONSTRAINT refunds_amount_check")
    op.execute("ALTER TABLE teacher_wallets VALIDATE CONSTRAINT teacher_wallets_balance_check")
    op.execute("ALTER TABLE teacher_wallets VALIDATE CONSTRAINT teacher_wallets_frozen_balance_check")
    op.execute("ALTER TABLE teacher_wallets VALIDATE CONSTRAINT teacher_wallets_frozen_lte_balance")
    op.execute("ALTER TABLE ledger_entries VALIDATE CONSTRAINT ledger_entries_delta_check")
    op.execute("ALTER TABLE enrollments VALIDATE CONSTRAINT enrollments_discount_check")
    op.execute("ALTER TABLE final_grades VALIDATE CONSTRAINT final_grades_score_check")
    op.execute("ALTER TABLE grades VALIDATE CONSTRAINT grades_score_check")
    op.execute("ALTER TABLE course_sections VALIDATE CONSTRAINT course_sections_price_check")
    op.execute("ALTER TABLE section_contracts VALIDATE CONSTRAINT section_contracts_holdback_check")

    # ============================================================
    # Step 3: S21 — Partial unique index for soft-deleted enrollments
    # ============================================================
    # Migration 202607120000 created uq_active_enrollment.
    # This step renames it to uq_enrollments_active per plan spec.
    op.execute("DROP INDEX IF EXISTS uq_active_enrollment")
    op.create_index(
        'uq_enrollments_active',
        'enrollments',
        ['student_id', 'section_id'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    # Drop all 13 CHECK constraints
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check")
    op.execute("ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_check")
    op.execute("ALTER TABLE pending_refunds DROP CONSTRAINT IF EXISTS pending_refunds_amount_check")
    op.execute("ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_amount_check")
    op.execute("ALTER TABLE teacher_wallets DROP CONSTRAINT IF EXISTS teacher_wallets_balance_check")
    op.execute("ALTER TABLE teacher_wallets DROP CONSTRAINT IF EXISTS teacher_wallets_frozen_balance_check")
    op.execute("ALTER TABLE teacher_wallets DROP CONSTRAINT IF EXISTS teacher_wallets_frozen_lte_balance")
    op.execute("ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_delta_check")
    op.execute("ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_discount_check")
    op.execute("ALTER TABLE final_grades DROP CONSTRAINT IF EXISTS final_grades_score_check")
    op.execute("ALTER TABLE grades DROP CONSTRAINT IF EXISTS grades_score_check")
    op.execute("ALTER TABLE course_sections DROP CONSTRAINT IF EXISTS course_sections_price_check")
    op.execute("ALTER TABLE section_contracts DROP CONSTRAINT IF EXISTS section_contracts_holdback_check")

    # Restore the partial unique index to its original name from 202607120000
    op.drop_index('uq_enrollments_active', table_name='enrollments')
    op.create_index(
        'uq_active_enrollment',
        'enrollments',
        ['student_id', 'section_id'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
