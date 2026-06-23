# Phase 1 — Manual Verification Instructions

## Prerequisites

- Docker containers running for **database and caddy only**: `docker compose up -d database caddy`
- Backend running from terminal: `cd backend && .venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Frontend running from terminal: `cd frontend && npm run dev`
- Caddy Root CA is trusted on the client machine (for `Secure` cookies to work)
- Access to `psql` inside the database container or a DB client
- `curl` or HTTP client (Postman, insomnia, etc.)

### Default seed credentials

| Field | Value |
|-------|-------|
| Email | `superadmin@institute.dev` |
| Password | `admin123` |
| Role | `superadmin` |

---

## 1. Alembic Migrations — Verify Tables

Run the migration from the **backend terminal** (not inside a container), then check all 4 identity tables exist with correct columns.

```bash
# Activate the virtual environment and execute pending migrations
cd backend
.venv\Scripts\activate
alembic upgrade head
```

Connect to the database via Docker to inspect tables:

```bash
docker exec -it lims_database psql -U lims -d lims
```

Inside `psql`, run:

```sql
\dt
-- Expected: audit_logs, refresh_tokens, roles, users

\d roles
-- Expected columns: id (UUID PK), name (VARCHAR UNIQUE)

\d users
-- Expected columns: id (UUID PK), email (UNIQUE), password_hash, full_name, role_id (FK→roles), locale_pref, is_active, is_superadmin

\d refresh_tokens
-- Expected columns: id (UUID PK), user_id (FK→users), token_hash (UNIQUE), expires_at, revoked

\d audit_logs
-- Expected columns: id (UUID PK), user_id (FK→users), action, payload (JSONB), ip_address, timestamp
```

Exit `psql`:
```sql
\q
```

---

## 2. Seed Roles — Verify Data

Check the `roles` table contains exactly the 3 default roles.

```bash
docker exec -it lims_database psql -U lims -d lims -c "SELECT id, name FROM roles ORDER BY name;"
```

**Expected output:**
```
                  id                  |    name
--------------------------------------+------------
 88dcf628-98e6-4277-9ff7-b1698246a301 | admin
 c12c75a4-569b-430c-968e-0fde8b14e300 | superadmin
 b9ef8ccb-0e5a-4933-bf4f-cfb95e34a302 | teacher
(3 rows)
```

Check that a default superadmin user exists:

```bash
docker exec -it lims_database psql -U lims -d lims -c "SELECT id, email, full_name, is_superadmin, role_id FROM users;"
```

**Expected output:** one user row with email `superadmin@institute.dev`, `is_superadmin = t`.

---

## 3. Invalid Login — Expect 401

Submit a POST request with wrong credentials. The endpoint must return `401 Unauthorized`.

```bash
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@institute.dev", "password": "wrong_password"}' \
  -v 2>&1
```

**Expected:**
- HTTP status `401 Unauthorized`
- Response body: `{"detail": "Invalid email or password"}`
- No `Set-Cookie` headers in the response
- A `LOGIN_FAILED` entry is created in the `audit_logs` table

Verify the audit entry:

```bash
docker exec -it lims_database psql -U lims -d lims -c "SELECT action, payload, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 5;"
```

**Expected:** most recent entry shows `action = LOGIN_FAILED`.

---

## 4. Successful Login — Verify Cookies

Login with valid credentials. The response must contain `Set-Cookie` headers for both `access_token` and `refresh_token` with all security flags.

```bash
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@institute.dev", "password": "admin123"}' \
  -v 2>&1
