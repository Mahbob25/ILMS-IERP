"""add page_reports permission

Revision ID: 202608050000
Revises: 202607210000
Create Date: 2026-08-05 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202608050000"
down_revision: Union[str, None] = "202607210000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MANAGER_ROLE_ID = "88dcf628-98e6-4277-9ff7-b1698246a301"
SECRETARY_ROLE_ID = "d4e9f7b2-1c3a-4e5d-9b8f-0a1c2d3e4f50"

PERMISSION = ("page_reports", "Reports", "Financial")


def upgrade() -> None:
    conn = op.get_bind()

    perm_id = conn.execute(
        sa.text("SELECT id FROM permissions WHERE codename = :codename"),
        {"codename": PERMISSION[0]},
    ).fetchone()

    if not perm_id:
        conn.execute(
            sa.text(
                'INSERT INTO permissions (id, codename, label, "group") '
                "VALUES (gen_random_uuid(), :codename, :label, :group_name)"
            ),
            {"codename": PERMISSION[0], "label": PERMISSION[1], "group_name": PERMISSION[2]},
        )
        perm_id = conn.execute(
            sa.text("SELECT id FROM permissions WHERE codename = :codename"),
            {"codename": PERMISSION[0]},
        ).fetchone()

    # Grant to manager + secretary only. Teachers get no page_reports —
    # teacher-visible reports are granted per-route via RoleChecker instead.
    for role_id in (MANAGER_ROLE_ID, SECRETARY_ROLE_ID):
        existing = conn.execute(
            sa.text(
                "SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :perm_id"
            ),
            {"role_id": role_id, "perm_id": perm_id[0]},
        ).fetchone()
        if not existing:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :perm_id)"
                ),
                {"role_id": role_id, "perm_id": perm_id[0]},
            )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id = "
            "(SELECT id FROM permissions WHERE codename = :codename)"
        ),
        {"codename": "page_reports"},
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE codename = :codename"),
        {"codename": "page_reports"},
    )
