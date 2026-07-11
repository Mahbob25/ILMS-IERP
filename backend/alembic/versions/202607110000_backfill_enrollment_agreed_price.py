"""backfill null enrollment agreed_price from section price

Revision ID: 202607110000
Revises: 202607100000
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '202607110000'
down_revision: Union[str, None] = '202607100000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE enrollments
        SET agreed_price = course_sections.price
        FROM course_sections
        WHERE enrollments.section_id = course_sections.id
          AND enrollments.agreed_price IS NULL
          AND course_sections.price IS NOT NULL
    """)


def downgrade() -> None:
    pass
