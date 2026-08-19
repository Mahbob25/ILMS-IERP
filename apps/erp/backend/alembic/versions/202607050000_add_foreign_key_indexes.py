"""add indexes on all foreign key columns

Revision ID: 202607050000
Revises: 202607040000
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '202607050000'
down_revision: Union[str, None] = '202607040000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # identity schema
    op.create_index('idx_users_role_id', 'users', ['role_id'])
    op.create_index('idx_users_employee_id', 'users', ['employee_id'])
    op.create_index('idx_refresh_tokens_user_id', 'refresh_tokens', ['user_id'])
    op.create_index('idx_audit_logs_user_id', 'audit_logs', ['user_id'])

    # academic schema
    op.create_index('idx_course_sections_course_id', 'course_sections', ['course_id'])
    op.create_index('idx_course_sections_teacher_id', 'course_sections', ['teacher_id'])
    op.create_index('idx_enrollments_student_id', 'enrollments', ['student_id'])
    op.create_index('idx_enrollments_section_id', 'enrollments', ['section_id'])

    # lms schema
    op.create_index('idx_attendance_sessions_section_id', 'attendance_sessions', ['section_id'])
    op.create_index('idx_attendance_sessions_created_by', 'attendance_sessions', ['created_by'])
    op.create_index('idx_attendance_records_session_id', 'attendance_records', ['session_id'])
    op.create_index('idx_attendance_records_student_id', 'attendance_records', ['student_id'])
    op.create_index('idx_assignments_section_id', 'assignments', ['section_id'])
    op.create_index('idx_submissions_assignment_id', 'submissions', ['assignment_id'])
    op.create_index('idx_submissions_student_id', 'submissions', ['student_id'])
    op.create_index('idx_grades_graded_by', 'grades', ['graded_by'])
    op.create_index('idx_payments_enrollment_id', 'payments', ['enrollment_id'])
    op.create_index('idx_expenses_recipient_id', 'expenses', ['recipient_id'])
    op.create_index('idx_daily_closures_closed_by_manager_id', 'daily_closures', ['closed_by_manager_id'])


def downgrade() -> None:
    op.drop_index('idx_users_role_id', table_name='users')
    op.drop_index('idx_users_employee_id', table_name='users')
    op.drop_index('idx_refresh_tokens_user_id', table_name='refresh_tokens')
    op.drop_index('idx_audit_logs_user_id', table_name='audit_logs')
    op.drop_index('idx_course_sections_course_id', table_name='course_sections')
    op.drop_index('idx_course_sections_teacher_id', table_name='course_sections')
    op.drop_index('idx_enrollments_student_id', table_name='enrollments')
    op.drop_index('idx_enrollments_section_id', table_name='enrollments')
    op.drop_index('idx_attendance_sessions_section_id', table_name='attendance_sessions')
    op.drop_index('idx_attendance_sessions_created_by', table_name='attendance_sessions')
    op.drop_index('idx_attendance_records_session_id', table_name='attendance_records')
    op.drop_index('idx_attendance_records_student_id', table_name='attendance_records')
    op.drop_index('idx_assignments_section_id', table_name='assignments')
    op.drop_index('idx_submissions_assignment_id', table_name='submissions')
    op.drop_index('idx_submissions_student_id', table_name='submissions')
    op.drop_index('idx_grades_graded_by', table_name='grades')
    op.drop_index('idx_payments_enrollment_id', table_name='payments')
    op.drop_index('idx_expenses_recipient_id', table_name='expenses')
    op.drop_index('idx_daily_closures_closed_by_manager_id', table_name='daily_closures')
