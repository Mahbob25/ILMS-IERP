"""add price column to course_sections

Revision ID: 202607010000
Revises: f396554a6f86
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '202607010000'
down_revision: Union[str, None] = 'f396554a6f86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course_sections', sa.Column('price', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('course_sections', 'price')
