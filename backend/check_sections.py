import httpx

c = httpx.Client(base_url='http://localhost:8000')
r = c.post('/api/v1/auth/login', json={'email': 'superadmin@institute.dev', 'password': 'admin123'})
token = c.cookies.get('access_token')
h = {'Cookie': f'access_token={token}'}

r = c.get('/api/v1/academic/course-sections', headers=h)
for s in r.json():
    t = s['teacher_id'][:8]
    sid = s['id'][:8]
    print(f'{sid}... teacher={t}...')

# Check teacher users
r = c.get('/api/v1/users', headers=h)
for u in r.json():
    print(f'User {u["id"][:8]}... email={u["email"]} role={u["role"]["name"]}')
