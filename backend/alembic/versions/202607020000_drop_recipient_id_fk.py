"""drop foreign key constraint on expenses.recipient_id

Revision ID: 202607020000
Revises: 202607010000, 202606300100
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '202607020000'
down_revision: Union[str, list[str]] = ['202607010000', '202606300100']
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('fk_expenses_recipient_id', 'expenses', type_='foreignkey')


def downgrade() -> None:
    op.create_foreign_key('fk_expenses_recipient_id', 'expenses', 'employees', ['recipient_id'], ['id'], ondelete='SET NULL')
