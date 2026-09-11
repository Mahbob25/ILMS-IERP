"""add page_portal_accounts permission

Grants the new Portal Accounts admin page to manager and secretary (superadmin
always bypasses). Idempotent, following 202609100001_reconcile_page_permissions:
only inserts what is missing and deliberately does not touch other grants.

Revision ID: 202609110001
Revises: 202609100001
Create Date: 2026-09-11 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202609110001'
down_revision: Union[str, None] = '202609100001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMISSIONS = [
    ("page_portal_accounts", "Portal Accounts", "General"),
]

GRANT_MAP = {
    "page_portal_accounts": ["manager", "secretary"],
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

    for codename in ("page_portal_accounts",):
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
