"""add created_at to course_sections

Revision ID: 202608060001
Revises: 202608060000
Create Date: 2026-08-06 00:00:01.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "202608060001"
down_revision: Union[str, None] = "202608060000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_sections",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc'::text, now())"),
        ),
    )

    # Backfill existing rows with a reasonable default (today at midnight UTC)
    # so the column is NOT NULL after the migration. Existing rows get a
    # non-null value; new rows use the server_default.
    op.execute(
        sa.text(
            "UPDATE course_sections SET created_at = timezone('utc'::text, now()) WHERE created_at IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("course_sections", "created_at")
