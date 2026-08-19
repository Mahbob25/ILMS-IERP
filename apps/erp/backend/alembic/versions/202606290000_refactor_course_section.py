"""move lifecycle fields from courses to course_sections, link payments to enrollments

Revision ID: 202606290000
Revises: 202606260002
Create Date: 2026-06-29 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202606290000'
down_revision: Union[str, None] = '202606260002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add lifecycle columns to course_sections
    op.add_column('course_sections', sa.Column('status',
        postgresql.ENUM(name='coursestatus', create_type=False),
        nullable=False, server_default='pending'))
    op.add_column('course_sections', sa.Column('teacher_percentage', sa.Float(), nullable=True))
    op.add_column('course_sections', sa.Column('min_students_required', sa.Integer(), nullable=True))

    # 2. Migrate existing data from courses to course_sections
    op.execute("""
        UPDATE course_sections cs
        SET
            status = c.status,
            teacher_percentage = c.teacher_percentage,
            min_students_required = c.min_students_required
        FROM courses c
        WHERE cs.course_id = c.id
    """)

    # 3. Add enrollment_id to payments (nullable initially)
    op.add_column('payments', sa.Column('enrollment_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_payments_enrollment_id', 'payments', 'enrollments',
                          ['enrollment_id'], ['id'], ondelete='RESTRICT')

    # 4. Migrate payment data: link each payment to the correct enrollment
    op.execute("""
        UPDATE payments p
        SET enrollment_id = e.id
        FROM enrollments e
        JOIN course_sections cs ON cs.id = e.section_id
        WHERE e.student_id = p.student_id
          AND cs.course_id = p.course_id
    """)

    # 5. Make enrollment_id NOT NULL now that data is migrated
    op.alter_column('payments', 'enrollment_id', nullable=False)

    # 6. Drop old payment columns and constraint
    #    (both naming styles: new DBs use the naming-convention names, old DBs
    #    have the postgres defaults — drop whichever exists)
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_course_id_courses")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_course_id_fkey")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_student_id_students")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_student_id_fkey")
    op.drop_column('payments', 'course_id')
    op.drop_column('payments', 'student_id')

    # 7. Drop old columns from courses (keep coursestatus type — course_sections uses it)
    op.drop_column('courses', 'status')
    op.drop_column('courses', 'teacher_percentage')
    op.drop_column('courses', 'min_students_required')


def downgrade() -> None:
    # 1. Restore columns on courses
    op.add_column('courses', sa.Column('status',
        postgresql.ENUM(name='coursestatus', create_type=False),
        nullable=False, server_default='pending'))
    op.add_column('courses', sa.Column('teacher_percentage', sa.Float(), nullable=True))
    op.add_column('courses', sa.Column('min_students_required', sa.Integer(), nullable=True))

    # 2. Migrate data back from one section per course (first section's values)
    op.execute("""
        UPDATE courses c
        SET
            status = cs.status,
            teacher_percentage = cs.teacher_percentage,
            min_students_required = cs.min_students_required
        FROM (
            SELECT DISTINCT ON (course_id) course_id, status, teacher_percentage, min_students_required
            FROM course_sections
            ORDER BY course_id, id
        ) cs
        WHERE c.id = cs.course_id
    """)

    # 3. Restore old payment columns
    op.add_column('payments', sa.Column('student_id', sa.UUID(), nullable=True))
    op.add_column('payments', sa.Column('course_id', sa.UUID(), nullable=True))

    op.create_foreign_key('payments_student_id_fkey', 'payments', 'students',
                          ['student_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('payments_course_id_fkey', 'payments', 'courses',
                          ['course_id'], ['id'], ondelete='RESTRICT')

    # 4. Migrate payment data back
    op.execute("""
        UPDATE payments p
        SET
            student_id = e.student_id,
            course_id = cs.course_id
        FROM enrollments e
        JOIN course_sections cs ON cs.id = e.section_id
        WHERE p.enrollment_id = e.id
    """)

    op.alter_column('payments', 'student_id', nullable=False)
    op.alter_column('payments', 'course_id', nullable=False)

    # 5. Drop enrollment_id
    op.drop_constraint('fk_payments_enrollment_id', 'payments', type_='foreignkey')
    op.drop_column('payments', 'enrollment_id')

    # 6. Drop lifecycle columns from course_sections
    op.drop_column('course_sections', 'min_students_required')
    op.drop_column('course_sections', 'teacher_percentage')
    op.drop_column('course_sections', 'status')
