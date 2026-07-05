"""add compensation_type and default_percentage to employees

Revision ID: 202607050005
Revises: 202607050004
Create Date: 2026-07-05 00:00:05.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202607050005'
down_revision: Union[str, None] = '202607050004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE compensationtype AS ENUM ('salary', 'percentage', 'hybrid')")
    op.add_column('employees', sa.Column('compensation_type', sa.Enum('salary', 'percentage', 'hybrid', name='compensationtype'), nullable=False, server_default='salary'))
    op.add_column('employees', sa.Column('default_percentage', sa.Numeric(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('employees', 'default_percentage')
    op.drop_column('employees', 'compensation_type')
    op.execute("DROP TYPE compensationtype")
