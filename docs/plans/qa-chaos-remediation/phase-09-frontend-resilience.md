# Phase 9: Frontend Resilience — UX, Error States, Input Validation

**Owner:** Frontend
**Estimate:** 3 days
**Dependencies:** None (no backend dependencies)

## Audit Items Covered

- **S02:** Trailing spaces in student name — input sanitization
- **S03:** SQL LIKE wildcards in search — escape special characters
- **S04:** Arabic/English mixed input — locale validation for name fields
- **S05:** Expired session during form fill — F04 fix (hung promise)
- **S06:** Permission denied silent redirect — user-facing message
- **S09:** Network glitch retry — add retry + user error feedback
- **S11:** Dashboard stale after bulk-grade — force refetch on navigation
- **S12:** Empty report export — handle empty data gracefully
- **S17:** Browser back after form submission — PRG pattern
- **S18:** Token rotation 401 race — fix `isRedirectingToLogin` never-reset
- **S22:** Refresh token rotation during logout — coordination fix
- **F04:** `new Promise<never>(() => {})` → `Promise.reject()`
- **F05:** Logout API failure — fix error handling
- **F06:** Students page error swallowed — user-facing error display
- **F07:** Sections page error swallowed — proper error UI
- **F08:** Contract fetch failure — handle gracefully
- **F09:** 401 vs network error vs 500 — differentiate in error handler

## Tasks

### 9.1 Fix Hung Promise (F04, S05)

In `frontend/lib/api.ts` at line 45:

```typescript
// Current:
return new Promise<never>(() => {})  // NEVER SETTLES — hangs forever

// Fixed:
return Promise.reject(new Error("Session expired — please log in again"))
```

### 9.2 Fix isRedirectingToLogin Never-Reset (S18)

In `frontend/lib/api.ts` at ~line 16:

```typescript
// Current:
let isRedirectingToLogin = false
// ... somewhere:
if (!isRedirectingToLogin) {
  isRedirectingToLogin = true
  window.location.href = "/login"
  // isRedirectingToLogin is NEVER reset
}

// Fixed:
if (!isRedirectingToLogin) {
  isRedirectingToLogin = true
  window.location.href = "/login"
  // Reset after navigation completes
  setTimeout(() => { isRedirectingToLogin = false }, 5000)
}
```

### 9.3 Fix Error Discrimination (F09)

In `frontend/lib/api.ts`, modify the response interceptor to distinguish error types:

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status
      if (status === 401) {
        // Auth failure — redirect to login
        return handleTokenRefresh(error)
      } else if (status === 403) {
        // Permission denied — show message
        return Promise.reject(new PermissionError(error.response.data?.detail))
      } else if (status >= 500) {
        // Server error
        return Promise.reject(new ServerError("Server error. Please try again."))
      }
    } else if (error.request) {
      // No response received — network error
      return Promise.reject(new NetworkError("Network error. Check your connection."))
    }
    return Promise.reject(error)
  }
)
```

### 9.4 Fix Logout Error Handling (F05)

In `frontend/components/AuthContext.tsx` at lines 85-96:

```typescript
// Current:
catch (error) {
  // swallowed
} finally {
  window.location.href = "/login"
}

// Fixed:
catch (error) {
  logger.warn("Logout API call failed, clearing session anyway", { error })
  Sentry.captureException(error)
} finally {
  // Clear all cookies regardless of API result
  document.cookie.split(";").forEach(c => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/")
  })
  window.location.href = "/login"
}
```

### 9.5 Fix Session Token Rotation (S22)

In AuthContext.tsx, add coordination between logout and refresh:

```typescript
// Before attempting logout, cancel any in-flight refresh:
if (refreshPromise) {
  // Wait for refresh to settle before logging out
  await refreshPromise.catch(() => {})  // Ignore refresh result
  refreshPromise = null
}
// Now proceed with logout
```

### 9.6 Fix Error Display on Students/Sections Pages (F06, F07, F08)

For each page component:

**Students page:**
```typescript
// Current:
catch (e) { console.error(e) }

// Fixed:
catch (e) {
  logger.error("Failed to save student", { error: e })
  setError("Failed to save. Please try again.")
  // Show user-facing toast/alert
}
```

**Sections page:**
```typescript
// Current:
.catch(() => null)
.catch(() => {})

// Fixed:
.catch((e) => {
  logger.warn("Failed to fetch lookup data", { error: e })
  return null  // Still return null, but at least log it
})
.catch((e) => {
  logger.error("Unexpected error in section page", { error: e })
  return undefined
})
```

Add a reusable `ErrorMessage` or `ErrorAlert` component to display errors to the user.

### 9.7 Add Form Submitting/Disabled States (S01 frontend part)

Every form submit button must:

```typescript
const [submitting, setSubmitting] = useState(false)

const handleSubmit = async () => {
  if (submitting) return  // Guard double-click
  setSubmitting(true)
  try {
    await api.post("/endpoint", data)
  } finally {
    setSubmitting(false)
  }
}

