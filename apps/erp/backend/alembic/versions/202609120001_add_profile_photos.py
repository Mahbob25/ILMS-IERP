"""add profile photo path to students and users

Profile photos are stored as files under the uploads volume; the column holds the
path relative to it (e.g. "avatars/<uuid>.jpg"). Staff photos live on users so
every login-capable staff member has one, including a superadmin with no employee
record; student photos live on students.

Revision ID: 202609120001
Revises: 202609110001
Create Date: 2026-09-12 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202609120001'
down_revision: Union[str, None] = '202609110001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('students', sa.Column('photo_path', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('photo_path', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'photo_path')
    op.drop_column('students', 'photo_path')
