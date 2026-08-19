"""add index on refresh_tokens.expires_at

Revision ID: 202607050002
Revises: 202607050001
Create Date: 2026-07-05 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '202607050002'
down_revision: Union[str, None] = '202607050001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('idx_refresh_tokens_expires_at', 'refresh_tokens', ['expires_at'])


def downgrade() -> None:
    op.drop_index('idx_refresh_tokens_expires_at', table_name='refresh_tokens')
