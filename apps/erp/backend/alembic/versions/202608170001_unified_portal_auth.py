"""unified portal auth — student phone, portal student links, SSO tickets

Revision ID: 202608170001
Revises: 202608060008
Create Date: 2026-08-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202608170001"
down_revision: Union[str, None] = "202608060008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "students",
        sa.Column("phone", sa.String(32), nullable=True),
    )

    op.execute("CREATE SCHEMA IF NOT EXISTS portal")

    op.create_table(
        "student_links",
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal.users.id", ondelete="CASCADE"),
            nullable=False,
            primary_key=True,
        ),
        sa.Column(
            "student_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="portal",
    )

    op.create_table(
        "sso_tickets",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="portal",
    )


def downgrade() -> None:
    op.drop_table("sso_tickets", schema="portal")
    op.drop_table("student_links", schema="portal")
    op.drop_column("students", "phone")