```

**Expected:**
- HTTP status `200 OK`
- Response body contains user JSON: `id`, `email`, `full_name`, `role` (with `name`), `is_superadmin`, `locale_pref`, `is_active`

**Check the `Set-Cookie` headers — each must include:**

For `access_token` cookie:
```
Set-Cookie: access_token=<jwt>; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax
```

For `refresh_token` cookie:
```
Set-Cookie: refresh_token=<jwt>; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax
```

**Verify each flag:**
| Flag | Expected | Why |
|------|----------|-----|
| `HttpOnly` | Present | Prevents JS access to token |
| `Secure` | Present | Requires HTTPS (Caddy Internal CA) |
| `SameSite=Lax` | Present | CSRF protection |
| `Path=/` | Present | Cookie sent to all API paths |
| `Max-Age=900` | 900 (15m) | Access token expiry |

Verify audit log:

```bash
docker exec -it lims_database psql -U lims -d lims -c "SELECT action, user_id, ip_address, timestamp FROM audit_logs WHERE action = 'LOGIN_SUCCESS' ORDER BY timestamp DESC LIMIT 1;"
```

**Expected:** one `LOGIN_SUCCESS` entry with the superadmin user_id and the client IP.

---

## 5. Protected Endpoint — Without vs With Cookies

### 5a. Without cookies — Expect 401

Access a protected endpoint without sending any cookies:

```bash
curl "https://lims.institute.local/api/v1/users" -v 2>&1
```

**Expected:**
- HTTP status `401 Unauthorized`
- Response: `{"detail": "Not authenticated"}`

Access the `/users/me` endpoint without cookies:

```bash
curl "https://lims.institute.local/api/v1/users/me" -v 2>&1
```

**Expected:** same `401 Unauthorized`.

### 5b. With cookies — Expect 200

Login to capture cookies, then use them for a protected request:

```bash
# Login and save cookies to a file
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@institute.dev", "password": "admin123"}' \
  -c cookies.txt -v 2>&1

# Use saved cookies to access protected endpoint
curl "https://lims.institute.local/api/v1/users" \
  -b cookies.txt -v 2>&1
```

**Expected:**
- HTTP status `200 OK`
- Response body: JSON array of users

Also test the `/users/me` endpoint:

```bash
curl "https://lims.institute.local/api/v1/users/me" \
  -b cookies.txt -v 2>&1
```

**Expected:**
- HTTP status `200 OK`
- Response body: the current user's details

---

## 6. Token Rotation — Refresh Endpoint

Login, capture cookies, call `/auth/refresh`, and verify old token is revoked.

```bash
# Step 1: Login
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@institute.dev", "password": "admin123"}' \
  -c cookies_before.txt -v 2>&1

# Step 2: Check current refresh token count in DB
docker exec -it lims_database psql -U lims -d lims \
  -c "SELECT COUNT(*) FROM refresh_tokens WHERE revoked = false AND user_id = (SELECT id FROM users WHERE email = 'superadmin@institute.dev');"
```
**Expected:** 1 active (non-revoked) refresh token.

```bash
# Step 3: Call refresh endpoint
curl -X POST "https://lims.institute.local/api/v1/auth/refresh" \
  -b cookies_before.txt \
  -c cookies_after.txt -v 2>&1
```

**Expected:**
- HTTP status `200 OK`
- Response body: `{"status": "success"}`
- `Set-Cookie` headers contain NEW `access_token` and `refresh_token` (different values from step 1)

```bash
# Step 4: Verify old token is now revoked in DB
docker exec -it lims_database psql -U lims -d lims \
  -c "SELECT COUNT(*) FROM refresh_tokens WHERE revoked = false AND user_id = (SELECT id FROM users WHERE email = 'superadmin@institute.dev');"
```
**Expected:** still 1 active token (old one revoked + new one issued = net 1).

```bash
# Step 5: Verify the old token cannot be reused
# (Use cookies_before.txt which has the old refresh token)
curl -X POST "https://lims.institute.local/api/v1/auth/refresh" \
  -b cookies_before.txt -v 2>&1
```
**Expected:** `401 Unauthorized` — old token is revoked.

```bash
# Step 6: Verify new token works — access protected endpoint
curl "https://lims.institute.local/api/v1/users/me" \
  -b cookies_after.txt -v 2>&1
```
**Expected:** `200 OK` with user details.

---

## 7. Logout — Token Revocation

```bash
# Login again
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@institute.dev", "password": "admin123"}' \
  -c cookies_login.txt -v 2>&1

# Logout
curl -X POST "https://lims.institute.local/api/v1/auth/logout" \
  -b cookies_login.txt \
  -c cookies_logout.txt -v 2>&1
```

**Expected:**
- HTTP status `200 OK`
- `Set-Cookie` headers clear both cookies (empty value + `Max-Age=0` or immediate expiry)
- Refresh token marked as `revoked = true` in DB

```bash
# Verify token is revoked — try to refresh after logout
curl -X POST "https://lims.institute.local/api/v1/auth/refresh" \
  -b cookies_login.txt -v 2>&1
