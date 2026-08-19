"""add payment_method and transaction_number to payments

Revision ID: 202607050004
Revises: 202607050003
Create Date: 2026-07-05 00:00:04.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202607050004'
down_revision: Union[str, None] = '202607050003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE paymentmethod AS ENUM ('cash', 'online')")
    op.add_column('payments', sa.Column('payment_method', sa.Enum('cash', 'online', name='paymentmethod'), nullable=False, server_default='cash'))
    op.add_column('payments', sa.Column('transaction_number', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('payments', 'transaction_number')
    op.drop_column('payments', 'payment_method')
    op.execute("DROP TYPE paymentmethod")
