"""lms schema (attendance_sessions, attendance_records, assignments, submissions, grades)

Revision ID: 202606250000
Revises: 202606242200
Create Date: 2026-06-25 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202606250000'
down_revision: Union[str, None] = '202606242200'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create attendance_sessions table
    op.create_table(
        'attendance_sessions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('section_id', 'date', name='uq_attendance_session_section_date')
    )

    # 2. Create attendance_records table
    op.create_table(
        'attendance_records',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='present'),
        sa.ForeignKeyConstraint(['session_id'], ['attendance_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'student_id', name='uq_attendance_record_session_student')
    )

    # 3. Create assignments table
    op.create_table(
        'assignments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('section_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('max_score', sa.Integer(), nullable=False, server_default=sa.text('100')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['section_id'], ['course_sections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 4. Create submissions table
    op.create_table(
        'submissions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('assignment_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='submitted'),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('assignment_id', 'student_id', name='uq_submission_assignment_student')
    )

    # 5. Create grades table
    op.create_table(
        'grades',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('submission_id', sa.UUID(), nullable=False, unique=True),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('graded_by', sa.UUID(), nullable=False),
        sa.Column('graded_at', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['submission_id'], ['submissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['graded_by'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('grades')
    op.drop_table('submissions')
    op.drop_table('assignments')
    op.drop_table('attendance_records')
    op.drop_table('attendance_sessions')
