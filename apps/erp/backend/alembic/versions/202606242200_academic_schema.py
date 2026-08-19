"""academic schema (terms, courses, course_sections, students, enrollments)

Revision ID: 202606242200
Revises: 202606182315
Create Date: 2026-06-24 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '202606242200'
down_revision: Union[str, None] = '202606182315'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create terms table
    op.create_table(
        'terms',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_terms_code'), 'terms', ['code'], unique=True)

    # 2. Create courses table
    op.create_table(
        'courses',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('credits', sa.Integer(), server_default=sa.text('3'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_courses_code'), 'courses', ['code'], unique=True)

    # 3. Create course_sections table
    op.create_table(
        'course_sections',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('course_id', sa.UUID(), nullable=False),
        sa.Column('term_id', sa.UUID(), nullable=False),
        sa.Column('teacher_id', sa.UUID(), nullable=False),
        sa.Column('capacity', sa.Integer(), server_default=sa.text('30'), nullable=False),
        sa.Column('enrolled_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['term_id'], ['terms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['teacher_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_check_constraint(
        'ck_course_sections_enrolled_count',
        'course_sections',
        'enrolled_count >= 0 AND enrolled_count <= capacity'
    )

    # 4. Create students table
    op.create_table(
        'students',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('student_code', sa.String(length=50), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('student_code')
    )
    op.create_index(op.f('ix_students_student_code'), 'students', ['student_code'], unique=True)

    # 5. Create enrollments table
    op.create_table(
        'enrollments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('enrolled_at', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('student_id', 'section_id', name='uq_enrollments_student_section')
    )


def downgrade() -> None:
    op.drop_table('enrollments')
    op.drop_table('students')
    op.drop_table('course_sections')
    op.drop_table('courses')
    op.drop_table('terms')
