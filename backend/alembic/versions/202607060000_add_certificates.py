"""add certificates table

Revision ID: 202607060000
Revises: 202607050005
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID


revision: str = '202607060000'
down_revision: Union[str, None] = '202607050005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'certificates',
        sa.Column('id', PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('student_id', PG_UUID(as_uuid=True), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('section_id', PG_UUID(as_uuid=True), sa.ForeignKey('course_sections.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('enrollment_id', PG_UUID(as_uuid=True), sa.ForeignKey('enrollments.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('certificate_number', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('course_name', sa.String(255), nullable=False),
        sa.Column('student_name', sa.String(255), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column('extra_data', JSONB, nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('student_id', 'section_id', name='uq_certificates_student_section'),
    )


def downgrade() -> None:
    op.drop_table('certificates')