```
**Expected:** `401 Unauthorized`.

---

## 8. User Creation & RBAC

### 8a. Admin creates a Teacher (should succeed)

Create an admin user first (via DB), then login as admin and create a teacher:

```bash
# Get the admin role ID
docker exec -it lims_database psql -U lims -d lims -c "SELECT id FROM roles WHERE name = 'admin';"

# Create an admin user via psql (replace role_id with actual value)
docker exec -it lims_database psql -U lims -d lims \
  -c "INSERT INTO users (id, email, password_hash, full_name, role_id, locale_pref, is_active, is_superadmin) VALUES (gen_random_uuid(), 'admin@institute.dev', '\$2b\$12\$oqZr9asO0spzX8qjzh/hGuezB3sJghuD9FN3hCrdHnhXWECWAOGG.', 'Institute Admin', '<admin_role_id>', 'ar', true, false);"
```

> **Note:** The password hash above is for `admin123`. Use a different hash if you set a different password.

```bash
# Login as admin
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@institute.dev", "password": "admin123"}' \
  -c admin_cookies.txt -v 2>&1

# Get teacher role ID
docker exec -it lims_database psql -U lims -d lims -c "SELECT id FROM roles WHERE name = 'teacher';"

# Create a teacher (replace teacher_role_id)
curl -X POST "https://lims.institute.local/api/v1/users" \
  -b admin_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher1@institute.dev",
    "password": "teacher123",
    "full_name": "Ahmed Mohamed",
    "role_id": "<teacher_role_id>",
    "locale_pref": "ar"
  }' -v 2>&1
```

**Expected:**
- HTTP status `201 Created`
- Response body: the new teacher user object

### 8b. Admin cannot create SuperAdmin (should fail)

```bash
# Get superadmin role ID
docker exec -it lims_database psql -U lims -d lims -c "SELECT id FROM roles WHERE name = 'superadmin';"

curl -X POST "https://lims.institute.local/api/v1/users" \
  -b admin_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fakeadmin@institute.dev",
    "password": "fake123",
    "full_name": "Fake Admin",
    "role_id": "<superadmin_role_id>"
  }' -v 2>&1
```

**Expected:**
- HTTP status `403 Forbidden`
- Response: `{"detail": "Admins are only authorized to create Teacher accounts"}`

### 8c. Teacher cannot access `/api/v1/users` (should fail)

```bash
# Login as the teacher created above
curl -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "teacher1@institute.dev", "password": "teacher123"}' \
  -c teacher_cookies.txt -v 2>&1

# Try to list users
curl "https://lims.institute.local/api/v1/users" \
  -b teacher_cookies.txt -v 2>&1
```

**Expected:**
- HTTP status `403 Forbidden`
- Response: `{"detail": "Access denied: Requires one of roles ['superadmin', 'admin']"}`

---

## Full Verification Checklist Summary

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1 | `alembic upgrade head` (from terminal) | 4 tables created (roles, users, refresh_tokens, audit_logs) | ☐ |
| 2 | Roles seeded | superadmin, admin, teacher | ☐ |
| 3 | Default superadmin user | `superadmin@institute.dev` exists | ☐ |
| 4 | Invalid login → 401 | `401 Unauthorized`, no cookies | ☐ |
| 5 | Valid login → cookies | `Set-Cookie` with HttpOnly + Secure + SameSite=Lax | ☐ |
| 6 | Protected endpoint w/o cookies → 401 | `401 Unauthorized` | ☐ |
| 7 | Protected endpoint with cookies → 200 | Returns user data | ☐ |
| 8 | Token rotation | New tokens issued, old one revoked | ☐ |
| 9 | Old token reuse → 401 | `401 Unauthorized` after rotation | ☐ |
| 10 | Logout clears cookies | Cookies emptied, token revoked | ☐ |
| 11 | Admin creates Teacher → 201 | Teacher user created | ☐ |
| 12 | Admin creates SuperAdmin → 403 | Forbidden | ☐ |
| 13 | Teacher accesses `/users` → 403 | Forbidden | ☐ |
| 14 | Audit logs written for each action | LOGIN_FAILED, LOGIN_SUCCESS, LOGOUT, TOKEN_ROTATED, USER_CREATED | ☐ |
