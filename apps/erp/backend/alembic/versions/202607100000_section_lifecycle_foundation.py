"""section_lifecycle_foundation

Revision ID: 202607100000
Revises: 202607080000
Create Date: 2026-07-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202607100000'
down_revision: Union[str, None] = '202607080000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === 1. Enum additions ===

    op.execute("ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'ready_for_completion'")
    op.execute("ALTER TYPE coursestatus ADD VALUE IF NOT EXISTS 'cancelled'")

    op.execute("ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'deactivation_reversal'")
    op.execute("ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'refund_disbursement'")

    # === 2. Create pending_refund_status enum ===
    op.execute("CREATE TYPE pending_refund_status AS ENUM ('UNCLAIMED', 'CLAIMED', 'FORFEITED')")

    # === 3. Add columns to course_sections ===
    op.add_column('course_sections', sa.Column('flags', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False))
    op.add_column('course_sections', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('course_sections', sa.Column('cancelled_by', sa.UUID(), nullable=True))
    op.add_column('course_sections', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    op.create_index(op.f('ix_course_sections_cancelled_by'), 'course_sections', ['cancelled_by'], unique=False)
    op.create_foreign_key(op.f('fk_course_sections_cancelled_by_users'), 'course_sections', 'users', ['cancelled_by'], ['id'], ondelete='RESTRICT')

    # === 4. Create section_cancellations ===
    op.create_table('section_cancellations',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('cancelled_by', sa.UUID(), nullable=False),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('refund_policy', sa.String(length=20), nullable=False),
        sa.Column('teacher_wallet_reversal_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('total_payments_collected', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('total_refund_authorized', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('enrolled_student_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('has_attendance_records', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('has_final_grades', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('has_certificates', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], name=op.f('fk_section_cancellations_section_id_course_sections'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], name=op.f('fk_section_cancellations_cancelled_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_section_cancellations'))
    )
    op.create_index(op.f('ix_section_cancellations_section_id'), 'section_cancellations', ['section_id'], unique=False)

    # === 5. Create pending_refunds ===
    op.create_table('pending_refunds',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('enrollment_id', sa.UUID(), nullable=False),
        sa.Column('section_cancellation_id', sa.UUID(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('status', postgresql.ENUM('UNCLAIMED', 'CLAIMED', 'FORFEITED', name='pending_refund_status', create_type=False), nullable=False, server_default='UNCLAIMED'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['enrollment_id'], ['enrollments.id'], name=op.f('fk_pending_refunds_enrollment_id_enrollments'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['section_cancellation_id'], ['section_cancellations.id'], name=op.f('fk_pending_refunds_section_cancellation_id_section_cancellations'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_pending_refunds'))
    )
    op.create_index(op.f('ix_pending_refunds_enrollment_id'), 'pending_refunds', ['enrollment_id'], unique=False)
    op.create_index(op.f('ix_pending_refunds_section_cancellation_id'), 'pending_refunds', ['section_cancellation_id'], unique=False)

    # === 6. Create refunds ===
    op.create_table('refunds',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('pending_refund_id', sa.UUID(), nullable=False),
        sa.Column('receipt_number', sa.String(length=50), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('disbursed_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('disbursed_by', sa.UUID(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['pending_refund_id'], ['pending_refunds.id'], name=op.f('fk_refunds_pending_refund_id_pending_refunds'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['disbursed_by'], ['users.id'], name=op.f('fk_refunds_disbursed_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_refunds')),
        sa.UniqueConstraint('pending_refund_id', name=op.f('uq_refunds_pending_refund_id'))
    )
    op.create_index(op.f('ix_refunds_receipt_number'), 'refunds', ['receipt_number'], unique=True)

    # === 7. Create daily_jobs_log ===
    op.create_table('daily_jobs_log',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('job_name', sa.String(length=100), nullable=False),
        sa.Column('last_run_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_daily_jobs_log')),
        sa.UniqueConstraint('job_name', 'last_run_date', name=op.f('uq_daily_jobs_log_job_name_last_run_date'))
    )

    # === 8. Create section_completion_overrides ===
    op.create_table('section_completion_overrides',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('overridden_by', sa.UUID(), nullable=False),
        sa.Column('overridden_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('bypass_grade_check', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('bypass_payment_check', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('ungraded_students', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('unpaid_students', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], name=op.f('fk_section_completion_overrides_section_id_course_sections'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['overridden_by'], ['users.id'], name=op.f('fk_section_completion_overrides_overridden_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_section_completion_overrides'))
    )
    op.create_index(op.f('ix_section_completion_overrides_section_id'), 'section_completion_overrides', ['section_id'], unique=False)

    # === 9. Create section_lifecycle_config ===
    op.create_table('section_lifecycle_config',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_section_lifecycle_config')),
        sa.UniqueConstraint('key', name=op.f('uq_section_lifecycle_config_key'))
    )

    # === 10. Seed config data ===
    op.execute("""
        INSERT INTO section_lifecycle_config (key, value, description) VALUES
        ('overdue_warning_days_before', '7', 'Days before end_date to start showing warnings'),
        ('payment_due_before_end_days', '14', 'Days before end date that payment is considered due'),
        ('block_completion_if_unpaid', 'true', 'Whether to block completion if students have balances'),
        ('block_completion_if_ungraded', 'true', 'Whether to block completion if grades are missing')
    """)


def downgrade() -> None:
    # === 1. Drop tables in reverse order ===
    op.drop_table('section_lifecycle_config')
    op.drop_table('section_completion_overrides')
    op.drop_table('daily_jobs_log')
    op.drop_table('refunds')
    op.drop_table('pending_refunds')
    op.drop_table('section_cancellations')

    # === 2. Remove columns from course_sections ===
    op.drop_constraint(op.f('fk_course_sections_cancelled_by_users'), 'course_sections', type_='foreignkey')
    op.drop_index(op.f('ix_course_sections_cancelled_by'), table_name='course_sections')
    op.drop_column('course_sections', 'cancellation_reason')
    op.drop_column('course_sections', 'cancelled_by')
    op.drop_column('course_sections', 'cancelled_at')
    op.drop_column('course_sections', 'flags')

    # === 3. Drop pending_refund_status enum ===
    op.execute("DROP TYPE pending_refund_status")

    # === 4. Revert ledgerentrytype enum ===
    op.execute("ALTER TYPE ledgerentrytype RENAME TO ledgerentrytype_old")
    op.execute("CREATE TYPE ledgerentrytype AS ENUM ('activation_credit', 'payment_share', 'grade_unfreeze', 'amendment_adjustment', 'reversal', 'withdrawal')")
    op.execute("ALTER TABLE ledger_entries ALTER COLUMN type TYPE ledgerentrytype USING type::text::ledgerentrytype")
    op.execute("DROP TYPE ledgerentrytype_old")

    # === 5. Revert coursestatus enum ===
    op.execute("ALTER TYPE coursestatus RENAME TO coursestatus_old")
    op.execute("CREATE TYPE coursestatus AS ENUM ('pending', 'active', 'completed')")
    op.execute("ALTER TABLE course_sections ALTER COLUMN status TYPE coursestatus USING status::text::coursestatus")
    op.execute("DROP TYPE coursestatus_old")
