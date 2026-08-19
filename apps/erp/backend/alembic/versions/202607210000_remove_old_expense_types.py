"""remove secretary_advance and salary_payment from expensetype enum

Revision ID: 202607210000
Revises: 202607200000
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202607210000"
down_revision: Union[str, None] = "202607200000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE expenses SET type = 'salary_draw'
        WHERE type IN ('secretary_advance', 'salary_payment')
    """)
    op.drop_index("ix_expenses_salary_draw_month", table_name="expenses", if_exists=True)
    op.execute("ALTER TABLE expenses ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TYPE expensetype RENAME TO expensetype_old")
    op.execute("""
        CREATE TYPE expensetype AS ENUM (
            'general_expense', 'teacher_withdrawal', 'salary_draw'
        )
    """)
    op.execute("""
        ALTER TABLE expenses ALTER COLUMN type
        TYPE expensetype USING type::text::expensetype
    """)
    op.execute("ALTER TABLE expenses ALTER COLUMN type SET DEFAULT 'general_expense'")
    op.create_index(
        "ix_expenses_salary_draw_month",
        "expenses",
        ["recipient_id", "date", "type"],
        postgresql_where=sa.text("type = 'salary_draw'"),
    )
    op.execute("DROP TYPE expensetype_old")


def downgrade() -> None:
    op.drop_index("ix_expenses_salary_draw_month", table_name="expenses", if_exists=True)
    op.execute("ALTER TABLE expenses ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TYPE expensetype RENAME TO expensetype_old")
    op.execute("""
        CREATE TYPE expensetype AS ENUM (
            'general_expense', 'teacher_withdrawal',
            'secretary_advance', 'salary_payment', 'salary_draw'
        )
    """)
    op.execute("""
        ALTER TABLE expenses ALTER COLUMN type
        TYPE expensetype USING type::text::expensetype
    """)
    op.execute("ALTER TABLE expenses ALTER COLUMN type SET DEFAULT 'general_expense'")
    op.create_index(
        "ix_expenses_salary_draw_month",
        "expenses",
        ["recipient_id", "date", "type"],
        postgresql_where=sa.text("type = 'salary_draw'"),
    )
    op.execute("DROP TYPE expensetype_old")
