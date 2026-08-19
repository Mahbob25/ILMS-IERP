"""add missing page_cashier_refunds and page_certificates permissions

Revision ID: 202607190000
Revises: 202607150000
Create Date: 2026-07-19 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "202607190000"
down_revision: Union[str, None] = "202607150000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MANAGER_ROLE_ID = "88dcf628-98e6-4277-9ff7-b1698246a301"
SECRETARY_ROLE_ID = "d4e9f7b2-1c3a-4e5d-9b8f-0a1c2d3e4f50"
TEACHER_ROLE_ID = "b9ef8ccb-0e5a-4933-bf4f-cfb95e34a302"


def upgrade() -> None:
    conn = op.get_bind()

    permissions = [
        ("page_certificates", "Certificates", "Academic"),
        ("page_cashier_refunds", "Refunds", "Financial"),
    ]

    perm_ids = {}
    for codename, label, group_name in permissions:
        existing = conn.execute(
            sa.text("SELECT id FROM permissions WHERE codename = :codename"),
            {"codename": codename},
        ).fetchone()

        if existing:
            perm_ids[codename] = existing[0]
        else:
            conn.execute(
                sa.text(
                    'INSERT INTO permissions (id, codename, label, "group") '
                    "VALUES (gen_random_uuid(), :codename, :label, :group_name)"
                ),
                {"codename": codename, "label": label, "group_name": group_name},
            )
            result = conn.execute(
                sa.text("SELECT id FROM permissions WHERE codename = :codename"),
                {"codename": codename},
            )
            perm_ids[codename] = result.fetchone()[0]

    grant_map = {
        "page_certificates": [MANAGER_ROLE_ID, SECRETARY_ROLE_ID, TEACHER_ROLE_ID],
        "page_cashier_refunds": [MANAGER_ROLE_ID, SECRETARY_ROLE_ID],
    }

    for codename, role_ids in grant_map.items():
        perm_id = perm_ids.get(codename)
        if not perm_id:
            continue
        for role_id in role_ids:
            existing_rp = conn.execute(
                sa.text(
                    "SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :perm_id"
                ),
                {"role_id": role_id, "perm_id": perm_id},
            ).fetchone()
            if not existing_rp:
                conn.execute(
                    sa.text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :perm_id)"
                    ),
                    {"role_id": role_id, "perm_id": perm_id},
                )


def downgrade() -> None:
    conn = op.get_bind()

    for codename in ("page_cashier_refunds", "page_certificates"):
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id = (SELECT id FROM permissions WHERE codename = :codename)"
            ),
            {"codename": codename},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE codename = :codename"),
            {"codename": codename},
        )
