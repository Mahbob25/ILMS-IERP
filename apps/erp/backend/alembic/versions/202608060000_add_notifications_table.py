"""add notifications table

Revision ID: 202608060000
Revises: 202608050000
Create Date: 2026-08-06 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202608060000"
down_revision: Union[str, None] = "202608050000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title_key", sa.String(100), nullable=False),
        sa.Column("body_key", sa.String(100), nullable=True),
        sa.Column("params", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("target_href", sa.String(255), nullable=True),
        sa.Column("priority", sa.String(10), nullable=False, server_default="normal"),
        sa.Column("dedupe_key", sa.String(100), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_notifications_user_read_created",
        "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")],
    )

    op.create_index(
        "uq_notifications_user_type_dedupe",
        "notifications",
        ["user_id", "type", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_notifications_user_type_dedupe", table_name="notifications")
    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_table("notifications")
