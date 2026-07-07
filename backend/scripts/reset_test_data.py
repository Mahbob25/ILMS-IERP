"""
Reset test data script.

Deletes all test data from the database while preserving:
  - Superadmin user and their linked employee record
  - Seed data: roles, permissions, role_permissions

Usage:
    python scripts/reset_test_data.py --confirm

Dry-run mode (shows what would be deleted):
    python scripts/reset_test_data.py --dry-run --confirm
"""

import argparse
import sys
from dataclasses import dataclass, field
from typing import Optional

import psycopg

sys.path.insert(0, ".")  # noqa: PTH022

from app.core.config import settings  # noqa: E402


DELETE_ORDER = [
    # Academic & LMS leaf tables (deepest FK dependencies first)
    "grades",                    # FK → submissions (CASCADE)
    "submissions",               # FK → assignments, students (CASCADE)
    "assignments",               # FK → course_sections (CASCADE)
    "attendance_records",        # FK → attendance_sessions, students (CASCADE)
    "attendance_sessions",       # FK → course_sections (CASCADE), users (RESTRICT)
    "final_grades",              # FK → course_sections, students, users (RESTRICT)
    "certificates",              # FK → students, course_sections, enrollments (RESTRICT)
    "payments",                  # FK → enrollments (RESTRICT)
    "enrollments",               # FK → students, course_sections (CASCADE)
    "students",                  # No FKs to other non-seed tables
    "course_sections",           # FK → courses (CASCADE), employees (RESTRICT)
    "courses",                   # No FKs to other non-seed tables
    # Identity & financial tables
    "daily_closures",            # FK → users (SET NULL)
    "refresh_tokens",            # FK → users (CASCADE)
    "audit_logs",                # FK → users (SET NULL)
    "teacher_wallets",           # FK → employees (CASCADE)
    "expenses",                  # FK → employees (SET NULL)
]

KEEP_TABLES = {
    "roles": "seed data (system roles)",
    "permissions": "seed data (system permissions)",
    "role_permissions": "seed data (role-permission mappings)",
}


@dataclass
class DeletionResult:
    rows_deleted: dict[str, int] = field(default_factory=dict)
    superadmin_user_id: Optional[str] = None
    superadmin_employee_id: Optional[str] = None
    errors: list[str] = field(default_factory=list)


def get_superadmin_ids(conn: psycopg.Connection) -> tuple[Optional[str], Optional[str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id::text, employee_id::text FROM users "
            "WHERE is_superadmin = true LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            return row[0], row[1]
        return None, None


def count_rows(conn: psycopg.Connection, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        return cur.fetchone()[0]


def delete_table(conn: psycopg.Connection, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table}")
        return cur.rowcount


def run(conn: psycopg.Connection, dry_run: bool) -> DeletionResult:
    result = DeletionResult()

    user_id, employee_id = get_superadmin_ids(conn)
    result.superadmin_user_id = user_id
    result.superadmin_employee_id = employee_id

    if not user_id:
        result.errors.append("No superadmin user found — aborting.")
        return result

    total_before = {}
    for table in DELETE_ORDER:
        total_before[table] = count_rows(conn, table)

    if dry_run:
        result.rows_deleted = total_before
        return result

    for table in DELETE_ORDER:
        try:
            count = delete_table(conn, table)
            result.rows_deleted[table] = count
        except psycopg.Error as exc:
            result.errors.append(f"Failed to delete {table}: {exc}")

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM users WHERE id != %s::uuid",
            (user_id,),
        )
        result.rows_deleted["users"] = cur.rowcount

    if employee_id:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM employees WHERE id != %s::uuid",
                (employee_id,),
            )
            result.rows_deleted["employees"] = cur.rowcount
    else:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM employees")
            result.rows_deleted["employees"] = cur.rowcount

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete all test data from the database, keeping only the superadmin."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually execute the deletion (without this, only shows summary)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without actually deleting",
    )
    args = parser.parse_args()

    if not args.confirm:
        print("ERROR: --confirm is required to proceed.")
        print("Run with --dry-run --confirm to preview, or --confirm to execute.")
        sys.exit(1)

    conn_str = settings.sync_database_url
    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            db_name = cur.fetchone()[0]

        print(f"Database: {db_name}")
        print()

        if args.dry_run:
            print("=== DRY RUN — no data will be deleted ===")
            print()
            result = run(conn, dry_run=True)
        else:
            result = run(conn, dry_run=False)

        print(f"Superadmin user ID: {result.superadmin_user_id}")
        print(f"Superadmin employee ID: {result.superadmin_employee_id or '(none)'}")
        print()

        if result.errors:
            print("ERRORS:")
            for err in result.errors:
                print(f"  - {err}")
            print()

        print("Rows to delete / deleted:")
        all_tables = DELETE_ORDER + ["users", "employees"]
        total = 0
        for table in all_tables:
            count = result.rows_deleted.get(table, 0)
            print(f"  {table}: {count}")
            total += count

        for table, reason in KEEP_TABLES.items():
            print(f"  {table}: KEPT ({reason})")

        print()
        print(f"Total rows affected: {total}")

        if args.dry_run:
            print()
            print("=== DRY RUN complete — no data was changed ===")
        else:
            conn.commit()
            print()
            print("Done. All test data has been removed.")


if __name__ == "__main__":
    main()
