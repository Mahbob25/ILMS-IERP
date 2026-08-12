"""add marketing_manager role, landing cms, announcements, contacts

Revision ID: 202608060007
Revises: 202608060006
Create Date: 2026-08-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202608060007"
down_revision: Union[str, None] = "202608060006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text("""
        INSERT INTO roles (id, name)
        SELECT gen_random_uuid(), 'marketing_manager'
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name='marketing_manager')
    """))

    for codename, label, group in [
        ("page_content", "Landing Content", "marketing"),
        ("page_announcements", "Announcements", "marketing"),
        ("page_contacts", "Contacts Inbox", "marketing"),
    ]:
        conn.execute(sa.text("""
            INSERT INTO permissions (id, codename, label, "group")
            SELECT gen_random_uuid(), :codename, :label, :group
            WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename=:codename)
        """), {"codename": codename, "label": label, "group": group})

    for codename in ["page_content", "page_announcements", "page_contacts", "page_bookings"]:
        conn.execute(sa.text("""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id FROM roles r, permissions p
            WHERE r.name='marketing_manager' AND p.codename=:codename
            AND NOT EXISTS (
                SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id
            )
        """), {"codename": codename})

    op.create_table(
        "landing_content",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("text_ar", sa.Text, nullable=False),
        sa.Column("text_en", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("locale", sa.String(5), nullable=False, server_default=sa.text("'ar'")),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column("contacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contacted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_contacts_phone", "contacts", ["phone"])
    op.create_index("ix_contacts_status", "contacts", ["status"])

    # seed landing_content with empty value so GET doesn't 404
    conn.execute(sa.text("""
        INSERT INTO landing_content (key, value)
        VALUES ('landing', '{}'::jsonb)
        ON CONFLICT (key) DO NOTHING
    """))


def downgrade() -> None:
    op.drop_index("ix_contacts_status", table_name="contacts")
    op.drop_index("ix_contacts_phone", table_name="contacts")
    op.drop_table("contacts")
    op.drop_table("announcements")
    op.drop_table("landing_content")
    conn = op.get_bind()
    conn.execute(sa.text("""
        DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name='marketing_manager')
    """))
    conn.execute(sa.text("DELETE FROM roles WHERE name='marketing_manager'"))
    conn.execute(sa.text("DELETE FROM permissions WHERE codename IN ('page_content','page_announcements','page_contacts')"))
