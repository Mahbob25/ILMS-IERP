"""add lessonforge_resources — per-teacher generated learning resource history

Revision ID: 202608310001
Revises: 202608170001
Create Date: 2026-08-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "202608310001"
down_revision: Union[str, None] = "202608170001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lessonforge_resources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "teacher_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(300), nullable=True),
        sa.Column("output_mode", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("format", sa.String(16), nullable=False, server_default="html"),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
    )
    op.create_index("ix_lessonforge_resources_teacher_id", "lessonforge_resources", ["teacher_id"])
    op.create_index("ix_lessonforge_resources_job_id", "lessonforge_resources", ["job_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_lessonforge_resources_job_id", table_name="lessonforge_resources")
    op.drop_index("ix_lessonforge_resources_teacher_id", table_name="lessonforge_resources")
    op.drop_table("lessonforge_resources")
