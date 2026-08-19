"""add salary_draw to expensetype enum + partial index

Revision ID: 202607200000
Revises: 202607190000
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202607200000"
down_revision: Union[str, None] = "202607190000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE expensetype ADD VALUE 'salary_draw'")
    op.execute("COMMIT")
    op.create_index(
        "ix_expenses_salary_draw_month",
        "expenses",
        ["recipient_id", "date", "type"],
        postgresql_where=sa.text("type = 'salary_draw'"),
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_salary_draw_month", table_name="expenses")
    op.execute("ALTER TYPE expensetype RENAME TO expensetype_old")
    op.execute("""CREATE TYPE expensetype AS ENUM (
        'general_expense', 'teacher_withdrawal',
        'secretary_advance', 'salary_payment'
    )""")
    op.execute("""ALTER TABLE expenses ALTER COLUMN type
        TYPE expensetype USING type::text::expensetype
        WHERE type IN ('general_expense', 'teacher_withdrawal',
                       'secretary_advance', 'salary_payment')
    """)
    op.execute("DROP TYPE expensetype_old")