// In JSX:
<button type="submit" disabled={submitting}>
  {submitting ? "Saving..." : "Save"}
</button>
```

Files to update: All page components with forms (students, sections, payments, enrollments, expenses, refunds, etc.).

### 9.8 Add PRG Pattern (S17)

After successful form submission, use `window.location.href` or Next.js `router.replace()`:

```typescript
// After successful save:
router.replace("/success-page")
// Instead of:
// No redirect — page stays on form with stale data
```

This prevents the browser back-button from resubmitting the form.

### 9.9 Add Input Sanitization (S02, S03)

Create `frontend/lib/utils/input.ts`:

```typescript
export function sanitizeInput(value: string): string {
  return value.trim()
}

export function escapeLikeWildcards(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

export function validateName(value: string, locale: 'ar' | 'en'): boolean {
  if (locale === 'ar') {
    return /^[\u0600-\u06FF\s]+$/.test(value.trim())
  }
  return /^[a-zA-Z\s]+$/.test(value.trim())
}
```

Apply to all form inputs where appropriate.

### 9.10 Add User-Facing Permission Denied Message (S06)

Create an `AccessDenied` component and show it when a user navigates to a page they don't have permission for:

```typescript
// In the permission check:
if (!hasPermission) {
  return <AccessDenied resourceName="Manage Users" />
}
```

### 9.11 Force Dashboard Refetch (S11)

In dashboard component, use a key or timestamp to force refetch:

```typescript
// After bulk-grade submission:
setRefetchKey(Date.now())

// In data fetching dependency:
useEffect(() => {
  fetchDashboardData()
}, [refetchKey])
```

### 9.12 Handle Empty Reports (S12)

In report views, check for empty data:

```typescript
if (!data || data.length === 0) {
  return <EmptyState message="No data for this period" />
}
```

### 9.13 Create error.tsx and loading.tsx

For the dashboard route group:

```typescript
// frontend/app/dashboard/error.tsx
'use client'
export default function DashboardError({ error, reset }) {
  return (
    <div>
      <h2>Dashboard Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )
}

// frontend/app/dashboard/loading.tsx
export default function DashboardLoading() {
  return <div>Loading dashboard...</div>
}
```

## Files to CREATE

| File | Purpose |
|------|---------|
| `frontend/lib/utils/input.ts` | Input sanitization utilities |
| `frontend/components/AccessDenied.tsx` | Permission denied component |
| `frontend/components/EmptyState.tsx` | Empty data state component |
| `frontend/app/dashboard/error.tsx` | Dashboard error boundary |
| `frontend/app/dashboard/loading.tsx` | Dashboard loading state |
| (Various page error components) | Per-page error display |

## Files to EDIT

| File | Changes |
|------|---------|
| `frontend/lib/api.ts:45` | Fix F04 — `Promise.reject()` instead of `new Promise<never>(() => {})` |
| `frontend/lib/api.ts:16` | Fix S18 — reset `isRedirectingToLogin` |
| `frontend/lib/api.ts` | Fix F09 — error discrimination (401 vs network vs 500) |
| `frontend/components/AuthContext.tsx:85` | Fix F05 — logout error handling |
| `frontend/components/AuthContext.tsx` | Fix S22 — refresh+logout coordination |
| Students page component | Fix F06 — user-facing error on save/delete failure |
| Sections page component | Fix F07, F08 — proper error UI for lookups |
| All form page components | Add `submitting` state + `disabled` on buttons |
| All form page components | Apply PRG pattern after successful submit |
| All form page components | Apply `sanitizeInput()` on text fields |
| Search components | `escapeLikeWildcards()` before sending search queries |
| Dashboard component | Force refetch on navigation from bulk-grade |
| Report views | Handle empty data gracefully |

## Independent Boundary

- Do NOT modify any backend Python files
- Do NOT modify DB schema or create migrations
- Do NOT modify Caddyfile or infrastructure
- Do NOT add rate limiting or CSRF middleware (Phase 8 concern)
- **In `frontend/lib/api.ts`, do NOT touch the idempotency-key interceptor (Phase 5 concern) — only edit lines 16, 45, and the response error handler**

## Acceptance Criteria

- [ ] No `new Promise<never>(() => {})` remains in codebase
- [ ] `isRedirectingToLogin` resets after timeout
- [ ] Error handler distinguishes 401 (redirect login) from network error (show message) from 500 (retry)
- [ ] Logout clears session even if logout API fails
- [ ] Logout cancels in-flight refresh before proceeding
- [ ] All form buttons have `disabled={submitting}` state
- [ ] PRG pattern prevents back-button resubmission
- [ ] Input sanitization trims spaces (S02) and escapes LIKE wildcards (S03)
- [ ] Permission denied shows clear message (S06)
- [ ] Dashboard refetches after bulk-grade operation
- [ ] Empty reports show "No data" message
- [ ] `error.tsx` and `loading.tsx` exist for dashboard route group
