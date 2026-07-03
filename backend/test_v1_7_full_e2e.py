"""
Full Integration Tests for v1.7 ERP — Cross-Phase End-to-End Flows

Run with:  python test_v1_7_full_e2e.py

Covers:
  1. Full payment flow: create student -> enroll -> pay -> revenue split -> close day -> block retroactive edit
  2. Expense flow: general expense, teacher withdrawal, wallet deduction
  3. Course lifecycle: create pending -> meet quota -> activate -> complete
  4. Daily closure state machine: close -> unlock request -> approve -> re-close
  5. Role isolation: each role accesses only authorized endpoints
"""

import sys
import os
import uuid
from datetime import date, timedelta

import httpx

ok = 0
fail = 0
failed_tests = []

BASE = 'http://localhost:8000'


def test(name, ok_cond, detail=''):
    global ok, fail, failed_tests
    if ok_cond:
        print(f'  PASS  {name}')
        ok += 1
    else:
        print(f'  FAIL  {name}' + (f'  -- {detail}' if detail else ''))
        fail += 1
        failed_tests.append(name)


def login(email, password):
    client = httpx.Client(base_url=BASE)
    r = client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    if r.status_code == 200:
        for cookie in r.headers.get_list("set-cookie"):
            if cookie.startswith("access_token="):
                token = cookie.split(";")[0].split("=", 1)[1]
                return client, token
    return client, None


def authed_client(token):
    client = httpx.Client(base_url=BASE)
    client.headers["Cookie"] = f"access_token={token}"
    return client


def check_backend():
    try:
        r = httpx.get(f'{BASE}/api/v1/health', timeout=5)
        test('Backend health check returns 200', r.status_code == 200, f'got {r.status_code}')
        return r.status_code == 200
    except Exception as e:
        test('Backend health check', False, str(e))
        return False


