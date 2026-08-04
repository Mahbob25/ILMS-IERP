"""refactor business tables to reference employees instead of users

Revision ID: 202607030000
Revises: 202607020000
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '202607030000'
down_revision: Union[str, list[str]] = '202607020000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Drop old FK constraints BEFORE migrating data (otherwise SET would
    #    violate the existing FK that checks against users.id)
    #    (both naming styles: new DBs use the naming-convention names, old DBs
    #    have the postgres defaults — drop whichever exists)
    op.execute("ALTER TABLE course_sections DROP CONSTRAINT IF EXISTS fk_course_sections_teacher_id_users")
    op.execute("ALTER TABLE course_sections DROP CONSTRAINT IF EXISTS course_sections_teacher_id_fkey")
    op.execute("ALTER TABLE teacher_wallets DROP CONSTRAINT IF EXISTS fk_teacher_wallets_teacher_id_users")
    op.execute("ALTER TABLE teacher_wallets DROP CONSTRAINT IF EXISTS teacher_wallets_teacher_id_fkey")

    # 2. Ensure all teachers referenced in course_sections have employee records
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, is_active)
        SELECT gen_random_uuid(), u.full_name, 'teacher'::employeetype, true
        FROM users u
        WHERE u.id IN (SELECT DISTINCT teacher_id FROM course_sections)
        AND u.employee_id IS NULL
    """))
    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND e.employee_type = 'teacher'::employeetype
        AND u.employee_id IS NULL
        AND u.id IN (SELECT DISTINCT teacher_id FROM course_sections)
    """))

    # 3. Create employee records for orphaned course_sections teacher_ids that
    #    don't have a matching user record (edge case from partial migrations)
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, is_active)
        SELECT DISTINCT cs.teacher_id, 'Unknown', 'teacher'::employeetype, true
        FROM course_sections cs
        WHERE cs.teacher_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cs.teacher_id)
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = cs.teacher_id)
    """))

    # 4. Migrate course_sections.teacher_id from user_id to employee_id.
    #    Rows whose teacher_id is already an employee_id are skipped.
    conn.execute(sa.text("""
        UPDATE course_sections cs
        SET teacher_id = u.employee_id
        FROM users u
        WHERE u.id = cs.teacher_id AND u.employee_id IS NOT NULL
    """))

    # 5. Ensure all teachers referenced in teacher_wallets have employee records
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, is_active)
        SELECT gen_random_uuid(), u.full_name, 'teacher'::employeetype, true
        FROM users u
        WHERE u.id IN (SELECT DISTINCT teacher_id FROM teacher_wallets)
        AND u.employee_id IS NULL
    """))
    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND e.employee_type = 'teacher'::employeetype
        AND u.employee_id IS NULL
        AND u.id IN (SELECT DISTINCT teacher_id FROM teacher_wallets)
    """))

    # 6. Create employee records for orphaned teacher_wallet teacher_ids
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, is_active)
        SELECT DISTINCT tw.teacher_id, 'Unknown', 'teacher'::employeetype, true
        FROM teacher_wallets tw
        WHERE tw.teacher_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = tw.teacher_id)
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = tw.teacher_id)
    """))

    # 7. Migrate teacher_wallets.teacher_id from user_id to employee_id
    conn.execute(sa.text("""
        UPDATE teacher_wallets tw
        SET teacher_id = u.employee_id
        FROM users u
        WHERE u.id = tw.teacher_id AND u.employee_id IS NOT NULL
    """))

    # 8. Create new FK constraints to employees
    op.create_foreign_key('fk_course_sections_teacher_id', 'course_sections', 'employees', ['teacher_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_teacher_wallets_teacher_id', 'teacher_wallets', 'employees', ['teacher_id'], ['id'], ondelete='CASCADE')

    # 9. Handle expenses.recipient_id before adding its FK
    #    Map user IDs to employee IDs where possible
    conn.execute(sa.text("""
        UPDATE expenses e
        SET recipient_id = u.employee_id
        FROM users u
        WHERE u.id = e.recipient_id AND u.employee_id IS NOT NULL
    """))
    #    For orphaned recipient_ids (no matching user), create employees
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, is_active)
        SELECT DISTINCT e.recipient_id, 'Unknown', 'teacher'::employeetype, true
        FROM expenses e
        WHERE e.recipient_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.recipient_id)
        AND NOT EXISTS (SELECT 1 FROM employees emp WHERE emp.id = e.recipient_id)
    """))

    # 10. Create FK for expenses.recipient_id -> employees
    op.create_foreign_key('fk_expenses_recipient_id_employee', 'expenses', 'employees', ['recipient_id'], ['id'], ondelete='SET NULL')

    # 10. Drop full_name from users (HR data now in employees)
    op.drop_column('users', 'full_name')


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Restore full_name to users
    op.add_column('users', sa.Column('full_name', sa.String(255), nullable=True))
    conn.execute(sa.text("""
        UPDATE users u
        SET full_name = e.full_name
        FROM employees e
        WHERE u.employee_id = e.id
    """))
    op.alter_column('users', 'full_name', nullable=False)

    # 2. Drop new FKs
    op.drop_constraint('fk_course_sections_teacher_id', 'course_sections', type_='foreignkey')
    op.drop_constraint('fk_teacher_wallets_teacher_id', 'teacher_wallets', type_='foreignkey')
    op.drop_constraint('fk_expenses_recipient_id_employee', 'expenses', type_='foreignkey')

    # 3. Restore old FKs to users
    op.create_foreign_key('course_sections_teacher_id_fkey', 'course_sections', 'users', ['teacher_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('teacher_wallets_teacher_id_fkey', 'teacher_wallets', 'users', ['teacher_id'], ['id'], ondelete='CASCADE')

    # 4. Restore course_sections.teacher_id from employee_id to user_id
    conn.execute(sa.text("""
        UPDATE course_sections cs
        SET teacher_id = u.id
        FROM users u
        WHERE u.employee_id = cs.teacher_id
    """))

    # 5. Restore teacher_wallets.teacher_id from employee_id to user_id
    conn.execute(sa.text("""
        UPDATE teacher_wallets tw
        SET teacher_id = u.id
        FROM users u
        WHERE u.employee_id = tw.teacher_id
    """))
