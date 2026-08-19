"""fix column types: Float→Numeric, DateTime→timestamptz

Revision ID: 202607050001
Revises: 202607050000
Create Date: 2026-07-05 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202607050001'
down_revision: Union[str, None] = '202607050000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── identity schema ──
    # employees.salary: Float → Numeric(12,2)
    op.alter_column('employees', 'salary',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='salary::numeric(12,2)')
    # employees.created_at: DateTime → timestamptz
    op.alter_column('employees', 'created_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="created_at AT TIME ZONE 'UTC'")
    # employees.updated_at: DateTime → timestamptz
    op.alter_column('employees', 'updated_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="updated_at AT TIME ZONE 'UTC'")

    # audit_logs.timestamp: DateTime → timestamptz
    op.alter_column('audit_logs', 'timestamp',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="timestamp AT TIME ZONE 'UTC'")

    # refresh_tokens.expires_at: DateTime → timestamptz
    op.alter_column('refresh_tokens', 'expires_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="expires_at AT TIME ZONE 'UTC'")

    # ── academic schema ──
    # course_sections.teacher_percentage: Float → Numeric(5,2)
    op.alter_column('course_sections', 'teacher_percentage',
                    type_=sa.Numeric(5, 2),
                    postgresql_using='teacher_percentage::numeric(5,2)')
    # course_sections.price: Float → Numeric(12,2)
    op.alter_column('course_sections', 'price',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='price::numeric(12,2)')

    # enrollments.enrolled_at: DateTime → timestamptz
    op.alter_column('enrollments', 'enrolled_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="enrolled_at AT TIME ZONE 'UTC'")
    # enrollments.agreed_price: Float → Numeric(12,2)
    op.alter_column('enrollments', 'agreed_price',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='agreed_price::numeric(12,2)')
    # enrollments.admin_discount: Float → Numeric(5,2)
    op.alter_column('enrollments', 'admin_discount',
                    type_=sa.Numeric(5, 2),
                    postgresql_using='admin_discount::numeric(5,2)')

    # ── lms schema ──
    # payments.amount: Float → Numeric(12,2)
    op.alter_column('payments', 'amount',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='amount::numeric(12,2)')

    # expenses.amount: Float → Numeric(12,2)
    op.alter_column('expenses', 'amount',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='amount::numeric(12,2)')

    # teacher_wallets.balance: Float → Numeric(12,2)
    op.alter_column('teacher_wallets', 'balance',
                    type_=sa.Numeric(12, 2),
                    postgresql_using='balance::numeric(12,2)')
    # teacher_wallets.last_updated: DateTime → timestamptz
    op.alter_column('teacher_wallets', 'last_updated',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="last_updated AT TIME ZONE 'UTC'")

    # grades.score: Float → Numeric(5,2)
    op.alter_column('grades', 'score',
                    type_=sa.Numeric(5, 2),
                    postgresql_using='score::numeric(5,2)')
    # grades.graded_at: DateTime → timestamptz
    op.alter_column('grades', 'graded_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="graded_at AT TIME ZONE 'UTC'")

    # attendance_sessions.created_at: DateTime → timestamptz
    op.alter_column('attendance_sessions', 'created_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="created_at AT TIME ZONE 'UTC'")

    # assignments.created_at: DateTime → timestamptz
    op.alter_column('assignments', 'created_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="created_at AT TIME ZONE 'UTC'")
    # assignments.due_date: DateTime → timestamptz
    op.alter_column('assignments', 'due_date',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="due_date AT TIME ZONE 'UTC'")

    # submissions.submitted_at: DateTime → timestamptz
    op.alter_column('submissions', 'submitted_at',
                    type_=sa.DateTime(timezone=True),
                    postgresql_using="submitted_at AT TIME ZONE 'UTC'")


def downgrade() -> None:
    # ── identity schema ──
    op.alter_column('employees', 'salary', type_=sa.Float())
    op.alter_column('employees', 'created_at', type_=sa.DateTime())
    op.alter_column('employees', 'updated_at', type_=sa.DateTime())
    op.alter_column('audit_logs', 'timestamp', type_=sa.DateTime())
    op.alter_column('refresh_tokens', 'expires_at', type_=sa.DateTime())

    # ── academic schema ──
    op.alter_column('course_sections', 'teacher_percentage', type_=sa.Float())
    op.alter_column('course_sections', 'price', type_=sa.Float())
    op.alter_column('enrollments', 'enrolled_at', type_=sa.DateTime())
    op.alter_column('enrollments', 'agreed_price', type_=sa.Float())
    op.alter_column('enrollments', 'admin_discount', type_=sa.Float())

    # ── lms schema ──
    op.alter_column('payments', 'amount', type_=sa.Float())
    op.alter_column('expenses', 'amount', type_=sa.Float())
    op.alter_column('teacher_wallets', 'balance', type_=sa.Float())
    op.alter_column('teacher_wallets', 'last_updated', type_=sa.DateTime())
    op.alter_column('grades', 'score', type_=sa.Float())
    op.alter_column('grades', 'graded_at', type_=sa.DateTime())
    op.alter_column('attendance_sessions', 'created_at', type_=sa.DateTime())
    op.alter_column('assignments', 'created_at', type_=sa.DateTime())
    op.alter_column('assignments', 'due_date', type_=sa.DateTime())
    op.alter_column('submissions', 'submitted_at', type_=sa.DateTime())
