"""fix notifications dedupe constraint — remove WHERE clause

Revision ID: 202608060002
Revises: 202608060001
Create Date: 2026-08-06 00:00:02.000000

The original unique index had WHERE dedupe_key IS NOT NULL, but the
ON CONFLICT clause in the INSERT uses bare (user_id, type, dedupe_key).
PostgreSQL won't match a partial unique index unless the ON CONFLICT
also includes the WHERE predicate. Drop the partial index and recreate
without WHERE — NULL dedupe_keys are already distinct in PG.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "202608060002"
down_revision: Union[str, None] = "202608060001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("uq_notifications_user_type_dedupe", table_name="notifications")
    op.create_index(
        "uq_notifications_user_type_dedupe",
        "notifications",
        ["user_id", "type", "dedupe_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_notifications_user_type_dedupe", table_name="notifications")
    op.create_index(
        "uq_notifications_user_type_dedupe",
        "notifications",
        ["user_id", "type", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )
