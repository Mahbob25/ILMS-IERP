"""add portal schema

Revision ID: 202608060008
Revises: 202608060007
Create Date: 2026-08-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202608060008"
down_revision: Union[str, None] = "202608060007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS portal")

    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("phone", sa.String(32), unique=True, nullable=True),
        sa.Column("email", sa.String(255), unique=True, nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("locale_pref", sa.String(10), nullable=False, server_default="ar"),
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("failed_login_attempts", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="portal",
    )
    op.create_index("portal_users_phone_idx", "users", ["phone"], schema="portal")
    op.create_index("portal_users_email_idx", "users", ["email"], schema="portal")

    op.create_table(
        "guardians",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("portal.users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("national_id", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="portal",
    )

    op.create_table(
        "parent_links",
        sa.Column("guardian_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("portal.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship", sa.String(50), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("guardian_id", "student_id"),
        schema="portal",
    )
    op.create_index("parent_links_student_idx", "parent_links", ["student_id"], schema="portal")

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("portal.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="portal",
    )
    op.create_index("portal_refresh_user_idx", "refresh_tokens", ["user_id"], schema="portal")

    op.create_table(
        "preferences",
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("portal.users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("notification_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="portal",
    )


def downgrade() -> None:
    op.drop_table("preferences", schema="portal")
    op.drop_table("refresh_tokens", schema="portal")
    op.drop_table("parent_links", schema="portal")
    op.drop_table("guardians", schema="portal")
    op.drop_table("users", schema="portal")
    op.execute("DROP SCHEMA IF EXISTS portal")
