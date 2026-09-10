"""add section price history and enrollment price override

Revision ID: 202609060001
Revises: 202608170001
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision: str = '202609060001'
down_revision: Union[str, None] = '202608170001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "section_price_history",
        sa.Column("id", PG_UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("section_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(["section_id"], ["course_sections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_section_price_history_section_effective",
        "section_price_history",
        ["section_id", "effective_at"],
    )

    # Seed one history row per priced section so existing enrollments can derive
    # their base price from history (effective from the section's creation).
    op.execute("""
        INSERT INTO section_price_history (section_id, price, effective_at)
        SELECT id, price, created_at
        FROM course_sections
        WHERE price IS NOT NULL
    """)

    op.add_column(
        "enrollments",
        sa.Column("price_override", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("enrollments", "price_override")
    op.drop_index("ix_section_price_history_section_effective", table_name="section_price_history")
    op.drop_table("section_price_history")
