"""unenrollment_and_refund_support

Revision ID: 202607120000
Revises: 202607110000
Create Date: 2026-07-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '202607120000'
down_revision: Union[str, None] = '202607110000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === 1. Create unenrollment_refund_policy enum ===
    op.execute("CREATE TYPE unenrollment_refund_policy AS ENUM ('authorize_refund', 'no_refund')")

    # === 2. Create unenrollment_records table ===
    op.create_table('unenrollment_records',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('enrollment_id', sa.UUID(), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('unenrolled_by', sa.UUID(), nullable=False),
        sa.Column('unenrolled_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('refund_policy', postgresql.ENUM('authorize_refund', 'no_refund', name='unenrollment_refund_policy', create_type=False), nullable=False),
        sa.Column('total_paid', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('teacher_share_reversed', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('refund_authorized_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('has_attendance_records', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('has_grades', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['enrollment_id'], ['enrollments.id'], name=op.f('fk_unenrollment_records_enrollment_id_enrollments'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], name=op.f('fk_unenrollment_records_section_id_course_sections'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_unenrollment_records_student_id_students'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['unenrolled_by'], ['users.id'], name=op.f('fk_unenrollment_records_unenrolled_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_unenrollment_records'))
    )
    op.create_index(op.f('ix_unenrollment_records_enrollment_id'), 'unenrollment_records', ['enrollment_id'], unique=False)
    op.create_index(op.f('ix_unenrollment_records_section_id'), 'unenrollment_records', ['section_id'], unique=False)
    op.create_index(op.f('ix_unenrollment_records_student_id'), 'unenrollment_records', ['student_id'], unique=False)

    # === 3. Create unenrollment_overrides table ===
    op.create_table('unenrollment_overrides',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('unenrollment_record_id', sa.UUID(), nullable=False),
        sa.Column('overridden_by', sa.UUID(), nullable=False),
        sa.Column('overridden_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('override_type', sa.String(length=50), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('teacher_wallet_balance_before', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('reversal_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['unenrollment_record_id'], ['unenrollment_records.id'], name=op.f('fk_unenrollment_overrides_unenrollment_record_id_unenrollment_records'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['overridden_by'], ['users.id'], name=op.f('fk_unenrollment_overrides_overridden_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_unenrollment_overrides'))
    )
    op.create_index(op.f('ix_unenrollment_overrides_unenrollment_record_id'), 'unenrollment_overrides', ['unenrollment_record_id'], unique=False)

    # === 4. Modify pending_refunds table ===
    # Add source column
    op.add_column('pending_refunds', sa.Column('source', sa.String(length=20), server_default='cancellation', nullable=False))
    # Add unenrollment_record_id FK (nullable)
    op.add_column('pending_refunds', sa.Column('unenrollment_record_id', sa.UUID(), nullable=True))
    op.create_foreign_key(op.f('fk_pending_refunds_unenrollment_record_id_unenrollment_records'), 'pending_refunds', 'unenrollment_records', ['unenrollment_record_id'], ['id'], ondelete='RESTRICT')
    op.create_index(op.f('ix_pending_refunds_unenrollment_record_id'), 'pending_refunds', ['unenrollment_record_id'], unique=False)
    # Make section_cancellation_id nullable for unenrollment-origin refunds
    op.alter_column('pending_refunds', 'section_cancellation_id', nullable=True)

    # === 5. Drop unique constraint on enrollments and create partial unique index ===
    op.drop_constraint('uq_enrollments_student_section', 'enrollments', type_='unique')
    op.create_index('uq_active_enrollment', 'enrollments', ['student_id', 'section_id'],
                    unique=True, postgresql_where=sa.text('deleted_at IS NULL'))


def downgrade() -> None:
    # === 1. Drop partial unique index, restore constraint ===
    op.drop_index('uq_active_enrollment', table_name='enrollments')
    op.create_unique_constraint('uq_enrollments_student_section', 'enrollments', ['student_id', 'section_id'])

    # === 2. Revert pending_refunds changes ===
    op.drop_index(op.f('ix_pending_refunds_unenrollment_record_id'), table_name='pending_refunds')
    op.drop_constraint(op.f('fk_pending_refunds_unenrollment_record_id_unenrollment_records'), 'pending_refunds', type_='foreignkey')
    op.drop_column('pending_refunds', 'unenrollment_record_id')
    op.drop_column('pending_refunds', 'source')
    op.alter_column('pending_refunds', 'section_cancellation_id', nullable=False)

    # === 3. Drop tables ===
    op.drop_table('unenrollment_overrides')
    op.drop_table('unenrollment_records')

    # === 4. Drop enum ===
    op.execute("DROP TYPE unenrollment_refund_policy")
