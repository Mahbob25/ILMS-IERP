"""
Phase 1 E2E Test: v1.7 ERP Schema Migration

Verifies:
  - 6 new tables exist (payments, expenses, teacher_wallets, daily_closures)
  - terms table dropped
  - courses has status, teacher_percentage, min_students_required
  - enrollments has agreed_price, admin_discount
  - course_sections has no term_id
  - Proper ENUM types exist
  - Downgrade restores original schema
  - Upgrade re-applies cleanly
  - Backend health check passes
"""

import sys
import os
import subprocess

import psycopg
import httpx

ok = 0
fail = 0

DB_URL = "postgresql://lims:lims_secure_pass@localhost:5440/lims"
BASE = 'http://localhost:8000'

EXPECTED_NEW_TABLES = {'payments', 'expenses', 'teacher_wallets', 'daily_closures'}
EXPECTED_NEW_COURSE_COLS = {'status', 'teacher_percentage', 'min_students_required'}
EXPECTED_NEW_ENROLLMENT_COLS = {'agreed_price', 'admin_discount'}
EXPECTED_ENUM_TYPES = {'coursestatus', 'expensetype', 'closurystatus'}


def test(name, ok_cond, detail=''):
    global ok, fail
    if ok_cond:
        print(f'  PASS  {name}')
        ok += 1
    else:
        print(f'  FAIL  {name}' + (f'  -- {detail}' if detail else ''))
        fail += 1


def get_conn():
    return psycopg.connect(DB_URL)


def get_all_tables(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
        return {r[0] for r in cur.fetchall()}


def get_columns(conn, table):
    with conn.cursor() as cur:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
        return {r[0] for r in cur.fetchall()}


def get_enums(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT typname FROM pg_type WHERE typtype='e'")
        return {r[0] for r in cur.fetchall()}


def get_alembic_head(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT version_num FROM alembic_version")
        return cur.fetchone()[0]


print('=' * 60)
print('PHASE 1 END-TO-END TEST: v1.7 ERP Schema Migration')
print('=' * 60)
print()

# === SECTION 1: Verify migration state ===
print('--- Migration State ---')
with get_conn() as conn:
    head = get_alembic_head(conn)
    test('Alembic head is 202606260000', head == '202606260000', f'got {head}')
print()

# === SECTION 2: Verify new tables exist ===
print('--- New Tables ---')
with get_conn() as conn:
    tables = get_all_tables(conn)
    for t in EXPECTED_NEW_TABLES:
        test(f'Table {t} exists', t in tables, f'missing: {t}')
    test('terms table is dropped', 'terms' not in tables)
print()

# === SECTION 3: Verify courses columns ===
print('--- Courses Columns ---')
with get_conn() as conn:
    cols = get_columns(conn, 'courses')
    for c in EXPECTED_NEW_COURSE_COLS:
        test(f'courses.{c} exists', c in cols, f'missing: {c}')
    test('courses.term_id is removed', 'term_id' not in cols)
print()

# === SECTION 4: Verify enrollments columns ===
print('--- Enrollments Columns ---')
with get_conn() as conn:
    cols = get_columns(conn, 'enrollments')
    for c in EXPECTED_NEW_ENROLLMENT_COLS:
        test(f'enrollments.{c} exists', c in cols, f'missing: {c}')
print()

# === SECTION 5: Verify course_sections has no term_id ===
print('--- Course Sections ---')
with get_conn() as conn:
    cols = get_columns(conn, 'course_sections')
    test('course_sections.term_id is removed', 'term_id' not in cols)
    test('course_sections.course_id still exists', 'course_id' in cols)
    test('course_sections.teacher_id still exists', 'teacher_id' in cols)
print()

# === SECTION 6: Verify ENUM types ===
print('--- ENUM Types ---')
with get_conn() as conn:
    enums = get_enums(conn)
    for e in EXPECTED_ENUM_TYPES:
        test(f'ENUM {e} exists', e in enums, f'missing: {e}')
print()

# === SECTION 7: Verify backend health ===
print('--- Backend Health ---')
try:
    r = httpx.get(f'{BASE}/api/v1/health', timeout=10)
    test('Backend health endpoint responds', r.status_code == 200, f'got {r.status_code}')
    data = r.json()
    test('Health reports version 1.7', data.get('version') == '1.7', f'got {data.get("version")}')
except Exception as e:
    test('Backend health endpoint responds', False, str(e))
print()

# === SECTION 8: Test downgrade/upgrade cycle ===
print('--- Downgrade/Upgrade Cycle ---')
# Downgrade
alembic_python = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.venv', 'Scripts', 'python.exe')
if not os.path.exists(alembic_python):
    alembic_python = sys.executable

result = subprocess.run(
    [alembic_python, '-m', 'alembic', 'downgrade', '-1'],
    capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
)
test('Downgrade exits cleanly', result.returncode == 0, result.stderr[:200])

with get_conn() as conn:
    head = get_alembic_head(conn)
    test('Alembic head after downgrade is 202606250000', head == '202606250000', f'got {head}')
    tables = get_all_tables(conn)
    test('terms restored after downgrade', 'terms' in tables)
    cols_course = get_columns(conn, 'courses')
    for c in EXPECTED_NEW_COURSE_COLS:
        test(f'courses.{c} removed after downgrade', c not in cols_course)

# Re-upgrade
result = subprocess.run(
    [alembic_python, '-m', 'alembic', 'upgrade', 'head'],
    capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
)
test('Re-upgrade exits cleanly', result.returncode == 0, result.stderr[:200])

with get_conn() as conn:
    head = get_alembic_head(conn)
    test('Alembic head after re-upgrade is 202606260000', head == '202606260000', f'got {head}')
    tables = get_all_tables(conn)
    for t in EXPECTED_NEW_TABLES:
        test(f'Table {t} restored after re-upgrade', t in tables)
print()

print(f'=== RESULTS: {ok} passed, {fail} failed ===')
if fail > 0:
    sys.exit(1)
