import httpx

BASE = 'http://localhost:8000'
ok = 0
fail = 0
_date_counter = 0

SA_SECTION = '19833ffb-02e9-4f6a-a3b0-117158c2d2bc'
TEACHER_SECTION = '087d477b-8b48-40fa-9fd8-da79f4cde1c6'
STUDENT_ID = '8a7fc069-669e-427b-acf2-96e402c6819c'


def unique_date():
    global _date_counter
    _date_counter += 1
    day = 1 + (_date_counter % 28)
    return f'2026-08-{day:02d}'


def test(name, method, url, client, **kwargs):
    global ok, fail
    try:
        expect = kwargs.pop('expect', 200)
        r = client.request(method, url, **kwargs)
        passed = r.status_code == expect
        status = "PASS" if passed else "FAIL"
        print(f'  {status} [{r.status_code}] {name}')
        if not passed:
            print(f'    Expected {expect}, got {r.status_code}: {r.text[:200]}')
            fail += 1
        else:
            ok += 1
        return r
    except Exception as e:
        print(f'  FAIL [ERR] {name}: {e}')
        fail += 1
        return None


with httpx.Client(base_url=BASE) as c:
    r = c.post('/api/v1/auth/login',
               json={'email': 'superadmin@aldirasat.com', 'password': 'admin123'})
    token = c.cookies.get('access_token')
    h = {'Cookie': f'access_token={token}'}

    print('=== PHASE 3 END-TO-END TESTS ===')
    print()

    # 1. Assignment CRUD
    print('--- Assignment CRUD ---')
    r = test('Create assignment', 'POST', '/api/v1/lms/assignments', c, headers=h,
             json={'section_id': SA_SECTION, 'title': 'Final Exam', 'max_score': 100}, expect=201)
    assign_id = r.json()['id'] if r and r.status_code == 201 else None

    test('List assignments', 'GET', f'/api/v1/lms/assignments?section_id={SA_SECTION}', c, headers=h)

    if assign_id:
        test('Update assignment', 'PUT', f'/api/v1/lms/assignments/{assign_id}', c, headers=h,
             json={'title': 'Final Exam Updated'})
        test('Delete assignment', 'DELETE', f'/api/v1/lms/assignments/{assign_id}', c, headers=h, expect=204)

    # 2. Attendance
    print()
    print('--- Attendance ---')
    d1 = unique_date()
    r = test('Create session', 'POST', '/api/v1/lms/attendance/sessions', c, headers=h,
             json={'section_id': SA_SECTION, 'date': d1}, expect=201)
    sess_id = r.json()['id'] if r and r.status_code == 201 else None

    test('List sessions', 'GET', f'/api/v1/lms/attendance/sessions?section_id={SA_SECTION}', c, headers=h)

    if sess_id:
        test('Submit records', 'POST', f'/api/v1/lms/attendance/sessions/{sess_id}/records', c, headers=h,
             json={'records': [{'student_id': STUDENT_ID, 'status': 'present'}]})

    # 3. Submission & Grading
    print()
    print('--- Submissions & Grades ---')
    r = test('Create test assignment', 'POST', '/api/v1/lms/assignments', c, headers=h,
             json={'section_id': SA_SECTION, 'title': 'Test Submit', 'max_score': 100}, expect=201)
    test_assign_id = r.json()['id'] if r and r.status_code == 201 else None

    if test_assign_id:
        r = test('Submit assignment', 'POST', f'/api/v1/lms/assignments/{test_assign_id}/submissions', c, headers=h,
                 data={'student_id': STUDENT_ID}, expect=201)
        sub_id = r.json()['id'] if r and r.status_code == 201 else None

        if sub_id:
            test('Grade submission', 'POST', f'/api/v1/lms/submissions/{sub_id}/grade', c, headers=h,
                 json={'score': 88, 'feedback': 'Great job!'}, expect=201)
            test('List submissions', 'GET', f'/api/v1/lms/assignments/{test_assign_id}/submissions', c, headers=h)
            test('List grades', 'GET', f'/api/v1/lms/assignments/{test_assign_id}/grades', c, headers=h)

    # 4. Teacher scoping
    print()
    print('--- Teacher Scoping ---')
    r = c.post('/api/v1/auth/login',
               json={'email': 'teacher.ee3f04@aldirasat.com', 'password': 'teacher123'})
    teacher_h = {'Cookie': f'access_token={c.cookies.get("access_token")}'}

    test('Teacher list assignments', 'GET', '/api/v1/lms/assignments', c, headers=teacher_h)

    if test_assign_id:
        test('Teacher cannot delete', 'DELETE', f'/api/v1/lms/assignments/{test_assign_id}', c, headers=teacher_h, expect=403)

    d2 = unique_date()
    test('Teacher create session (own section)', 'POST', '/api/v1/lms/attendance/sessions', c, headers=teacher_h,
         json={'section_id': TEACHER_SECTION, 'date': d2}, expect=201)

    r = c.post('/api/v1/auth/login',
               json={'email': 'teacher.test@aldirasat.com', 'password': 'teacher123'})
    wrong_h = {'Cookie': f'access_token={c.cookies.get("access_token")}'}
    d3 = unique_date()
    test('Teacher blocked from wrong section', 'POST', '/api/v1/lms/attendance/sessions', c, headers=wrong_h,
         json={'section_id': SA_SECTION, 'date': d3}, expect=403)

    # 5. Unauthenticated access
    print()
    print('--- Access Control ---')
    anon = httpx.Client(base_url=BASE)
    test('Unauthenticated assignments', 'GET', '/api/v1/lms/assignments', anon, expect=401)
    test('Unauthenticated attendance', 'GET', '/api/v1/lms/attendance/sessions', anon, expect=401)

    print()
    print(f'=== RESULTS: {ok} passed, {fail} failed ===')