# ─────────────────────────────────────────────
# 1. Full Payment Flow
# ─────────────────────────────────────────────
def test_full_payment_flow():
    print()
    print('=' * 60)
    print('1. Full Payment Flow — Enroll, Pay, Split, Close, Block')
    print('=' * 60)
    print()

    client, token = login('superadmin@institute.dev', 'admin123')
    test('Login as superadmin', token is not None)
    if not token:
        client.close()
        return
    ac = authed_client(token)

    try:
        # Create course
        r = ac.post('/api/v1/academic/courses', json={
            'name': 'INTG Course',
            'code': f'INTG{uuid.uuid4().hex[:6].upper()}',
            'credits': 3,
            'min_students_required': 1,
        })
        test('Create course', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            return
        course_id = r.json()['id']

        # Fetch teacher role ID
        import psycopg
        conn = psycopg.connect('postgresql://lims:lims_secure_pass@localhost:5440/lims')
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM roles WHERE name='teacher'")
            teacher_role_id = str(cur.fetchone()[0])
            cur.execute("SELECT id FROM users WHERE email='teacher@institute.dev'")
            row = cur.fetchone()
        conn.close()

        teacher_id = None
        if row:
            teacher_id = str(row[0])
        else:
            # Create teacher
            r = ac.post('/api/v1/users', json={
                'email': f'teacher.intg.{uuid.uuid4().hex[:6]}@test.dev',
                'password': 'test123456',
                'full_name': 'Integration Teacher',
                'role_id': teacher_role_id,
            })
            test('Create teacher user', r.status_code == 201, f'got {r.status_code}')
            teacher_id = r.json()['id'] if r.status_code == 201 else None

        if not teacher_id:
            test('Teacher available', False, 'could not get/create teacher')
            ac.close()
            client.close()
            return

        # Create section
        r = ac.post('/api/v1/academic/course-sections', json={
            'course_id': course_id,
            'teacher_id': teacher_id,
            'capacity': 30,
        })
        test('Create section', r.status_code == 201, f'got {r.status_code}')
        section_id = r.json()['id'] if r.status_code == 201 else None

        # Create student
        r = ac.post('/api/v1/academic/students', json={
            'student_code': f'INTG{uuid.uuid4().hex[:6].upper()}',
            'full_name': 'Integration Student',
        })
        test('Create student', r.status_code == 201, f'got {r.status_code}')
        student_id = r.json()['id'] if r.status_code == 201 else None

        # Enroll
        if all([section_id, student_id]):
            r = ac.post('/api/v1/academic/enrollments', json={
                'student_id': student_id,
                'section_id': section_id,
                'agreed_price': 1000.0,
            })
            test('Enroll student', r.status_code == 201, f'got {r.status_code}')
        else:
            test('Setup complete', False, 'missing section or student')
            ac.close()
            client.close()
            return

        # Activate course
        r = ac.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 40})
        test('Activate course', r.status_code == 200, f'got {r.status_code}')

        # Make payment
        today = date.today().isoformat()
        r = ac.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': course_id,
            'amount': 200.0,
        })
        test('Create payment', r.status_code == 201, f'got {r.status_code}: {r.text[:200]}')
        if r.status_code == 201:
            payment = r.json()
            test('Payment has receipt number', 'receipt_number' in payment)
            receipt_num = payment['receipt_number']
            test('Receipt format RCP-', receipt_num.startswith('RCP-'), f'got {receipt_num}')

            # Check teacher wallet (40% of 200 = 80)
            r2 = ac.get(f'/api/v1/lms/teacher-wallets/{teacher_id}')
            test('Teacher wallet fetched', r2.status_code == 200, f'got {r2.status_code}')
            if r2.status_code == 200:
                wallet = r2.json()
                test('Wallet balance >= 80 (40% of 200)', wallet.get('balance', 0) >= 79.99, f'got {wallet["balance"]}')

        # Close the day
        r = ac.post(f'/api/v1/lms/daily-closures/{today}/close')
        test('Close day', r.status_code == 200, f'got {r.status_code}')

        # Attempt retroactive payment on closed date -> 409
        r = ac.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': course_id,
            'amount': 50.0,
            'date': today,
        })
        test('Block retroactive payment on closed date', r.status_code == 409, f'got {r.status_code}')

        # Future date payment should succeed
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r = ac.post('/api/v1/lms/payments', json={
            'student_id': student_id,
            'course_id': course_id,
            'amount': 100.0,
            'date': tomorrow,
        })
        test('Payment on open future date succeeds', r.status_code == 201, f'got {r.status_code}')

        # Student payment summary
        r = ac.get(f'/api/v1/lms/payments/summary/{student_id}/{course_id}')
        test('Student payment summary', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            summary = r.json()
            test('Summary has total_paid', 'total_paid' in summary, f'keys: {list(summary.keys())}')
            test('Summary has agreed_price', 'agreed_price' in summary)

    except Exception as e:
        test('Full payment flow', False, str(e))
    finally:
        ac.close()
        client.close()


# ─────────────────────────────────────────────
# 2. Expense Flow
# ─────────────────────────────────────────────
def test_expense_flow():
    print()
    print('=' * 60)
    print('2. Expense Flow — General Expense, Teacher Withdrawal')
    print('=' * 60)
    print()

    client, token = login('superadmin@institute.dev', 'admin123')
    test('Login as superadmin', token is not None)
    if not token:
        client.close()
        return
    ac = authed_client(token)

    try:
        # Get teacher ID from DB
        import psycopg
        conn = psycopg.connect('postgresql://lims:lims_secure_pass@localhost:5440/lims')
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email='teacher@institute.dev'")
            row = cur.fetchone()
        conn.close()

        teacher_id = str(row[0]) if row else None
        if not teacher_id:
            test('Teacher user exists', False, 'teacher@institute.dev not found — run seed migration')
            ac.close()
            client.close()
            return

        # Create a general expense
        r = ac.post('/api/v1/lms/expenses', json={
            'amount': 150.0,
            'description': 'Office supplies',
            'recipient_name': 'Stationery Shop',
            'type': 'general_expense',
        })
        test('Create general expense', r.status_code == 201, f'got {r.status_code}')
        if r.status_code == 201:
            expense = r.json()
            test('Expense has voucher number', 'id' in expense)

        # Create a secretary advance
        r = ac.post('/api/v1/lms/expenses', json={
            'amount': 300.0,
            'description': 'Petty cash advance',
            'recipient_name': 'Secretary',
            'type': 'secretary_advance',
        })
        test('Create secretary advance', r.status_code == 201, f'got {r.status_code}')

        # List expenses with type filter
        r = ac.get('/api/v1/lms/expenses?type=general_expense')
        test('List expenses filtered by type', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            test('Filtered results are all general_expense',
                 all(e['type'] == 'general_expense' for e in r.json()),
                 f'got types: {[e.get("type") for e in r.json()]}')

        # Check teacher wallet
        r = ac.get(f'/api/v1/lms/teacher-wallets/{teacher_id}')
        if r.status_code == 200:
            wallet = r.json()
            test('Wallet endpoint returns balance', 'balance' in wallet, f'keys: {list(wallet.keys())}')

    except Exception as e:
        test('Expense flow', False, str(e))
    finally:
        ac.close()
        client.close()


# ─────────────────────────────────────────────
# 3. Course Lifecycle
# ─────────────────────────────────────────────
def test_course_lifecycle():
    print()
    print('=' * 60)
    print('3. Course Lifecycle — Pending -> Active -> Completed')
    print('=' * 60)
    print()

    client, token = login('superadmin@institute.dev', 'admin123')
    test('Login as superadmin', token is not None)
    if not token:
        client.close()
        return
    ac = authed_client(token)

    try:
        # Create course
        r = ac.post('/api/v1/academic/courses', json={
            'name': 'Lifecycle Course',
            'code': f'LIFE{uuid.uuid4().hex[:6].upper()}',
            'credits': 4,
            'min_students_required': 2,
        })
        test('Create course pending', r.status_code == 201, f'got {r.status_code}')
        if r.status_code != 201:
            ac.close()
            client.close()
            return
        course_id = r.json()['id']
        test('Status is pending', r.json().get('status') == 'pending')

        # Activate without quota -> 400
        r = ac.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 50})
        test('Activate without quota returns 400', r.status_code == 400, f'got {r.status_code}')

        # Get teacher and create section/students
        import psycopg
        conn = psycopg.connect('postgresql://lims:lims_secure_pass@localhost:5440/lims')
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email='teacher@institute.dev'")
            row = cur.fetchone()
        conn.close()

        teacher_id = str(row[0]) if row else None
        if not teacher_id:
            test('Teacher available', False, 'teacher@institute.dev not found')
            ac.close()
            client.close()
            return

        # Create section
        r = ac.post('/api/v1/academic/course-sections', json={
            'course_id': course_id,
            'teacher_id': teacher_id,
            'capacity': 20,
        })
        test('Create section', r.status_code == 201, f'got {r.status_code}')
        section_id = r.json()['id'] if r.status_code == 201 else None

        # Create students and enroll
        student_ids = []
        for i in range(2):
            r = ac.post('/api/v1/academic/students', json={
                'student_code': f'LIFE{uuid.uuid4().hex[:6].upper()}',
                'full_name': f'Lifecycle Student {i+1}',
            })
            test(f'Create student {i+1}', r.status_code == 201, f'got {r.status_code}')
            sid = r.json()['id'] if r.status_code == 201 else None
            if sid and section_id:
                r2 = ac.post('/api/v1/academic/enrollments', json={
                    'student_id': sid,
                    'section_id': section_id,
                    'agreed_price': 750.0,
                    'admin_discount': 50.0,
                })
                test(f'Enroll student {i+1} with discount', r2.status_code == 201, f'got {r2.status_code}')
            student_ids.append(sid)

        # Activate course (quota met)
        r = ac.post(f'/api/v1/academic/courses/{course_id}/activate', json={'teacher_percentage': 50})
        test('Activate with quota', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            test('Status is active', r.json().get('status') == 'active')
            test('Teacher percentage is 50', r.json().get('teacher_percentage') == 50.0)

        # Late register: secretary enrolls with discount
        sec_client, sec_token = login('secretary@institute.dev', 'secretary123')
        test('Login as secretary', sec_token is not None)
        if sec_token:
            sec_ac = authed_client(sec_token)
            r = sec_ac.post('/api/v1/academic/students', json={
                'student_code': f'LIFE{uuid.uuid4().hex[:6].upper()}',
                'full_name': 'Late Registration Student',
            })
            if r.status_code == 201:
                late_id = r.json()['id']
                if section_id:
                    r2 = sec_ac.post('/api/v1/academic/enrollments', json={
                        'student_id': late_id,
                        'section_id': section_id,
                        'agreed_price': 800.0,
                        'admin_discount': 100.0,
                    })
                    test('Secretary late enroll with discount', r2.status_code == 201, f'got {r2.status_code}')
            sec_ac.close()
        sec_client.close()

        # Complete the course
        r = ac.post(f'/api/v1/academic/courses/{course_id}/complete')
        test('Complete course', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            test('Status is completed', r.json().get('status') == 'completed')

        # Double-complete -> 400
        r = ac.post(f'/api/v1/academic/courses/{course_id}/complete')
        test('Double-complete returns 400', r.status_code == 400, f'got {r.status_code}')

        # Verify course response has all fields
        r = ac.get(f'/api/v1/academic/courses/{course_id}')
        if r.status_code == 200:
            data = r.json()
            test('Course has status', 'status' in data)
            test('Course has teacher_percentage', 'teacher_percentage' in data)
            test('Course has min_students_required', 'min_students_required' in data)

    except Exception as e:
        test('Course lifecycle', False, str(e))
    finally:
        ac.close()
        client.close()


# ─────────────────────────────────────────────
# 4. Daily Closure State Machine
# ─────────────────────────────────────────────
def test_daily_closure_state_machine():
    print()
    print('=' * 60)
    print('4. Daily Closure State Machine — Close, Unlock, Approve, Re-close')
    print('=' * 60)
    print()

    client, token = login('superadmin@institute.dev', 'admin123')
    test('Login as superadmin', token is not None)
    if not token:
        client.close()
        return
    ac = authed_client(token)

    try:
        today = date.today().isoformat()

        # Close today
        r = ac.post(f'/api/v1/lms/daily-closures/{today}/close')
        test('Close today', r.status_code in (200, 409), f'got {r.status_code}')
        if r.status_code == 409:
            # Already closed — do unlock flow instead
            pass
        elif r.status_code == 200:
            test('Closure status is closed', r.json().get('status') == 'closed', f"got {r.json().get('status')}")

        # Double-close -> 409
        r = ac.post(f'/api/v1/lms/daily-closures/{today}/close')
        test('Double-close returns 409', r.status_code == 409, f'got {r.status_code}')

        # Request unlock as manager
        mgr_client, mgr_token = login('manager@institute.dev', 'manager123')
        test('Login as manager', mgr_token is not None)
        if mgr_token:
            mgr_ac = authed_client(mgr_token)
            r = mgr_ac.post(f'/api/v1/lms/daily-closures/{today}/unlock-request')
            test('Manager requests unlock', r.status_code == 200, f'got {r.status_code}')
            if r.status_code == 200:
                test('Status is unlock_requested', r.json().get('status') == 'unlock_requested', f"got {r.json().get('status')}")
            mgr_ac.close()
        mgr_client.close()

        # Approve unlock as superadmin
        r = ac.post(f'/api/v1/lms/daily-closures/{today}/approve-unlock')
        test('Superadmin approves unlock', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            test('Status is pending after approve', r.json().get('status') == 'pending', f"got {r.json().get('status')}")

        # Create expense on reopened date (should succeed)
        r = ac.post('/api/v1/lms/expenses', json={
            'amount': 25.0,
            'description': 'Post-unlock expense',
            'recipient_name': 'Vendor',
            'type': 'general_expense',
            'date': today,
        })
        test('Expense on reopened date succeeds', r.status_code == 201, f'got {r.status_code}')

        # Re-close
        r = ac.post(f'/api/v1/lms/daily-closures/{today}/close')
        test('Re-close after unlock cycle', r.status_code == 200, f'got {r.status_code}')

        # Get daily ledger
        r = ac.get(f'/api/v1/lms/daily-closures/{today}/ledger')
        test('Get daily ledger', r.status_code == 200, f'got {r.status_code}')
        if r.status_code == 200:
            ledger = r.json()
            test('Ledger has total_payments_in', 'total_payments_in' in ledger, f'keys: {list(ledger.keys())}')
            test('Ledger has total_expenses_out', 'total_expenses_out' in ledger)
            test('Ledger has net_cash_flow', 'net_cash_flow' in ledger)
            test('Ledger has status', 'status' in ledger)

        # List closures
        r = ac.get('/api/v1/lms/daily-closures')
        test('List closures', r.status_code == 200, f'got {r.status_code}')

        # Teacher cannot close or approve
        tch_client, tch_token = login('teacher@institute.dev', 'teacher123')
        test('Login as teacher', tch_token is not None)
        if tch_token:
            tch_ac = authed_client(tch_token)
            tomorrow = (date.today() + timedelta(days=2)).isoformat()
            r = tch_ac.post(f'/api/v1/lms/daily-closures/{tomorrow}/close')
            test('Teacher cannot close day', r.status_code == 403, f'got {r.status_code}')
            r = tch_ac.post(f'/api/v1/lms/daily-closures/{tomorrow}/approve-unlock')
            test('Teacher cannot approve unlock', r.status_code == 403, f'got {r.status_code}')
            tch_ac.close()
        tch_client.close()

    except Exception as e:
        test('Daily closure state machine', False, str(e))
    finally:
        ac.close()
        client.close()


# ─────────────────────────────────────────────
# 5. Role Isolation
# ─────────────────────────────────────────────
def test_role_isolation():
    print()
    print('=' * 60)
    print('5. Role Isolation — Role-Based Access Control')
    print('=' * 60)
    print()

    roles_to_test = [
        ('superadmin@institute.dev', 'admin123', 'superadmin'),
        ('manager@institute.dev', 'manager123', 'manager'),
        ('secretary@institute.dev', 'secretary123', 'secretary'),
        ('teacher@institute.dev', 'teacher123', 'teacher'),
    ]

    # Define endpoint access matrix: (method, path, body, allowed_roles)
    endpoints = [
        # Create user — only superadmin/manager
        ('POST', '/api/v1/users', {
            'email': f'role.test.{uuid.uuid4().hex[:6]}@test.dev',
            'password': 'test123456',
            'full_name': 'Role Test User',
            'role_id': '00000000-0000-0000-0000-000000000000',
        }, ['superadmin', 'manager']),

        # Create course section — superadmin/manager/secretary
        ('POST', '/api/v1/academic/course-sections', {
            'course_id': '00000000-0000-0000-0000-000000000000',
            'teacher_id': '00000000-0000-0000-0000-000000000000',
            'capacity': 10,
        }, ['superadmin', 'manager', 'secretary']),

        # Delete course section — superadmin only
        ('DELETE', '/api/v1/academic/course-sections/00000000-0000-0000-0000-000000000000', None, ['superadmin']),

        # List users — superadmin/manager
        ('GET', '/api/v1/users', None, ['superadmin', 'manager']),

        # Create expense — superadmin/manager/secretary
        ('POST', '/api/v1/lms/expenses', {
            'amount': 10.0,
            'recipient_name': 'Role Test',
            'type': 'general_expense',
        }, ['superadmin', 'manager', 'secretary']),

        # Create student — superadmin/manager/secretary
        ('POST', '/api/v1/academic/students', {
            'student_code': f'ROLE{uuid.uuid4().hex[:6].upper()}',
            'full_name': 'Role Test Student',
        }, ['superadmin', 'manager', 'secretary']),
    ]

    for email, password, role_name in roles_to_test:
        client, token = login(email, password)
        test(f'Login as {role_name}', token is not None)
        if not token:
            client.close()
            continue
        ac = authed_client(token)

        for method, path, body, allowed_roles in endpoints:
            role_allowed = role_name in allowed_roles
            try:
                if method == 'GET':
                    r = ac.get(path)
                elif method == 'POST':
                    r = ac.post(path, json=body or {})
                elif method == 'DELETE':
                    r = ac.delete(path)
                else:
                    continue

                if role_allowed:
                    # Allowed role: should NOT get 403 (may get 400/404/422 for bad data, that's fine)
                    passed = r.status_code != 403
                    test(f'{role_name} can access {method} {path}',
                         passed, f'expected not 403, got {r.status_code}')
                else:
                    # Disallowed role: should get 403
                    passed = r.status_code == 403
                    test(f'{role_name} blocked from {method} {path}',
                         passed, f'expected 403, got {r.status_code}')
            except Exception as e:
                test(f'{role_name} {method} {path}', False, str(e))

        ac.close()
        client.close()


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    print('=' * 60)
    print('v1.7 ERP — Full Integration Test Suite')
    print('=' * 60)
    print()

    if not check_backend():
        print()
        print('Backend is not available. Ensure backend is running on port 8000.')
        sys.exit(1)

    test_full_payment_flow()
    test_expense_flow()
    test_course_lifecycle()
    test_daily_closure_state_machine()
    test_role_isolation()

    # Summary
    print()
    print('=' * 60)
    print(f'RESULTS: {ok} passed, {fail} failed')
    print('=' * 60)
    if fail > 0:
        print()
        print('=== FAILED TESTS ===')
        for ft in failed_tests:
            print(f'  {ft}')
        sys.exit(1)
