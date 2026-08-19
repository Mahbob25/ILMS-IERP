"""add created_by to payments and expenses

Revision ID: 202607070001
Revises: 202607070000
Create Date: 2026-07-07 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision: str = '202607070001'
down_revision: Union[str, None] = '202607070000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payments', sa.Column('created_by', PG_UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True))
    op.add_column('expenses', sa.Column('created_by', PG_UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True))


def downgrade() -> None:
    op.drop_column('payments', 'created_by')
    op.drop_column('expenses', 'created_by')
