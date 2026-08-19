"""Debug cookie handling with httpx."""
import httpx

base = 'http://localhost:8000'
client = httpx.Client(base_url=base)
r = client.post('/api/v1/auth/login', json={'email': 'superadmin@aldirasat.com', 'password': 'admin123'})
print(f'Login: {r.status_code}')
print(f'Set-Cookie headers: {r.headers.get_list("set-cookie")}')

# Check cookie jar
for cookie in client.cookies.jar:
    print(f'Cookie in jar: {cookie.name} secure={cookie.secure} domain={cookie.domain} path={cookie.path}')

# Manually set the cookie
token = dict(client.cookies).get('access_token')
print(f'Token value (first 20): {token[:20] if token else "NONE"}...')

# Try with manually set cookie header
r2 = client.get('/api/v1/auth/me', headers={'Cookie': f'access_token={token}'})
print(f'/auth/me with explicit header: {r2.status_code} {r2.text[:200]}')

# Try with a fresh client and cookie header
client2 = httpx.Client(base_url=base)
r3 = client2.get('/api/v1/auth/me', headers={'Cookie': f'access_token={token}'})
print(f'/auth/me fresh client: {r3.status_code} {r3.text[:200]}')

client.close()
client2.close()
