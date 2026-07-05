"""add deleted_at columns for soft delete support

Revision ID: 202607050003
Revises: 202607050002
Create Date: 2026-07-05 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TIMESTAMP


revision: str = '202607050003'
down_revision: Union[str, None] = '202607050002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('courses', sa.Column('deleted_at', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('course_sections', sa.Column('deleted_at', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('students', sa.Column('deleted_at', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('enrollments', sa.Column('deleted_at', TIMESTAMP(timezone=True), nullable=True))
    op.add_column('assignments', sa.Column('deleted_at', TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('assignments', 'deleted_at')
    op.drop_column('enrollments', 'deleted_at')
    op.drop_column('students', 'deleted_at')
    op.drop_column('course_sections', 'deleted_at')
    op.drop_column('courses', 'deleted_at')
