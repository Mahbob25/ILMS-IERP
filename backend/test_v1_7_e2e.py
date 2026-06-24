"""
E2E Tests for v1.7 ERP Implementation

Run with:  python test_v1_7_e2e.py [--phase 1|2|all]

Phases:
  1 - Schema migration (tables, columns, enums, downgrade cycle)
  2 - RBAC refinement (roles, gates, /auth/me, role enforcement)
"""

import sys
import os
import subprocess
import argparse

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
EXPECTED_ROLES = {'superadmin', 'manager', 'secretary', 'teacher'}


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

# Current expected head after Phase 2 migration
CURRENT_HEAD = '202606260001'
# Previous head (Phase 1 only, before role migration)
PREVIOUS_HEAD = '202606260000'
# Head before Phase 1 (original schema)
BASE_HEAD = '202606250000'


def get_roles(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM roles ORDER BY name")
        return {r[0] for r in cur.fetchall()}


def login(email, password):
    """Login and return (client, access_token)."""
    client = httpx.Client(base_url=BASE)
    r = client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    if r.status_code == 200:
        # httpx on Windows maps localhost -> localhost.local in cookie jar,
        # breaking automatic cookie forwarding. Extract token manually.
        for cookie in r.headers.get_list("set-cookie"):
            if cookie.startswith("access_token="):
                token = cookie.split(";")[0].split("=", 1)[1]
                return client, token
    return client, None


def authed_client(token):
    """Return an httpx.Client that sends the access_token Cookie header."""
    client = httpx.Client(base_url=BASE)
    client.headers["Cookie"] = f"access_token={token}"
    return client


# ─────────────────────────────────────────────
# PHASE 1: Schema Migration
# ─────────────────────────────────────────────
def run_phase1():
    print('=' * 60)
    print('PHASE 1: v1.7 ERP Schema Migration')
    print('=' * 60)
    print()

    # --- Migration State ---
    print('--- Migration State ---')
    with get_conn() as conn:
        head = get_alembic_head(conn)
        test(f'Alembic head is {CURRENT_HEAD}', head == CURRENT_HEAD, f'got {head}')
    print()

    # --- New Tables ---
    print('--- New Tables ---')
    with get_conn() as conn:
        tables = get_all_tables(conn)
        for t in EXPECTED_NEW_TABLES:
            test(f'Table {t} exists', t in tables, f'missing: {t}')
        test('terms table is dropped', 'terms' not in tables)
    print()

    # --- Courses Columns ---
    print('--- Courses Columns ---')
    with get_conn() as conn:
        cols = get_columns(conn, 'courses')
        for c in EXPECTED_NEW_COURSE_COLS:
            test(f'courses.{c} exists', c in cols, f'missing: {c}')
        test('courses.term_id is removed', 'term_id' not in cols)
    print()

    # --- Enrollments Columns ---
    print('--- Enrollments Columns ---')
    with get_conn() as conn:
        cols = get_columns(conn, 'enrollments')
        for c in EXPECTED_NEW_ENROLLMENT_COLS:
            test(f'enrollments.{c} exists', c in cols, f'missing: {c}')
    print()

    # --- Course Sections ---
    print('--- Course Sections ---')
    with get_conn() as conn:
        cols = get_columns(conn, 'course_sections')
        test('course_sections.term_id is removed', 'term_id' not in cols)
        test('course_sections.course_id still exists', 'course_id' in cols)
        test('course_sections.teacher_id still exists', 'teacher_id' in cols)
    print()

    # --- ENUM Types ---
    print('--- ENUM Types ---')
    with get_conn() as conn:
        enums = get_enums(conn)
        for e in EXPECTED_ENUM_TYPES:
            test(f'ENUM {e} exists', e in enums, f'missing: {e}')
    print()

    # --- Backend Health ---
    print('--- Backend Health ---')
    try:
        r = httpx.get(f'{BASE}/api/v1/health', timeout=10)
        test('Backend health responds', r.status_code == 200, f'got {r.status_code}')
        data = r.json()
        test('Health version 1.7', data.get('version') == '1.7', f'got {data.get("version")}')
    except Exception as e:
        test('Backend health responds', False, str(e))
    print()

    # --- Downgrade/Upgrade Cycle ---
    print('--- Downgrade/Upgrade Cycle ---')
    alembic_python = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.venv', 'Scripts', 'python.exe')
    if not os.path.exists(alembic_python):
        alembic_python = sys.executable

    # Downgrade 2 steps back to base (before Phase 1)
    result = subprocess.run(
        [alembic_python, '-m', 'alembic', 'downgrade', BASE_HEAD],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
    )
    test('Downgrade to base exits cleanly', result.returncode == 0, result.stderr[:200])

    with get_conn() as conn:
        head = get_alembic_head(conn)
        test(f'Head after downgrade is {BASE_HEAD}', head == BASE_HEAD, f'got {head}')
        tables = get_all_tables(conn)
        test('terms restored after downgrade', 'terms' in tables)
        for c in EXPECTED_NEW_COURSE_COLS:
            test(f'courses.{c} removed after downgrade', c not in get_columns(conn, 'courses'))

    # Upgrade back to current head
    result = subprocess.run(
        [alembic_python, '-m', 'alembic', 'upgrade', 'head'],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
    )
    test('Re-upgrade to head exits cleanly', result.returncode == 0, result.stderr[:200])

    with get_conn() as conn:
        head = get_alembic_head(conn)
        test(f'Head after re-upgrade is {CURRENT_HEAD}', head == CURRENT_HEAD, f'got {head}')
        tables = get_all_tables(conn)
        for t in EXPECTED_NEW_TABLES:
            test(f'Table {t} restored after re-upgrade', t in tables)
    print()


# ─────────────────────────────────────────────
# PHASE 2: RBAC Refinement
# ─────────────────────────────────────────────
def run_phase2():
    print('=' * 60)
    print('PHASE 2: RBAC Refinement & Role Gates')
    print('=' * 60)
    print()

    # --- Roles in DB ---
    print('--- Roles in Database ---')
    with get_conn() as conn:
        roles = get_roles(conn)
        for r in EXPECTED_ROLES:
            test(f'Role "{r}" exists', r in roles, f'missing role: {r}')
    print()

    # --- /auth/me endpoint ---
    print('--- /auth/me Endpoint ---')
    try:
        client, token = login('superadmin@institute.dev', 'admin123')
        test('Login as superadmin succeeds', token is not None)
        if token:
            aclient = authed_client(token)
            r = aclient.get('/api/v1/auth/me')
            test('/auth/me returns 200', r.status_code == 200, f'got {r.status_code}')
            data = r.json()
            test('/auth/me has id', 'id' in data)
            test('/auth/me has email', data.get('email') == 'superadmin@institute.dev')
            test('/auth/me has role superadmin', data.get('role') == 'superadmin')
            test('/auth/me has is_superadmin true', data.get('is_superadmin') is True)
            aclient.close()
        client.close()
    except Exception as e:
        test('/auth/me works', False, str(e))

    # --- Role gate enforcement ---
    print()
    print('--- Role Gate Enforcement ---')
    try:
        # Login as teacher
        client, token = login('teacher.ee3f04@institute.dev', 'teacher123')
        test('Login as teacher succeeds', token is not None)

        if token:
            aclient = authed_client(token)
            # Teacher should be able to access /auth/me
            r = aclient.get('/api/v1/auth/me')
            test('Teacher can access /auth/me', r.status_code == 200, f'got {r.status_code}')

            # Teacher should NOT be able to create users (requires manager+)
            r = aclient.post('/api/v1/users', json={})
            test('Teacher cannot create users (403)', r.status_code == 403, f'got {r.status_code}')
            aclient.close()
        client.close()
    except Exception as e:
        test('Role gate tests work', False, str(e))

    # --- Auth guard (unauthenticated) ---
    print()
    print('--- Unauthenticated Access ---')
    try:
        anon = httpx.Client(base_url=BASE)
        r = anon.get('/api/v1/auth/me')
        test('Unauthenticated /auth/me returns 401', r.status_code == 401, f'got {r.status_code}')

        r = anon.get('/api/v1/users')
        test('Unauthenticated /users returns 401', r.status_code == 401, f'got {r.status_code}')

        r = anon.get('/api/v1/academic/courses')
        test('Unauthenticated /academic/courses returns 401', r.status_code == 401, f'got {r.status_code}')
        anon.close()
    except Exception as e:
        test('Unauthenticated access tests', False, str(e))

    # --- Migration rollback test ---
    print()
    print('--- Role Migration Rollback ---')
    alembic_python = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.venv', 'Scripts', 'python.exe')
    if not os.path.exists(alembic_python):
        alembic_python = sys.executable

    result = subprocess.run(
        [alembic_python, '-m', 'alembic', 'downgrade', '-1'],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
    )
    test('Downgrade exits cleanly', result.returncode == 0, result.stderr[:200])

    with get_conn() as conn:
        roles = get_roles(conn)
        test('admin restored after downgrade', 'admin' in roles)
        test('secretary removed after downgrade', 'secretary' not in roles)

    result = subprocess.run(
        [alembic_python, '-m', 'alembic', 'upgrade', 'head'],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))
    )
    test('Re-upgrade exits cleanly', result.returncode == 0, result.stderr[:200])

    with get_conn() as conn:
        roles = get_roles(conn)
        for r in EXPECTED_ROLES:
            test(f'Role "{r}" restored after re-upgrade', r in roles)
    print()


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', default='all', choices=['1', '2', 'all'])
    args = parser.parse_args()

    if args.phase in ('1', 'all'):
        run_phase1()

    if args.phase in ('2', 'all'):
        run_phase2()

    print(f'=== RESULTS: {ok} passed, {fail} failed ===')
    if fail > 0:
        sys.exit(1)
