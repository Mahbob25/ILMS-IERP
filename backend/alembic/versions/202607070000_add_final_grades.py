"""add final_grades table and certificate display columns

Revision ID: 202607070000
Revises: 202607060000
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID


revision: str = '202607070000'
down_revision: Union[str, None] = '202607060000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'final_grades',
        sa.Column('id', PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('section_id', PG_UUID(as_uuid=True), sa.ForeignKey('course_sections.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('student_id', PG_UUID(as_uuid=True), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('final_score', sa.Numeric(5, 2), nullable=False),
        sa.Column('graded_by', PG_UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('graded_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc'::text, now())")),
        sa.Column('notes', sa.Text, nullable=True),
        sa.UniqueConstraint('section_id', 'student_id', name='uq_final_grades_section_student'),
    )

    op.add_column('certificates', sa.Column('final_score', sa.Numeric(5, 2), nullable=True))
    op.add_column('certificates', sa.Column('grade_label', sa.String(20), nullable=True))
    op.add_column('certificates', sa.Column('student_id_no', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('certificates', 'student_id_no')
    op.drop_column('certificates', 'grade_label')
    op.drop_column('certificates', 'final_score')
    op.drop_table('final_grades')
