"""v1.7 ERP schema: stateful courses, payments, expenses, wallets, daily closures

Revision ID: 202606260000
Revises: 202606250000
Create Date: 2026-06-26 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202606260000'
down_revision: Union[str, None] = '202606250000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create ENUM types
    op.execute("CREATE TYPE coursestatus AS ENUM ('pending', 'active', 'completed')")
    op.execute("CREATE TYPE expensetype AS ENUM ('general_expense', 'teacher_withdrawal', 'secretary_advance')")
    op.execute("CREATE TYPE closurystatus AS ENUM ('closed', 'pending', 'unlock_requested')")

    # 2. courses — add status, teacher_percentage, min_students_required
    op.add_column('courses', sa.Column('status',
        postgresql.ENUM(name='coursestatus', create_type=False),
        nullable=False, server_default='pending'))
    op.add_column('courses', sa.Column('teacher_percentage', sa.Float(), nullable=True))
    op.add_column('courses', sa.Column('min_students_required', sa.Integer(), nullable=True))

    # 3. enrollments — add agreed_price, admin_discount
    op.add_column('enrollments', sa.Column('agreed_price', sa.Float(), nullable=True))
    op.add_column('enrollments', sa.Column('admin_discount', sa.Float(), nullable=True))

    # 4. course_sections — drop term_id FK and column
    #    (IF EXISTS: on databases created before this migration chain was
    #    re-written, the FK/column may already be absent — must stay idempotent)
    op.execute("ALTER TABLE course_sections DROP CONSTRAINT IF EXISTS course_sections_term_id_fkey")
    op.execute("ALTER TABLE course_sections DROP COLUMN IF EXISTS term_id")

    # 5. Drop terms table
    op.execute("DROP TABLE IF EXISTS terms")

    # 6. Create payments table
    op.create_table(
        'payments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('course_id', sa.UUID(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('receipt_number', sa.String(50), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('receipt_number')
    )
    op.create_index(op.f('ix_payments_receipt_number'), 'payments', ['receipt_number'], unique=True)

    # 7. Create expenses table
    op.create_table(
        'expenses',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('recipient_name', sa.String(255), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('receipt_number', sa.String(50), nullable=False),
        sa.Column('type',
            postgresql.ENUM(name='expensetype', create_type=False),
            nullable=False, server_default='general_expense'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('receipt_number')
    )
    op.create_index(op.f('ix_expenses_receipt_number'), 'expenses', ['receipt_number'], unique=True)

    # 8. Create teacher_wallets table
    op.create_table(
        'teacher_wallets',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('teacher_id', sa.UUID(), nullable=False),
        sa.Column('balance', sa.Float(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_updated', sa.DateTime(),
                  server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['teacher_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('teacher_id')
    )

    # 9. Create daily_closures table
    op.create_table(
        'daily_closures',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status',
            postgresql.ENUM(name='closurystatus', create_type=False),
            nullable=False, server_default='pending'),
        sa.Column('closed_by_manager_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['closed_by_manager_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('date')
    )


def downgrade() -> None:
    # Drop new tables in reverse order
    op.drop_table('daily_closures')
    op.drop_table('teacher_wallets')
    op.drop_table('expenses')
    op.drop_table('payments')

    # Recreate terms table
    op.create_table(
        'terms',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_terms_code'), 'terms', ['code'], unique=True)

    # Restore term_id in course_sections
    op.add_column('course_sections',
        sa.Column('term_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'course_sections_term_id_fkey', 'course_sections', 'terms',
        ['term_id'], ['id'], ondelete='CASCADE')

    # Drop new columns from enrollments
    op.drop_column('enrollments', 'admin_discount')
    op.drop_column('enrollments', 'agreed_price')

    # Drop new columns from courses
    op.drop_column('courses', 'min_students_required')
    op.drop_column('courses', 'teacher_percentage')
    op.drop_column('courses', 'status')

    # Drop ENUM types (after all referencing columns are gone)
    op.execute("DROP TYPE IF EXISTS closurystatus")
    op.execute("DROP TYPE IF EXISTS expensetype")
    op.execute("DROP TYPE IF EXISTS coursestatus")
