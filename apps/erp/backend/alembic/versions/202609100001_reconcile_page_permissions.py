"""reconcile page permissions for DB-authoritative access control

Adds the two page permissions that only ever existed in the frontend permission
maps (page_wizards, page_search), plus the role grants those maps imply, so that
switching access control to the database does not strip access from roles that
have it today.

Deliberately does NOT touch page_certificates or any other existing grant: an
admin may already have revoked one through the Roles page, and this migration
must not silently restore it.

Revision ID: 202609100001
Revises: 202609100000
Create Date: 2026-09-10 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202609100001'
down_revision: Union[str, None] = '202609100000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSIONS = [
    ("page_wizards", "Quick Registration", "Academic"),
    ("page_search", "Search", "General"),
]

GRANT_MAP = {
    "page_wizards": ["manager", "secretary"],
    "page_search": ["manager", "secretary", "teacher"],
    "page_bookings": ["manager", "secretary"],
}


def upgrade() -> None:
    conn = op.get_bind()

    for codename, label, group_name in NEW_PERMISSIONS:
        exists = conn.execute(
            sa.text("SELECT 1 FROM permissions WHERE codename = :codename"),
            {"codename": codename},
        ).fetchone()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO permissions (id, codename, label, \"group\") "
                    "VALUES (gen_random_uuid(), :codename, :label, :group_name)"
                ),
                {"codename": codename, "label": label, "group_name": group_name},
            )

    for codename, role_names in GRANT_MAP.items():
        perm_row = conn.execute(
            sa.text("SELECT id FROM permissions WHERE codename = :codename"),
            {"codename": codename},
        ).fetchone()
        if not perm_row:
            continue
        perm_id = perm_row[0]

        for role_name in role_names:
            role_row = conn.execute(
                sa.text("SELECT id FROM roles WHERE name = :name"),
                {"name": role_name},
            ).fetchone()
            if not role_row:
                continue
            role_id = role_row[0]

            already_granted = conn.execute(
                sa.text(
                    "SELECT 1 FROM role_permissions "
                    "WHERE role_id = :role_id AND permission_id = :perm_id"
                ),
                {"role_id": role_id, "perm_id": perm_id},
            ).fetchone()
            if not already_granted:
                conn.execute(
                    sa.text(
                        "INSERT INTO role_permissions (role_id, permission_id) "
                        "VALUES (:role_id, :perm_id)"
                    ),
                    {"role_id": role_id, "perm_id": perm_id},
                )


def downgrade() -> None:
    conn = op.get_bind()

    for codename in ("page_wizards", "page_search"):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id = "
                "(SELECT id FROM permissions WHERE codename = :codename)"
            ),
            {"codename": codename},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE codename = :codename"),
            {"codename": codename},
        )

    # page_bookings grants are intentionally left in place: they are
    # indistinguishable from grants an admin may have made themselves.
