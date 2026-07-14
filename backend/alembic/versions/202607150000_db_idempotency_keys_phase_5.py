"""db_idempotency_keys_phase_5

Revision ID: 202607150000
Revises: 202607140000
Create Date: 2026-07-15 00:00:00.000000

Phase 5 of QA chaos audit remediation.
Audit items: S01, S13.
Creates idempotency_keys table for idempotency key middleware.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '202607150000'
down_revision: Union[str, None] = '202607140000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'idempotency_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('idempotency_key', sa.String(255), nullable=False),
        sa.Column('endpoint', sa.String(100), nullable=False),
        sa.Column('response_status', sa.Integer(), nullable=False),
        sa.Column('response_body', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.UniqueConstraint('idempotency_key', 'endpoint', name='uq_idempotency_keys_key_endpoint'),
    )
    op.create_index('ix_idempotency_keys_created_at', 'idempotency_keys', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_idempotency_keys_created_at', table_name='idempotency_keys')
    op.drop_table('idempotency_keys')
