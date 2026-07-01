"""separate employees from users, add permissions system

Revision ID: 202606300100
Revises: f396554a6f86
Create Date: 2026-06-30 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '202606300100'
down_revision: Union[str, None] = 'f396554a6f86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Known role IDs from initial seed
SUPERADMIN_ROLE_ID = 'c12c75a4-569b-430c-968e-0fde8b14e300'
MANAGER_ROLE_ID = '88dcf628-98e6-4277-9ff7-b1698246a301'
TEACHER_ROLE_ID = 'b9ef8ccb-0e5a-4933-bf4f-cfb95e34a302'
SECRETARY_ROLE_ID = 'd4e9f7b2-1c3a-4e5d-9b8f-0a1c2d3e4f50'

# Known user IDs from seed migrations
MANAGER_USER_ID = 'e2a1b3c4-5d6e-7f89-0abc-def123456789'
SECRETARY_USER_ID = 'f3b2c4d5-6e7f-8901-bcde-f12345678901'
TEACHER_USER_ID = 'a4c5d6e7-8f90-1234-cdef-123456789012'


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create EmployeeType enum (idempotent via raw SQL)
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE employeetype AS ENUM (
                'teacher', 'manager', 'secretary', 'cleaner',
                'security', 'receptionist', 'accountant', 'maintenance', 'other'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """))

    # 2. Create employees table (raw SQL to avoid double-enum-creation in this SA version)
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS employees (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            full_name VARCHAR(255) NOT NULL,
            employee_type employeetype NOT NULL,
            phone_number VARCHAR(50),
            salary FLOAT,
            hire_date DATE,
            contract_end_date DATE,
            address TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP NOT NULL DEFAULT timezone('utc'::text, now())
        )
    """))

    # 3. Add employee_id column to users (nullable for now)
    op.add_column('users', sa.Column('employee_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_users_employee_id', 'users', 'employees', ['employee_id'], ['id'], ondelete='SET NULL')

    # 4. Migrate data: create employee records and link

    # 4a. Process cleaner users → employee records, deactivate them
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        SELECT gen_random_uuid(), u.full_name, 'cleaner'::employeetype, u.phone_number, u.salary, u.hire_date, u.contract_end_date, u.address, u.is_active
        FROM users u
        WHERE u.role_id = (SELECT id FROM roles WHERE name = 'cleaner')
    """))

    # Link cleaner users to their new employee records
    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND e.employee_type = 'cleaner'::employeetype
        AND u.role_id = (SELECT id FROM roles WHERE name = 'cleaner')
    """))

    # Deactivate cleaner user accounts (prevent login)
    conn.execute(sa.text("""
        UPDATE users SET is_active = false
        WHERE role_id = (SELECT id FROM roles WHERE name = 'cleaner')
    """))

    # 4b. Create employee records for seeded users (manager, secretary, teacher)
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        VALUES (gen_random_uuid(), 'Manager User', 'manager'::employeetype, NULL, NULL, NULL, NULL, NULL, true)
    """))
    conn.execute(sa.text("""
        UPDATE users SET employee_id = (SELECT id FROM employees WHERE full_name = 'Manager User' AND employee_type = 'manager'::employeetype)
        WHERE id = :uid
    """), {"uid": MANAGER_USER_ID})

    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        VALUES (gen_random_uuid(), 'Secretary User', 'secretary'::employeetype, NULL, NULL, NULL, NULL, NULL, true)
    """))
    conn.execute(sa.text("""
        UPDATE users SET employee_id = (SELECT id FROM employees WHERE full_name = 'Secretary User' AND employee_type = 'secretary'::employeetype)
        WHERE id = :uid
    """), {"uid": SECRETARY_USER_ID})

    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        VALUES (gen_random_uuid(), 'Teacher User', 'teacher'::employeetype, NULL, NULL, NULL, NULL, NULL, true)
    """))
    conn.execute(sa.text("""
        UPDATE users SET employee_id = (SELECT id FROM employees WHERE full_name = 'Teacher User' AND employee_type = 'teacher'::employeetype)
        WHERE id = :uid
    """), {"uid": TEACHER_USER_ID})

    # 4c. For any other users with HR data, create employee records
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        SELECT gen_random_uuid(), u.full_name,
            CASE WHEN r.name = 'superadmin' THEN 'manager'::employeetype ELSE r.name::employeetype END,
            u.phone_number, u.salary, u.hire_date, u.contract_end_date, u.address, u.is_active
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.employee_id IS NULL
        AND (u.phone_number IS NOT NULL OR u.salary IS NOT NULL OR u.hire_date IS NOT NULL)
    """))
    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND u.employee_id IS NULL
        AND (u.phone_number IS NOT NULL OR u.salary IS NOT NULL OR u.hire_date IS NOT NULL)
    """))

    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND u.employee_id IS NULL
        AND (u.phone_number IS NOT NULL OR u.salary IS NOT NULL OR u.hire_date IS NOT NULL)
    """))

    # 5. Migrate Expense.recipient_id from users.id to employees.id

    # Ensure employee records exist for any user referenced by expense recipient_id
    conn.execute(sa.text("""
        INSERT INTO employees (id, full_name, employee_type, phone_number, salary, hire_date, contract_end_date, address, is_active)
        SELECT gen_random_uuid(), u.full_name,
            CASE WHEN r.name = 'superadmin' THEN 'manager'::employeetype ELSE r.name::employeetype END,
            u.phone_number, u.salary, u.hire_date, u.contract_end_date, u.address, u.is_active
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id IN (SELECT DISTINCT recipient_id FROM expenses WHERE recipient_id IS NOT NULL)
        AND u.employee_id IS NULL
    """))

    # Link those users
    conn.execute(sa.text("""
        UPDATE users u
        SET employee_id = e.id
        FROM employees e
        WHERE e.full_name = u.full_name AND u.employee_id IS NULL
        AND u.id IN (SELECT DISTINCT recipient_id FROM expenses WHERE recipient_id IS NOT NULL)
    """))

    # Now update expense.recipient_id to point to employee.id
    conn.execute(sa.text("""
        UPDATE expenses SET recipient_id = (
            SELECT u.employee_id FROM users u WHERE u.id = expenses.recipient_id
        )
        WHERE recipient_id IS NOT NULL
    """))

    # Drop old FK, add new FK to employees
    op.drop_constraint('fk_expenses_recipient_id', 'expenses', type_='foreignkey')
    op.create_foreign_key('fk_expenses_recipient_id', 'expenses', 'employees', ['recipient_id'], ['id'], ondelete='SET NULL')

    # 6. Drop HR columns from users (data now lives in employees table)
    op.drop_column('users', 'phone_number')
    op.drop_column('users', 'salary')
    op.drop_column('users', 'hire_date')
    op.drop_column('users', 'contract_end_date')
    op.drop_column('users', 'address')

    # 7. Create permissions table
    op.create_table(
        'permissions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('codename', sa.String(100), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('group', sa.String(50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permissions_codename'), 'permissions', ['codename'], unique=True)

    # 8. Create role_permissions table
    op.create_table(
        'role_permissions',
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )

    # 9. Seed permissions
    permissions = [
        # General group
        ('page_dashboard', 'Dashboard', 'General'),
        ('page_users', 'User Management', 'General'),
        ('page_employees', 'Employee Management', 'General'),
        ('page_roles', 'Roles & Permissions', 'General'),
        # Academic group
        ('page_courses', 'Courses', 'Academic'),
        ('page_sections', 'Course Sections', 'Academic'),
        ('page_students', 'Students', 'Academic'),
        ('page_enrollments', 'Enrollments', 'Academic'),
        # Operations group
        ('page_attendance', 'Attendance', 'Operations'),
        ('page_gradebook', 'Gradebook', 'Operations'),
        # Financial group
        ('page_payments', 'Payments', 'Financial'),
        ('page_expenses', 'Expenses', 'Financial'),
        ('page_revenue', 'Revenue', 'Financial'),
        ('page_teacher_wallet', 'Teacher Wallet', 'Financial'),
        ('page_daily_closures', 'Daily Closures', 'Financial'),
        ('page_pos', 'Point of Sale', 'Financial'),
        # System group
        ('page_ingestion', 'Curriculum Ingestion', 'System'),
        ('page_health', 'System Health', 'System'),
        ('page_backups', 'Database Backups', 'System'),
        ('page_settings', 'Settings', 'System'),
    ]

    perm_ids = {}
    for codename, label, group_name in permissions:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, codename, label, \"group\") "
                "VALUES (gen_random_uuid(), :codename, :label, :group_name)"
            ),
            {"codename": codename, "label": label, "group_name": group_name}
        )

    # Fetch back the permission IDs
    result = conn.execute(sa.text("SELECT id, codename FROM permissions"))
    for row in result.fetchall():
        perm_ids[row[1]] = row[0]

    # 10. Seed role_permissions

    # Manager permissions
    manager_perms = [
        'page_dashboard', 'page_employees', 'page_courses', 'page_sections',
        'page_students', 'page_enrollments', 'page_attendance', 'page_gradebook',
        'page_payments', 'page_expenses', 'page_revenue', 'page_teacher_wallet',
        'page_daily_closures', 'page_pos', 'page_settings',
    ]
    for codename in manager_perms:
        if codename in perm_ids:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :perm_id)"
                ),
                {"role_id": MANAGER_ROLE_ID, "perm_id": perm_ids[codename]}
            )

    # Secretary permissions
    secretary_perms = [
        'page_dashboard', 'page_courses', 'page_sections',
        'page_students', 'page_enrollments', 'page_attendance', 'page_gradebook',
        'page_payments', 'page_expenses', 'page_daily_closures', 'page_pos',
        'page_settings',
    ]
    for codename in secretary_perms:
        if codename in perm_ids:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :perm_id)"
                ),
                {"role_id": SECRETARY_ROLE_ID, "perm_id": perm_ids[codename]}
            )

    # Teacher permissions
    teacher_perms = [
        'page_dashboard', 'page_courses', 'page_sections',
        'page_enrollments', 'page_attendance', 'page_gradebook',
        'page_teacher_wallet', 'page_ingestion', 'page_settings',
    ]
    for codename in teacher_perms:
        if codename in perm_ids:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :perm_id)"
                ),
                {"role_id": TEACHER_ROLE_ID, "perm_id": perm_ids[codename]}
            )


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Restore HR columns to users
    op.add_column('users', sa.Column('phone_number', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('salary', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('hire_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('contract_end_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('address', sa.Text(), nullable=True))

    # Restore HR data from employees
    conn.execute(sa.text("""
        UPDATE users u
        SET phone_number = e.phone_number,
            salary = e.salary,
            hire_date = e.hire_date,
            contract_end_date = e.contract_end_date,
            address = e.address
        FROM employees e
        WHERE u.employee_id = e.id
    """))

    # Reactivate cleaner users
    conn.execute(sa.text("""
        UPDATE users u SET is_active = true
        FROM employees e
        WHERE u.employee_id = e.id AND e.employee_type = 'cleaner'
    """))

    # 2. Restore Expense.recipient_id to users.id
    conn.execute(sa.text("""
        UPDATE expenses SET recipient_id = (
            SELECT u.id FROM users u WHERE u.employee_id = expenses.recipient_id
        )
        WHERE recipient_id IS NOT NULL
    """))

    op.drop_constraint('fk_expenses_recipient_id', 'expenses', type_='foreignkey')
    op.create_foreign_key('fk_expenses_recipient_id', 'expenses', 'users', ['recipient_id'], ['id'], ondelete='SET NULL')

    # 3. Drop role_permissions, permissions, employee_id
    op.drop_table('role_permissions')
    op.drop_table('permissions')
    op.drop_constraint('fk_users_employee_id', 'users', type_='foreignkey')
    op.drop_column('users', 'employee_id')
    op.drop_table('employees')

    # 4. Drop EmployeeType enum
    sa.Enum(name='employeetype').drop(op.get_bind(), checkfirst=True)
