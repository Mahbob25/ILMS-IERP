# Security

## Current Posture

### Active protections

| Measure | Status |
|---------|--------|
| JWT access tokens (15min) + refresh tokens (7 days) | Active — HttpOnly Secure SameSite=Lax cookies |
| Token rotation | Active — each refresh issues new token, revokes old |
| Password hashing | bcrypt rounds=12 |
| Password strength validation | 8+ chars, upper, lower, digit, special |
| Account lockout | 5 failed attempts → 15min lock |
| Rate limiting | 3 req/min login, 10 req/min refresh |
| RBAC authorization | `require_role()` gates on all state-mutating endpoints |
| Audit logging | All auth events, user/employee CRUD logged with IP |
| SQLAlchemy parameterized queries | All queries — no raw SQL concatenation |
| CORS | Configurable origins, credentials allowed |
| Soft deletes | Data preserved via `deleted_at` / `is_active` flags |

### Gaps accepted for MVP

| Gap | Risk | Mitigation |
|-----|------|------------|
| No unit tests | Regression bugs reach production | E2E API tests cover critical paths |
| No CSP headers | XSS not fully blocked | React's built-in escaping, no user HTML rendering |
| No CSRF tokens | State-changing requests without origin check | SameSite=Lax mitigates most CSRF vectors |
| No Sentry | Production errors invisible | Manual log review during early deployment |
| No rate limits on financial endpoints | Payment/expense creation unprotected | Low-volume environment mitigates abuse |
| Files stored on local disk | Not horizontally scalable | Single-server deployment |

---

## Deferred Improvements

### File upload validation

`apps/erp/backend/app/core/storage.py` accepts any file type. Implement:

```python
ALLOWED_MIME_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".doc", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024
```

### JWT middleware hardening

`apps/erp/frontend/middleware.ts` decodes JWTs via base64 without signature verification. Acceptable for client-side routing decisions (server enforces auth), but upgrade to `jose` for signature verification if middleware makes security-critical decisions.

### `is_superadmin` cleanup

The `is_superadmin` column on `users` is a deprecated artefact. RBAC uses `role.name == "superadmin"`. Remove column in a dedicated refactoring cycle.

### Password history

No reuse prevention. Add `password_history` table to store bcrypt hashes of last N passwords.

### Audit log retention

No retention policy — table grows unbounded. Archive entries older than 90 days.
