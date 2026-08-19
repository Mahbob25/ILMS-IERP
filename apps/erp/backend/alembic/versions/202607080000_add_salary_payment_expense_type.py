"""add salary_payment to expensetype enum

Revision ID: 202607080000
Revises: e37ad410e0e2
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '202607080000'
down_revision: Union[str, None] = 'e37ad410e0e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE expensetype ADD VALUE 'salary_payment'")


def downgrade() -> None:
    op.execute("ALTER TYPE expensetype RENAME TO expensetype_old")
    op.execute("CREATE TYPE expensetype AS ENUM ('general_expense', 'teacher_withdrawal', 'secretary_advance')")
    op.execute("ALTER TABLE expenses ALTER COLUMN type TYPE expensetype USING type::text::expensetype")
    op.execute("DROP TYPE expensetype_old")
