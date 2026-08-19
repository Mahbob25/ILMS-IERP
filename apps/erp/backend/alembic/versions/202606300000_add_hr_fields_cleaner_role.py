"""add HR fields to users, add cleaner role

Revision ID: 202606300000
Revises: 37f74eb2b954
Create Date: 2026-06-30 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202606300000'
down_revision: Union[str, None] = '37f74eb2b954'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add HR fields to users table
    op.add_column('users', sa.Column('phone_number', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('salary', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('hire_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('contract_end_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('address', sa.Text(), nullable=True))

    # 2. Insert cleaner role if it doesn't exist (idempotent)
    result = conn.execute(
        sa.text("SELECT id FROM roles WHERE name = 'cleaner'")
    )
    if result.fetchone() is None:
        conn.execute(
            sa.text("INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'cleaner')")
        )


def downgrade() -> None:
    op.drop_column('users', 'address')
    op.drop_column('users', 'contract_end_date')
    op.drop_column('users', 'hire_date')
    op.drop_column('users', 'salary')
    op.drop_column('users', 'phone_number')

    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM roles WHERE name = 'cleaner'")
    )
