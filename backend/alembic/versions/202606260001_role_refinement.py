"""rename admin to manager, add secretary role (RBAC refinement)

Revision ID: 202606260001
Revises: 202606260000
Create Date: 2026-06-26 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '202606260001'
down_revision: Union[str, None] = '202606260000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MANAGER_ROLE_ID = '88dcf628-98e6-4277-9ff7-b1698246a301'
SECRETARY_ROLE_ID = 'd4e9f7b2-1c3a-4e5d-9b8f-0a1c2d3e4f50'


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Rename admin -> manager (idempotent)
    conn.execute(
        sa.text("UPDATE roles SET name = 'manager' WHERE name = 'admin'")
    )

    # 2. Add secretary role if it doesn't exist (idempotent)
    existing = conn.execute(
        sa.text("SELECT id FROM roles WHERE name = 'secretary'")
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text(
                "INSERT INTO roles (id, name) VALUES (:id, :name)"
            ),
            {"id": SECRETARY_ROLE_ID, "name": "secretary"}
        )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove secretary role
    conn.execute(
        sa.text("DELETE FROM roles WHERE name = 'secretary'")
    )

    # Rename manager back to admin
    conn.execute(
        sa.text("UPDATE roles SET name = 'admin' WHERE name = 'manager'")
    )
