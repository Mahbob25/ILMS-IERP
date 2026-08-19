"""add bookings table

Revision ID: 202608060006
Revises: 202608060005
Create Date: 2026-08-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202608060006"
down_revision: Union[str, None] = "202608060005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("program", sa.String(50), nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("locale", sa.String(5), nullable=False, server_default="ar"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("contacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contacted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_bookings_phone", "bookings", ["phone"])
    op.create_index("ix_bookings_status", "bookings", ["status"])


def downgrade() -> None:
    op.drop_index("ix_bookings_status", table_name="bookings")
    op.drop_index("ix_bookings_phone", table_name="bookings")
    op.drop_table("bookings")
