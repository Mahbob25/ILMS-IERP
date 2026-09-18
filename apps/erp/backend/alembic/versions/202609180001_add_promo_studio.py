"""add promo studio tables

Revision ID: 202609180001
Revises: 202609120001
Create Date: 2026-09-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202609180001"
down_revision: Union[str, None] = "202609120001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "promo_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("type", sa.String(20), nullable=False, server_default="course"),
        sa.Column("locale", sa.String(5), nullable=False, server_default="ar"),
        sa.Column("tone", sa.String(20), nullable=False, server_default="cinematic"),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_promo_projects_created_by", "promo_projects", ["created_by"])
    op.create_index("ix_promo_projects_status", "promo_projects", ["status"])

    op.create_table(
        "promo_renders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("promo_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quality", sa.String(10), nullable=False, server_default="draft"),
        sa.Column("template_version", sa.String(20), nullable=False, server_default="course-ad-v1"),
        sa.Column("brand_kit_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("mp4_path", sa.String(500), nullable=True),
        sa.Column("poster_path", sa.String(500), nullable=True),
        sa.Column("share_copy", sa.Text, nullable=True),
        sa.Column("duration_s", sa.Float, nullable=True),
        sa.Column("render_ms", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
    )
    op.create_index("ix_promo_renders_project_id", "promo_renders", ["project_id"])
    op.create_index("ix_promo_renders_status", "promo_renders", ["status"])

    # Page permission for the Promo Studio wizard (DB-authoritative access).
    conn = op.get_bind()
    exists = conn.execute(
        sa.text("SELECT 1 FROM permissions WHERE codename = 'page_promo_studio'")
    ).fetchone()
    if not exists:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, codename, label, \"group\") "
                "VALUES (gen_random_uuid(), 'page_promo_studio', 'Promo Studio', 'marketing')"
            )
        )
    perm_row = conn.execute(
        sa.text("SELECT id FROM permissions WHERE codename = 'page_promo_studio'")
    ).fetchone()
    if perm_row:
        perm_id = perm_row[0]
        for role_name in ("marketing_manager",):
            role_row = conn.execute(
                sa.text("SELECT id FROM roles WHERE name = :name"), {"name": role_name}
            ).fetchone()
            if not role_row:
                continue
            already = conn.execute(
                sa.text(
                    "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
                ),
                {"rid": role_row[0], "pid": perm_id},
            ).fetchone()
            if not already:
                conn.execute(
                    sa.text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                    ),
                    {"rid": role_row[0], "pid": perm_id},
                )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id = "
            "(SELECT id FROM permissions WHERE codename = 'page_promo_studio')"
        )
    )
    conn.execute(sa.text("DELETE FROM permissions WHERE codename = 'page_promo_studio'"))
    op.drop_index("ix_promo_renders_status", table_name="promo_renders")
    op.drop_index("ix_promo_renders_project_id", table_name="promo_renders")
    op.drop_table("promo_renders")
    op.drop_index("ix_promo_projects_status", table_name="promo_projects")
    op.drop_index("ix_promo_projects_created_by", table_name="promo_projects")
    op.drop_table("promo_projects")
