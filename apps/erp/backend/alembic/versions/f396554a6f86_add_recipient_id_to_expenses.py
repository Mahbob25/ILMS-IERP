"""add_recipient_id_to_expenses

Revision ID: f396554a6f86
Revises: 202606300000
Create Date: 2026-06-30 01:50:40.307973

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f396554a6f86'
down_revision: Union[str, None] = '202606300000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('recipient_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_expenses_recipient_id', 'expenses', 'users', ['recipient_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_expenses_recipient_id', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'recipient_id')
