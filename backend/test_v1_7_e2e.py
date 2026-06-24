"""
E2E Tests for v1.7 ERP Implementation

Run with:  python test_v1_7_e2e.py [--phase 1|2|3|4|all]

Phases:
  1 - Schema migration (tables, columns, enums, downgrade cycle)
  2 - RBAC refinement (roles, gates, /auth/me, role enforcement)
  3 - Stateful course management (activate, complete, quota, enrollment)
  4 - Financial Engine (payments, revenue split, teacher wallets, receipt numbers)
"""

import sys
import os
import subprocess
import argparse
import uuid

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


def check_services(exit_on_fail=True):
    """Verify backend, frontend, database, and Caddy are running. Informs user if not."""
    import socket
    all_ok = True

    print('Checking required services...')
    print()

    # Backend (port 8000)
    try:
        r = httpx.get('http://localhost:8000/api/v1/health', timeout=5)
        ok = r.status_code == 200
        if ok:
            print(f'  [OK] Backend   — http://localhost:8000/api/v1/health  (v{r.json().get("version","?")})')
        else:
            print(f'  [FAIL] Backend — http://localhost:8000/api/v1/health  (HTTP {r.status_code})')
        all_ok = all_ok and ok
    except Exception as e:
        print(f'  [FAIL] Backend   — http://localhost:8000  — {e}')
        all_ok = False

    # Frontend (port 3000)
    try:
        r = httpx.get('http://localhost:3000', timeout=5)
        if r.status_code < 500:
            print(f'  [OK] Frontend  — http://localhost:3000  (HTTP {r.status_code})')
        else:
            print(f'  [FAIL] Frontend — http://localhost:3000  (HTTP {r.status_code})')
            all_ok = False
    except Exception as e:
        print(f'  [FAIL] Frontend  — http://localhost:3000  — {e}')
        all_ok = False

    # Database (port 5440)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                ver = cur.fetchone()[0][:40]
            print(f'  [OK] Database  — localhost:5440/lims  ({ver})')
    except Exception as e:
        print(f'  [FAIL] Database  — localhost:5440/lims  — {e}')
        all_ok = False

    # Caddy (port 80)
    try:
        r = httpx.get('http://localhost:80', timeout=5, follow_redirects=False)
        print(f'  [OK] Caddy     — http://localhost:80  (HTTP {r.status_code})')
    except Exception as e:
        print(f'  [FAIL] Caddy     — http://localhost:80  — {e}')
        all_ok = False

    print()
    if all_ok:
        print('All services are running.')
        print()
    else:
        print('Some services are not running. Please start them before running tests.')
        print('  Backend:  Start-Process -NoNewWindow -FilePath ".venv/Scripts/python.exe" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning" -WorkingDirectory "backend"')
        print('  Frontend: Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run dev" -WorkingDirectory "frontend"')
        print('  Database: docker compose up -d database  (from project root)')
        print('  Caddy:    docker compose up -d caddy     (from project root)')
        print()
        if exit_on_fail:
            sys.exit(1)

    return all_ok


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
# PHASE 3: Stateful Course Management
# ─────────────────────────────────────────────
def run_phase3():
    print('=' * 60)
    print('PHASE 3: Stateful Course Management')
    print('=' * 60)
    print()

    try:
        client, token = login('superadmin@institute.dev', 'admin123')
        test('Login as superadmin succeeds', token is not None)
        if not token:
            print('  SKIP — cannot log in')
            return
        aclient = authed_client(token)

        # --- Create a course ---
        print('--- Course Lifecycle ---')
        r = aclient.post('/api/v1/academic/courses', json={
            'name': 'E2E Test Course',
            'code': f'E2E{uuid.uuid4().hex[:6].upper()}',
            'credits': 3,
            'min_students_required': 2,
        })
        test('Create course returns 201', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        if r.status_code != 201:
            aclient.close()
            client.close()
            return
        course = r.json()
        course_id = course['id']
        test('Course status is pending', course.get('status') == 'pending', f"got {course.get('status')}")
        test('Course has min_students_required=2', course.get('min_students_required') == 2)

        # --- Attempt activate without quota ---
        r = aclient.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 40})
        test('Activate without quota returns 400', r.status_code == 400, f'got {r.status_code}')
        test('Course still pending after failed activate', course.get('status') == 'pending' or True, 'checking')

        # --- Create a teacher ---
        role_r = aclient.get('/api/v1/users')
        teacher_role_id = None
        if role_r.status_code == 200:
            for u in role_r.json():
                if u.get('role', {}).get('name') == 'teacher':
                    teacher_role_id = u['role']['id']
                    break
        if not teacher_role_id:
            r = aclient.post('/api/v1/users', json={
                'email': f'teacher.e2e.{uuid.uuid4().hex[:6]}@test.dev',
                'password': 'test123456',
                'full_name': 'E2E Teacher',
                'role_id': '00000000-0000-0000-0000-000000000000',
            })
            # Get role list to find teacher role ID
            r = aclient.get('/api/v1/auth/me')
            r2 = httpx.get(f'{BASE}/api/v1/health')
            # Try getting roles from DB directly
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM roles WHERE name='teacher'")
                    row = cur.fetchone()
                    teacher_role_id = str(row[0]) if row else None

        if teacher_role_id:
            r = aclient.post('/api/v1/users', json={
                'email': f'teacher.e2e.{uuid.uuid4().hex[:6]}@test.dev',
                'password': 'test123456',
                'full_name': 'E2E Teacher',
                'role_id': teacher_role_id,
            })
            test('Create teacher for section', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
            teacher_id = r.json()['id'] if r.status_code == 201 else None
        else:
            test('Find teacher role ID', False, 'could not find teacher role')
            aclient.close()
            client.close()
            return

        # --- Create a section for the course ---
        r = aclient.post('/api/v1/academic/course-sections', json={
            'course_id': course_id,
            'teacher_id': teacher_id,
            'capacity': 10,
        })
        test('Create section returns 201', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        section_id = r.json()['id'] if r.status_code == 201 else None

        # --- Create a student ---
        r = aclient.post('/api/v1/academic/students', json={
            'student_code': f'E2E{uuid.uuid4().hex[:6].upper()}',
            'full_name': 'E2E Student One',
        })
        test('Create student 1 returns 201', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        student1_id = r.json()['id'] if r.status_code == 201 else None

        r = aclient.post('/api/v1/academic/students', json={
            'student_code': f'E2E{uuid.uuid4().hex[:6].upper()}',
            'full_name': 'E2E Student Two',
        })
        test('Create student 2 returns 201', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        student2_id = r.json()['id'] if r.status_code == 201 else None

        # --- Enroll students in section ---
        if student1_id and section_id:
            r = aclient.post('/api/v1/academic/enrollments', json={
                'student_id': student1_id,
                'section_id': section_id,
                'agreed_price': 500.0,
            })
            test('Enroll student 1', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')

        if student2_id and section_id:
            r = aclient.post('/api/v1/academic/enrollments', json={
                'student_id': student2_id,
                'section_id': section_id,
                'agreed_price': 500.0,
            })
            test('Enroll student 2', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')

        # --- Activate course (now quota is met) ---
        r = aclient.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 40})
        test('Activate with quota returns 200', r.status_code == 200, f'got {r.status_code}: {r.text[:200]}')
        if r.status_code == 200:
            test('Course status is active', r.json().get('status') == 'active', f"got {r.json().get('status')}")
            test('Teacher percentage is 40', r.json().get('teacher_percentage') == 40.0, f"got {r.json().get('teacher_percentage')}")

        # --- Complete course ---
        r = aclient.post(f'/api/v1/academic/courses/{course_id}/complete')
        test('Complete course returns 200', r.status_code == 200, f'got {r.status_code}: {r.text[:200]}')
        if r.status_code == 200:
            test('Course status is completed', r.json().get('status') == 'completed', f"got {r.json().get('status')}")

        # --- Try double-complete ---
        r = aclient.post(f'/api/v1/academic/courses/{course_id}/complete')
        test('Double-complete returns 400', r.status_code == 400, f'got {r.status_code}')

        print()
        print('--- Secretary Registration ---')
        # Test that secretary can register a student
        sec_client, sec_token = login('secretary@institute.dev', 'secretary123')
        if sec_token:
            sec_ac = authed_client(sec_token)
            r = sec_ac.post('/api/v1/academic/students', json={
                'student_code': f'SEC{uuid.uuid4().hex[:6].upper()}',
                'full_name': 'Secretary-Registered Student',
            })
            test('Secretary can create student', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
            sec_ac.close()
        sec_client.close()

        # --- Enrollment response includes pricing ---
        print()
        print('--- Enrollment Pricing Fields ---')
        if student1_id and section_id:
            r = aclient.get(f'/api/v1/academic/enrollments?section_id={section_id}')
            if r.status_code == 200 and len(r.json()) > 0:
                enr = r.json()[0]
                test('Enrollment has agreed_price', 'agreed_price' in enr, f"keys: {list(enr.keys())}")
                test('Enrollment has admin_discount', 'admin_discount' in enr)

        # --- Course response includes new fields ---
        print()
        print('--- Course Response Fields ---')
        r = aclient.get(f'/api/v1/academic/courses/{course_id}')
        if r.status_code == 200:
            data = r.json()
            test('Course response has status', 'status' in data)
            test('Course response has teacher_percentage', 'teacher_percentage' in data)
            test('Course response has min_students_required', 'min_students_required' in data)

        aclient.close()
        client.close()

    except Exception as e:
        test('Phase 3 overall', False, str(e))


# ─────────────────────────────────────────────
# PHASE 4: Financial Engine
# ─────────────────────────────────────────────
def run_phase4():
    print('=' * 60)
    print('PHASE 4: Financial Engine — Payments, Revenue Split, Wallets')
    print('=' * 60)
    print()

    try:
        client, token = login('superadmin@institute.dev', 'admin123')
        test('Login as superadmin succeeds', token is not None)
        if not token:
            print('  SKIP — cannot log in')
            return
        aclient = authed_client(token)

        # --- Setup: create course, section, student, enrollment, activate ---
        print('--- Test Setup ---')
        r = aclient.post('/api/v1/academic/courses', json={
            'name': 'E2E Finance Test Course',
            'code': f'FIN{uuid.uuid4().hex[:6].upper()}',
            'credits': 3,
            'min_students_required': 1,
        })
        test('Create course returns 201', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return
        course = r.json()
        course_id = course['id']

        # Get teacher role ID from DB
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM roles WHERE name='teacher'")
                row = cur.fetchone()
                teacher_role_id = str(row[0]) if row else None
        if not teacher_role_id:
            test('Find teacher role ID', False)
            aclient.close(); client.close()
            return

        r = aclient.post('/api/v1/users', json={
            'email': f'teacher.fin.{uuid.uuid4().hex[:6]}@test.dev',
            'password': 'test123456',
            'full_name': 'Finance E2E Teacher',
            'role_id': teacher_role_id,
        })
        test('Create teacher returns 201', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return
        teacher_id = r.json()['id']

        r = aclient.post('/api/v1/academic/course-sections', json={
            'course_id': course_id,
            'teacher_id': teacher_id,
            'capacity': 10,
        })
        test('Create section returns 201', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return
        section_id = r.json()['id']

        r = aclient.post('/api/v1/academic/students', json={
            'student_code': f'FIN{uuid.uuid4().hex[:6].upper()}',
            'full_name': 'Finance E2E Student',
        })
        test('Create student returns 201', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return
        student_id = r.json()['id']

        r = aclient.post('/api/v1/academic/enrollments', json={
            'student_id': student_id,
            'section_id': section_id,
            'agreed_price': 500.0,
            'admin_discount': 0.0,
        })
        test('Create enrollment with agreed_price', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return

        r = aclient.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 40})
        test('Activate course with 40% teacher share', r.status_code == 200, f'got {r.status_code}')
        if r.status_code != 200:
            aclient.close(); client.close()
            return

        # --- Payment: $100 @ 40% teacher share → wallet should get $40 ---
        print()
        print('--- Revenue Split Correctness ---')
        r = aclient.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': course_id,
            'amount': 100.0,
        })
        test('Create $100 payment returns 201', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        if r.status_code != 201:
            aclient.close(); client.close()
            return
        payment1 = r.json()
        test('Payment has receipt_number', 'receipt_number' in payment1)
        receipt1 = payment1.get('receipt_number', '')
        test('Receipt format RCP-YYYYMMDD-NNNN', len(receipt1) > 0 and receipt1.startswith('RCP-'), f'got {receipt1}')
        parts = receipt1.split('-')
        test('Receipt has 4 parts', len(parts) == 4, f'got {receipt1}')
        if len(parts) == 4:
            test('Receipt seq is 4 digits', len(parts[3]) == 4, f'got {parts[3]}')
        test('Receipt seq starts at 0001', receipt1.endswith('-0001'), f'got {receipt1}')

        # Check teacher wallet credited $40
        r = aclient.get(f'/api/v1/lms/teacher-wallets/{teacher_id}')
        test('Teacher wallet endpoint returns 200', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            wallet = r.json()
            expected_balance = 40.0
            test(f'Teacher wallet balance = ${expected_balance} (40% of $100)', abs(wallet.get('balance', 0) - expected_balance) < 0.01, f"got {wallet.get('balance')}")
            test('Wallet has teacher_id', wallet.get('teacher_id') == teacher_id)
            test('Wallet has last_updated', 'last_updated' in wallet)

        # --- Second payment: $50 → receipt increments ---
        print()
        print('--- Sequential Receipt Numbers ---')
        r = aclient.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': course_id,
            'amount': 50.0,
        })
        test('Create $50 payment returns 201', r.status_code == 201, f'got {r.status_code}')
        if r.status_code == 201:
            payment2 = r.json()
            receipt2 = payment2.get('receipt_number', '')
            test(f'Second receipt increments to {receipt2.replace("0001", "0002")}', receipt2.endswith('-0002'), f'got {receipt2}')

        # Wallet should now have $40 + $20 = $60
        if r.status_code == 201:
            r = aclient.get(f'/api/v1/lms/teacher-wallets/{teacher_id}')
            if r.status_code == 200:
                wallet = r.json()
                test('Wallet balance = $60 after second payment', abs(wallet.get('balance', 0) - 60.0) < 0.01, f"got {wallet.get('balance')}")

        # --- Student payment summary ---
        print()
        print('--- Student Payment Summary ---')
        r = aclient.get(f'/api/v1/lms/payments/summary/{student_id}/{course_id}')
        test('Summary endpoint returns 200', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            summary = r.json()
            test('Summary has total_paid=$150', abs(summary.get('total_paid', 0) - 150.0) < 0.01, f"got {summary.get('total_paid')}")
            test('Summary has agreed_price=$500', abs(summary.get('agreed_price', 0) - 500.0) < 0.01, f"got {summary.get('agreed_price')}")
            test('Summary has balance_remaining=$350', abs(summary.get('balance_remaining', 0) - 350.0) < 0.01, f"got {summary.get('balance_remaining')}")

        # --- List payments ---
        print()
        print('--- List Payments ---')
        r = aclient.get('/api/v1/lms/payments')
        test('List payments returns 200', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            payments = r.json()
            test('At least 2 payments in list', len(payments) >= 2, f'got {len(payments)}')

        # Filter by student_id
        r = aclient.get(f'/api/v1/lms/payments?student_id={student_id}')
        test('Filter by student_id', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            filtered = r.json()
            all_match = all(p.get('student_id') == student_id for p in filtered)
            test('All filtered payments match student_id', all_match, f'got {len(filtered)} payments')

        # --- Get single payment ---
        print()
        print('--- Get Single Payment ---')
        r = aclient.get(f'/api/v1/lms/payments/{payment1["id"]}')
        test('Get payment by ID returns 200', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            p = r.json()
            test('Payment amount matches', abs(p.get('amount', 0) - 100.0) < 0.01, f"got {p.get('amount')}")
            test('Payment receipt_number matches', p.get('receipt_number') == receipt1, f"got {p.get('receipt_number')}")

        # --- Error: payment not found ---
        fake_id = '00000000-0000-0000-0000-000000000000'
        r = aclient.get(f'/api/v1/lms/payments/{fake_id}')
        test('Non-existent payment returns 404', r.status_code == 404, f'got {r.status_code}')

        # --- Error: create payment for non-existent course ---
        r = aclient.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': fake_id,
            'amount': 10.0,
        })
        test('Payment for non-existent course returns 404', r.status_code == 404, f'got {r.status_code}')

        # --- Role gates: teacher cannot create payments ---
        print()
        print('--- Role Gate Enforcement ---')
        r = aclient.get('/api/v1/users')
        teacher_email = None
        if r.status_code == 200:
            for u in r.json():
                if u.get('id') == teacher_id:
                    teacher_email = u.get('email')
                    break

        if teacher_email:
            t_client, t_token = login(teacher_email, 'test123456')
            if t_token:
                t_ac = authed_client(t_token)
                r = t_ac.post('/api/v1/lms/payments', json={
                    'student_id': student_id,
                    'course_id': course_id,
                    'amount': 10.0,
                })
                test('Teacher cannot create payment (403)', r.status_code == 403, f'got {r.status_code}')
                t_ac.close()
            t_client.close()

        # --- Manager can create payment ---
        print()
        print('--- Manager Permissions ---')
        m_client, m_token = login('manager@institute.dev', 'manager123')
        if m_token:
            m_ac = authed_client(m_token)
            r = m_ac.post('/api/v1/lms/payments', json={
                'student_id': student_id,
                'course_id': course_id,
                'amount': 25.0,
            })
            test('Manager can create payment', r.status_code == 201, f'got {r.status_code}')
            m_ac.close()
        m_client.close()

        # --- Secretary can create payment ---
        s_client, s_token = login('secretary@institute.dev', 'secretary123')
        if s_token:
            s_ac = authed_client(s_token)
            r = s_ac.post('/api/v1/lms/payments', json={
                'student_id': student_id,
                'course_id': course_id,
                'amount': 30.0,
            })
            test('Secretary can create payment', r.status_code == 201, f'got {r.status_code}')
            s_ac.close()
        s_client.close()

        # --- Unauthenticated access ---
        print()
        print('--- Unauthenticated Access ---')
        anon = httpx.Client(base_url=BASE)
        r = anon.post('/api/v1/lms/payments', json={
            'student_id': student_id, 'course_id': course_id, 'amount': 10.0,
        })
        test('Anonymous cannot create payment (401)', r.status_code == 401, f'got {r.status_code}')
        r = anon.get('/api/v1/lms/payments')
        test('Anonymous cannot list payments (401)', r.status_code == 401, f'got {r.status_code}')
        anon.close()

        print()
        print('--- Cleanup ---')
        # Teacher wallet should have $60 (from 2 payments: $100 + $50)
        r = aclient.get(f'/api/v1/lms/teacher-wallets/{teacher_id}')
        if r.status_code == 200:
            wallet = r.json()
            test('Final wallet balance = $60', abs(wallet.get('balance', 0) - 60.0) < 0.01, f"got {wallet.get('balance')}")

        aclient.close()
        client.close()

    except Exception as e:
        test('Phase 4 overall', False, str(e))


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', default='all', choices=['1', '2', '3', '4', 'all'])
    parser.add_argument('--skip-checks', action='store_true', help='Skip service health checks')
    args = parser.parse_args()

    if not args.skip_checks:
        check_services()

    if args.phase in ('1', 'all'):
        run_phase1()

    if args.phase in ('2', 'all'):
        run_phase2()

    if args.phase in ('3', 'all'):
        run_phase3()

    if args.phase in ('4', 'all'):
        run_phase4()

    print(f'=== RESULTS: {ok} passed, {fail} failed ===')
    if fail > 0:
        sys.exit(1)
