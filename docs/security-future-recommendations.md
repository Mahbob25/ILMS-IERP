# Security — Future Recommendations

This document captures security findings that were identified during the July 2026 review but deferred from immediate implementation. Each item includes the rationale for deferral and a recommended approach for when it is prioritised.

---

## 1. File Upload Validation

**Severity:** Medium  
**Risk:** Any file type can be uploaded via the `/assignments/{id}/submissions` endpoint, including executables, scripts, or HTML with embedded JavaScript. No content-type check, no extension whitelist, no size limit.

### Current code

`backend/app/core/storage.py` — the `save_upload` function accepts whatever `file.filename` gives it and only extracts the extension without validation:

```python
async def save_upload(file: UploadFile, subdir: str = "") -> str:
    ext = os.path.splitext(file.filename or "file")[1] if file.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    ...
```

### Recommended approach

Add validation before writing the file. Use a whitelist of allowed MIME types and extensions, plus a size cap:

```python
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".doc", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

async def save_upload(file: UploadFile, subdir: str = "") -> str:
    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed")

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"MIME type '{file.content_type}' not allowed")

    # Validate size (read in chunks)
    contents = b""
    while chunk := await file.read(1024 * 1024):
        contents += chunk
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    filename = f"{uuid.uuid4().hex}{ext}"
    target_dir = ensure_upload_dir(subdir)
    file_path = target_dir / filename
    with open(file_path, "wb") as f:
        f.write(contents)
    ...
```

### Considerations
- The `content_type` attribute on `UploadFile` comes from the client and can be spoofed — do not rely on it alone. Combine extension check + MIME check + magic-byte detection using `python-magic` for defence in depth.
- Uploaded files stored in `../../uploads/` are served via the frontend's reverse proxy (Caddy). Ensure the proxy serves this directory with `Content-Disposition: attachment` to prevent in-browser rendering.
- Virus scanning (ClamAV) is recommended for production deployments accepting uploads from untrusted users.

---

## 2. JWT Middleware Hardening

**Severity:** Low  
**Risk:** The Next.js middleware at `frontend/middleware.ts` decodes JWTs via base64 without verifying the signature. This is acceptable because the middleware only uses the payload for client-side redirect decisions (e.g., blocking non-superadmins from `/admin` routes). The actual authorisation is enforced server-side by FastAPI dependencies.

### Recommended approach

If the middleware is ever used to make security-critical decisions, add server-side JWT verification:

1. Expose the JWT secret to the frontend via `NEXT_PUBLIC_JWT_SECRET` (or better, a server-side-only variable).
2. Use a library like `jose` to verify token signatures in the middleware.
3. Alternatively, make the middleware call the backend's `/auth/me` endpoint (with a server-side fetch) to validate the session cryptographically.

### Current mitigation
Any tampered JWT will be rejected at the API level by `decode_token` in `security.py`. The middleware's base64-only decode is an optimisation for UX (fast redirect), not a security boundary.

---

## 3. `is_superadmin` Column Cleanup

**Severity:** Low  
**Risk:** The `is_superadmin` column on the `users` table is a deprecated artefact from an earlier role system. The RBAC system now uses the `roles` table and the `RoleChecker` dependency (superadmins are identified by `role.name == "superadmin"`). The column is still populated and returned in API responses but is no longer the source of truth.

### Issues
- Dead code increases maintenance surface area.
- Could cause confusion during debugging (two sources of truth for superadmin status).
- The `is_superadmin` claim in JWTs is for convenience only — the backend always verifies against the DB.

### Recommended migration

1. Remove the `is_superadmin` column from the `User` model in `models.py`:
   - Delete `is_superadmin: Mapped[bool] = mapped_column(...)` from `User`.
2. Create an Alembic migration to drop the column.
3. Update all references:
   - `backend/app/modules/identity/router.py` — remove `is_superadmin` from JWT payloads and `/auth/me` response.
   - `backend/app/modules/identity/dependencies.py` — the `PermissionChecker` class uses `current_user.is_superadmin` — change to `current_user.role.name == "superadmin"`.
   - `backend/app/modules/identity/schemas.py` — remove `is_superadmin` from `UserResponse` and `LinkedUserInfo`.
   - `frontend/` — any code reading `user.is_superadmin` should use `user.role.name === "superadmin"` instead.
   - `frontend/middleware.ts` — the JWT payload includes `is_superadmin`; either stop including it or keep it as a convenience claim (no security impact since it's not verified).

### Note
This is a clean-up task with no security impact as long as the RBAC layer is the single source of truth. It should be done in a dedicated refactoring cycle with thorough testing.

---

## 4. Password History / Rotation

**Severity:** Low  
**Risk:** Users can reuse previous passwords since there is no password history tracking.

### Recommended approach
Add a `password_history` table to store bcrypt hashes of the last N passwords per user. Enforce no-reuse on password change in the `UserUpdate` endpoint.

---

## 5. Audit Log Retention

**Severity:** Low  
**Risk:** The `audit_logs` table has no retention policy and will grow unbounded, potentially causing performance degradation and storage issues.

### Recommended approach
Add a scheduled job (or database trigger) to archive or delete audit log entries older than 90 days. Consider a separate audit log archive table or external logging service (e.g., Logstash, Papertrail).
