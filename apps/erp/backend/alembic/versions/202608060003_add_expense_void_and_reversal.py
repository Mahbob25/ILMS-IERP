"""add expense void columns + withdrawal_reversal ledger entry type

Revision ID: 202608060003
Revises: 202608060002
Create Date: 2026-08-06 00:00:03.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "202608060003"
down_revision: Union[str, None] = "202608060002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("expenses", sa.Column("voided_by", sa.dialects.postgresql.UUID(), nullable=True))
    op.add_column("expenses", sa.Column("void_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_expenses_voided_by_users",
        "expenses", "users",
        ["voided_by"], ["id"],
        ondelete="RESTRICT",
    )

    op.execute("ALTER TYPE ledgerentrytype ADD VALUE IF NOT EXISTS 'withdrawal_reversal'")


def downgrade() -> None:
    op.drop_constraint("fk_expenses_voided_by_users", "expenses", type_="foreignkey")
    op.drop_column("expenses", "void_reason")
    op.drop_column("expenses", "voided_by")
    op.drop_column("expenses", "voided_at")
