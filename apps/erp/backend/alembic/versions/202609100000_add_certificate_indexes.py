"""add partial indexes for certificate listing

Revision ID: 202609100000
Revises: 202609060001
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202609100000'
down_revision: Union[str, None] = '202609060001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_certificates_issued_at_active',
        'certificates',
        ['issued_at'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.create_index(
        'ix_certificates_section_issued_at_active',
        'certificates',
        ['section_id', 'issued_at'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_certificates_section_issued_at_active', table_name='certificates')
    op.drop_index('ix_certificates_issued_at_active', table_name='certificates')
