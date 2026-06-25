"""seed manager, secretary, and teacher users

Revision ID: 202606260002
Revises: 202606260001
Create Date: 2026-06-26 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '202606260002'
down_revision: Union[str, None] = '202606260001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MANAGER_ROLE_ID = '88dcf628-98e6-4277-9ff7-b1698246a301'
SECRETARY_ROLE_ID = 'd4e9f7b2-1c3a-4e5d-9b8f-0a1c2d3e4f50'
TEACHER_ROLE_ID = 'b9ef8ccb-0e5a-4933-bf4f-cfb95e34a302'

MANAGER_USER_ID = 'e2a1b3c4-5d6e-7f89-0abc-def123456789'
SECRETARY_USER_ID = 'f3b2c4d5-6e7f-8901-bcde-f12345678901'
TEACHER_USER_ID = 'a4c5d6e7-8f90-1234-cdef-123456789012'

def upgrade() -> None:
    conn = op.get_bind()

    # Insert manager user (idempotent)
    existing = conn.execute(
        sa.text("SELECT id FROM users WHERE email = 'manager@institute.dev'")
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("""
                INSERT INTO users (id, email, password_hash, full_name, role_id, locale_pref, is_active, is_superadmin)
                VALUES (:id, :email, :pwd, :name, :role, 'ar', true, false)
            """),
            {
                "id": MANAGER_USER_ID,
                "email": "manager@institute.dev",
                "pwd": "$2b$12$fZDSuaTNvnKQ51wNtXFuK.FjzPVXCl/2tADKoB34bFkHbv8..9Axu",
                "name": "Manager User",
                "role": MANAGER_ROLE_ID,
            }
        )

    # Insert secretary user (idempotent)
    existing = conn.execute(
        sa.text("SELECT id FROM users WHERE email = 'secretary@institute.dev'")
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("""
                INSERT INTO users (id, email, password_hash, full_name, role_id, locale_pref, is_active, is_superadmin)
                VALUES (:id, :email, :pwd, :name, :role, 'ar', true, false)
            """),
            {
                "id": SECRETARY_USER_ID,
                "email": "secretary@institute.dev",
                "pwd": "$2b$12$yfO5Ecwtt8I4TGydneDxGekjfOEp8XxDEc00oIza5US9wQyEDT/NO",
                "name": "Secretary User",
                "role": SECRETARY_ROLE_ID,
            }
        )

    # Insert teacher user (idempotent)
    existing = conn.execute(
        sa.text("SELECT id FROM users WHERE email = 'teacher@institute.dev'")
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("""
                INSERT INTO users (id, email, password_hash, full_name, role_id, locale_pref, is_active, is_superadmin)
                VALUES (:id, :email, :pwd, :name, :role, 'ar', true, false)
            """),
            {
                "id": TEACHER_USER_ID,
                "email": "teacher@institute.dev",
                "pwd": "$2b$12$qj/unWJIAmk3PMbcp/imfubouzzH68hBEExVNhN8Az0wqZ32VHGuS",
                "name": "Teacher User",
                "role": TEACHER_ROLE_ID,
            }
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM users WHERE email IN ('manager@institute.dev', 'secretary@institute.dev', 'teacher@institute.dev')")
    )
