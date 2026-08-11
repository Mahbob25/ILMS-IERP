"""add system_settings table

Revision ID: 202608060005
Revises: 202608060004
Create Date: 2026-08-06 00:00:05.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202608060005"
down_revision: Union[str, None] = "202608060004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", postgresql.JSONB, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO system_settings (key, value) VALUES "
        "('institute_profile', '{\"name\": \"Al-Drasat ERP\", \"address\": null, \"phone\": null, \"logo_path\": \"/logo.jpeg\"}'::jsonb),"
        "('defaults', '{\"timezone\": \"Asia/Riyadh\", \"default_teacher_percentage\": null, \"backup_retention_days\": null}'::jsonb) "
        "ON CONFLICT (key) DO NOTHING"
    ))


def downgrade() -> None:
    op.drop_table("system_settings")
