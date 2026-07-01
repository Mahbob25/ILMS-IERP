# Plan v2.0: User vs Employee Separation & Role-Based Permission System

**Status:** Draft for Review
**Date:** 2026-06-30
**Target:** Frontend + Backend refactoring

---

## Executive Summary

The system currently conflates **system users** (people who can log in) with **employees** (people who work at the institution). Every person in the system has an email, password, and role — which means even a cleaner has login credentials and appears in the Users list. This plan separates these two concepts, introduces a proper employee management system, and adds a configurable page-level permission system so the SuperAdmin can control what each role can access from the UI.

---

## 1. Problem Statement

### Current State

| Area | Problem |
|------|---------|
| **User Model** | The `users` table holds both auth fields (`email`, `password_hash`, `role_id`) AND HR fields (`salary`, `hire_date`, `phone_number`, `address`, `contract_end_date`). |
| **Employees = Users** | There is no separate `employees` table. The concept of "employee" is just a SQL filter: `WHERE is_superadmin = False`. Every employee must be a user. |
| **Cleaner Login** | The "cleaner" role was added with a full user account. Cleaners have system login access despite having no dashboard functionality. |
| **Hardcoded RBAC** | Every endpoint lists allowed roles by name (e.g., `RoleChecker(["superadmin", "manager"])`). The `roles` table only has `id` and `name` — no permission configuration. |
| **No UI for Permissions** | Changing what a role can access requires modifying source code. The SuperAdmin has no way to configure permissions from the interface. |

### Why This Matters

1. **Security risk:** Employee-only personnel (cleaners, security guards, etc.) have system login credentials they don't need.
2. **Data model confusion:** HR fields on the `users` table mix authentication data with personnel records.
3. **No extensibility:** Adding a new role (e.g., "student" or "accountant") requires code changes across the entire backend.
4. **Manager limitations:** The Manager can manage employees but can't see or configure role permissions.

---

## 2. Target Architecture

### 2.1 Two Distinct Entities

```
┌──────────────────────────┐       ┌──────────────────────────┐
│        EMPLOYEE          │       │          USER            │
│                          │       │                          │
│  id (PK)                 │       │  id (PK)                 │
│  full_name               │       │  email                   │
│  employee_type           │       │  password_hash           │
│  phone_number            │◄──────│  role_id (→ roles)       │
│  salary                  │  opt. │  employee_id (→ employees)│
│  hire_date               │  link │  is_superadmin           │
│  contract_end_date       │       │  is_active               │
│  address                 │       │  locale_pref             │
│  is_active               │       │                          │
│                          │       │  NO HR fields here       │
└──────────────────────────┘       └──────────────────────────┘
```

**Key Rules:**
- An **Employee** can exist without a User (cleaner, security guard, etc.)
- A **User** can exist without an Employee (SuperAdmin who is not staff)
- A **Teacher** must have both: Employee (for HR) + User (for system access)
- The link is `users.employee_id → employees.id` (optional, SET NULL on delete)
- `CourseSection.teacher_id` and `TeacherWallet.teacher_id` still reference `users.id` (system identity)

### 2.2 Permission System

```
┌──────────┐     ┌──────────────────────┐     ┌──────────────┐
│  ROLES   │     │   ROLE_PERMISSIONS   │     │ PERMISSIONS  │
│          │     │                      │     │              │
│ id (PK)  │────>│ role_id (FK)         │<────│ id (PK)      │
│ name     │     │ permission_id (FK)   │     │ codename     │
└──────────┘     └──────────────────────┘     │ label        │
                                              │ group        │
                                              └──────────────┘
```

**Design:**
- Each **Permission** represents access to a page/feature (e.g., `page_employees`, `page_courses`)
- Permissions are grouped by category (General, Academic, Operations, Financial, System)
- Each **Role** has a set of granted permissions via the join table
- **SuperAdmin** always bypasses permission checks (same as current behavior)
- The **SuperAdmin** can toggle permissions for any role from the Roles UI page
- New roles added in the future start with zero permissions by default

### 2.3 System User Roles

Only these 4 roles can log in. The `cleaner` role (and any future employee-only types) cannot:

| Role | Can Login | Can Manage Employees | Can Manage Users/Roles |
|------|-----------|---------------------|----------------------|
| superadmin | Yes | Yes | Yes |
| manager | Yes | Yes | No |
| secretary | Yes | No | No |
| teacher | Yes | No | No |

---

## 3. Detailed Changes

### 3.1 Database Migration

**New Migration (after `202606300000`):**

**A. Create `employees` table:**
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    employee_type VARCHAR(50) NOT NULL,
    phone_number VARCHAR(50),
    salary FLOAT,
    hire_date DATE,
    contract_end_date DATE,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**B. Modify `users` table:**
- `DROP COLUMN phone_number, salary, hire_date, contract_end_date, address`
- `ADD COLUMN employee_id UUID REFERENCES employees(id) ON DELETE SET NULL`

**C. Create `permissions` table:**
```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codename VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    "group" VARCHAR(50) NOT NULL
);
```

**D. Create `role_permissions` table:**
```sql
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
```

**E. Data migration (in the same migration):**
- For each existing user with non-null HR fields: create an `employees` record and set `users.employee_id`
- For each existing user with role `cleaner`: create an `employees` record (type = 'cleaner'), set `users.is_active = false`
- Seed 21 permissions (one per dashboard page)
- Seed role_permissions matching the current hardcoded RBAC rules
- Keep the `cleaner` role in DB for historical FK integrity, but mark as non-login

### 3.2 Backend Models (`models.py`)

**Add:**
- `Employee` model with all HR fields + employee_type + timestamps
- `Permission` model with codename, label, group
- `RolePermission` association model (role_id, permission_id composite PK)

**Modify `User`:**
- Remove: `phone_number`, `salary`, `hire_date`, `contract_end_date`, `address`
- Add: `employee_id` (FK → employees.id, nullable)
- Add: `employee` relationship

### 3.3 Backend Schemas (`schemas.py`)

**New schemas:**
- `EmployeeCreate` — full_name, employee_type, phone?, salary?, hire_date?, contract_end_date?, address?
- `EmployeeUpdate` — all optional
- `EmployeeResponse` — includes `has_user_account: bool` (computed)
- `EmployeeDetailResponse` — employee details + linked user info if any
- `PermissionResponse` — id, codename, label, group
- `RolePermissionsResponse` — role_id, permission_codenames[]
- `RolePermissionsUpdate` — permission_codenames[]
- `UserPermissionResponse` — permissions: string[] (for frontend session)

**Modified schemas:**
- `UserCreate` — remove HR fields, add optional `employee_id`
- `UserUpdate` — remove HR fields, add optional `employee_id`
- `UserResponse` — remove HR fields, add optional `employee_id`
- Remove old `EmployeeResponse` (which extended UserResponse)

### 3.4 Backend Service (`service.py`)

**New functions:**
- `create_employee(db, data) → Employee`
- `get_employees(db, employee_type?, search?) → list`
- `get_employee_by_id(db, id) → Employee`
- `update_employee(db, employee, data) → Employee`
- `soft_delete_employee(db, employee) → Employee`
- `grant_user_access(db, employee_id, email, password, role_id) → User` — creates linked user
- `get_all_permissions(db) → list`
- `get_role_permissions(db, role_id) → list[str]` — returns codenames
- `set_role_permissions(db, role_id, permission_codenames) → None`
- `get_user_permissions(db, user_id) → list[str]` — for current user session

### 3.5 Backend Router (`router.py`)

**New employee endpoints (under `/employees`):**
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/employees` | superadmin, manager | Create employee |
| GET | `/employees` | superadmin, manager | List employees (filter by type, search) |
| GET | `/employees/{id}` | superadmin, manager | Get employee detail |
| PUT | `/employees/{id}` | superadmin, manager | Update employee |
| DELETE | `/employees/{id}` | superadmin, manager | Soft-delete employee |
| POST | `/employees/{id}/grant-access` | superadmin, manager | Create linked user account |
| DELETE | `/employees/{id}/revoke-access` | superadmin, manager | Remove linked user access |

**New permission endpoints:**
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/permissions` | superadmin | List all permissions |
| GET | `/roles/{role_id}/permissions` | superadmin | Get permissions for a role |
| PUT | `/roles/{role_id}/permissions` | superadmin | Set permissions for a role |

**New auth endpoint:**
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/auth/me/permissions` | authenticated | List current user's permission codenames |

**Modified user endpoints:**
- `POST /users` — accept `employee_id`, reject HR fields
- `PUT /users/{id}` — accept `employee_id`, reject HR fields
- `POST /auth/login` — add check: only allow roles in `{"superadmin", "manager", "teacher", "secretary"}`

**Removed endpoints:**
- `GET /users/employees` → replaced by `GET /employees`
- `GET /users/employees/{id}` → replaced by `GET /employees/{id}`

### 3.6 Backend Dependencies (`dependencies.py`)

**New: `PermissionChecker` class:**
```python
class PermissionChecker:
    """Check if current user's role has a specific permission codename."""
    def __init__(self, permission_codename: str):
        self.permission_codename = permission_codename

    async def __call__(self, current_user, db):
        if current_user.is_superadmin:
            return current_user
        # Check role_permissions via DB query
        ...
        if not has_permission:
            raise HTTPException(403, "Insufficient permissions")
        return current_user
```

**Migration strategy:** Keep existing `RoleChecker` for backward compatibility during transition. New endpoints use `PermissionChecker`. Over time, all endpoints migrate to `PermissionChecker`.

### 3.7 Frontend — New Pages

#### `/dashboard/employees` (HR Management)

| Feature | Detail |
|---------|--------|
| Table | Columns: full_name, employee_type, phone, salary, status, linked user badge |
| Filters | By employee_type (free-text), search by name |
| Create/Edit | Modal with fields: full_name, employee_type, phone, salary, hire_date, contract_end, address |
| Grant Access | Button "Grant System Access" → modal: email, password, role (teacher/secretary only) |
| Revoke Access | Button "Revoke System Access" → confirmation → soft-delete the linked user |
| Deactivate | Soft-delete the employee record |

#### `/dashboard/employees/[id]` (Employee Detail)

- HR info card (full_name, type, phone, salary, dates, address)
- Linked user info card (if exists): email, role, status, link to user management
- If linked user is a teacher: sections, wallet, activity (same as current)
- Actions: Edit, Grant/Revoke Access, Deactivate

#### `/dashboard/roles` (Permission Management — SuperAdmin only)

Grid layout:
| Permission | superadmin | manager | secretary | teacher |
|------------|-----------|---------|-----------|---------|
| Dashboard | ✓ (locked) | ✓ | ✓ | ✓ |
| User Management | ✓ (locked) | ✗ | ✗ | ✗ |
| Employee Management | ✓ (locked) | ✓ | ✗ | ✗ |
| Courses | ✓ (locked) | ✓ | ✓ | ✓ |
| ... | | | | |

- SuperAdmin column is locked (all checked)
- Other roles are toggleable
- Save button per row or per role

### 3.8 Frontend — Modified Pages

#### `/dashboard/users` (Simplified)

- Only shows users with system roles: superadmin, manager, secretary, teacher
- Table columns: full_name, email, role, linked employee, status
- Create/Edit: full_name, email, password, role, optional "Link Employee" dropdown
- No HR fields in this form anymore

#### Sidebar (`layout.tsx`)

- Fetches user permissions from `GET /auth/me/permissions`
- Filters nav items based on permissions instead of hardcoded role arrays
- Falls back to hardcoded check if permissions endpoint fails

#### `AuthContext.tsx`

- User type: remove HR fields
- Add optional `permissions: string[]` to context

### 3.9 Frontend — Permission-Aware Navigation

Current sidebar filtering:
```typescript
{ name: "Employees", href: "/employees", roles: ["superadmin", "manager"] }
```

New sidebar filtering:
```typescript
{ name: "Employees", href: "/employees", permission: "page_employees" }
// Rendered only if user.permissions includes "page_employees"
```

---

## 4. Data Migration Strategy

| Step | Action |
|------|--------|
| 1 | Create `employees` table |
| 2 | For each user with HR data (non-null phone/salary etc.): create employee record, set `user.employee_id` |
| 3 | For each user with `role = cleaner`: create employee record (type = 'cleaner'), set `user.is_active = false`, delete refresh tokens |
| 4 | For each seeded teacher/manager/secretary: create optional employee records (their choice) |
| 5 | Drop HR columns from `users`, add `employee_id` column |
| 6 | Create `permissions` + `role_permissions` tables |
| 7 | Seed all 21 permissions |
| 8 | Seed default role_permissions matching current RBAC |
| 9 | Verify no orphaned FK references |

---

## 5. Backward Compatibility

| Concern | Solution |
|---------|----------|
| Existing API consumers | Old `/users/employees` endpoints return 301 redirect to new `/employees` endpoints |
| Existing tokens | JWT payload unchanged. New `permissions` field loaded separately via `/auth/me/permissions` |
| `CourseSection.teacher_id` | Still references `users.id`. No change needed. |
| `TeacherWallet.teacher_id` | Still references `users.id`. No change needed. |
| `Expense.recipient_id` | Still references `users.id`. If recipient is employee-only (no user), this FK must be updated to reference `employees.id`. **Requires discussion.** |
| `AuditLog.user_id` | Still references `users.id`. Cleaner user records remain in DB (inactive) for historical audit integrity. |

---

## 6. Permission Seed Data

### Permission List

| # | Codename | Label | Group |
|---|----------|-------|-------|
| 1 | `page_dashboard` | Dashboard | General |
| 2 | `page_users` | User Management | General |
| 3 | `page_employees` | Employee Management | General |
| 4 | `page_roles` | Roles & Permissions | General |
| 5 | `page_courses` | Courses | Academic |
| 6 | `page_sections` | Course Sections | Academic |
| 7 | `page_students` | Students | Academic |
| 8 | `page_enrollments` | Enrollments | Academic |
| 9 | `page_attendance` | Attendance | Operations |
| 10 | `page_gradebook` | Gradebook | Operations |
| 11 | `page_payments` | Payments | Financial |
| 12 | `page_expenses` | Expenses | Financial |
| 13 | `page_revenue` | Revenue | Financial |
| 14 | `page_teacher_wallet` | Teacher Wallet | Financial |
| 15 | `page_daily_closures` | Daily Closures | Financial |
| 16 | `page_pos` | Point of Sale | Financial |
| 17 | `page_ingestion` | Curriculum Ingestion | System |
| 18 | `page_health` | System Health | System |
| 19 | `page_backups` | Database Backups | System |
| 20 | `page_settings` | Settings | System |

### Default Role → Permission Mapping

**SuperAdmin:** All 20 pages (bypass check, not stored in DB)

**Manager:**
`page_dashboard`, `page_employees`, `page_courses`, `page_sections`, `page_students`, `page_enrollments`, `page_attendance`, `page_gradebook`, `page_payments`, `page_expenses`, `page_revenue`, `page_teacher_wallet`, `page_daily_closures`, `page_pos`, `page_settings`

**Secretary:**
`page_dashboard`, `page_courses`, `page_sections`, `page_students`, `page_enrollments`, `page_attendance`, `page_gradebook`, `page_payments`, `page_expenses`, `page_daily_closures`, `page_pos`, `page_settings`

**Teacher:**
`page_dashboard`, `page_courses`, `page_sections`, `page_enrollments`, `page_attendance`, `page_gradebook`, `page_teacher_wallet`, `page_ingestion`, `page_settings`

---

## 7. Implementation Phases

### Phase 1 — Database & Models
- Create migration: employees table, modify users, permissions, role_permissions
- Data migration (cleaner → employee, HR data transfer)
- Update `models.py` with new SQLAlchemy models
- Run migration, verify data integrity

### Phase 2 — Backend API
- Employee CRUD service + router
- Permission service + router
- Modify user CRUD (remove HR fields)
- Add login role validation
- Add `PermissionChecker` dependency
- Add `/auth/me/permissions` endpoint

### Phase 3 — Frontend Employees Page
- Build HR employee management page (list, create, edit, deactivate)
- Build employee detail page
- Grant/Revoke system access modals

### Phase 4 — Frontend Roles & Permissions Page
- Build permission management UI (toggle grid)
- Update sidebar to load permissions from server
- Update Users page (simplify, remove HR fields)

### Phase 5 — Cleanup & Testing
- Remove old `/users/employees` endpoints (or add redirects)
- Remove `cleaner` role from seed (keep in DB)
- Test all role combinations
- Verify cleaners cannot log in
- Verify employee-only records can be managed without user accounts

---

## 8. Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| `Expense.recipient_id` migration | **Must reference `employees.id`** | Otherwise expenses paid to employee-only staff (e.g., cleaner) break. Requires careful data migration mapping old `users.id` → new `employees.id`. |
| Seeded user employee records | **Auto-create** | Manager, Secretary, and Teacher seeded users get automatic employee records. Keeps the data model uniform and ensures they appear on the HR dashboard. |
| Employee type field | **Enum (predefined dropdown)** | Free text leads to dirty data ("cleaner", "Cleaner", "Janitor"). Enum ensures clean filtering and analytics. |
| New role permissions | **Default Deny (zero permissions)** | New roles start with zero access. SuperAdmin must explicitly toggle permissions on. Only secure posture. |
| Roles UI layout | **Clean minimalist toggles, not 20×4 grid** | Present permissions grouped by category with toggle switches. Avoid overwhelming the SuperAdmin with a dense matrix. |

---

## 9. ERD Reference: Expense.recipient_id Migration

```
BEFORE:                           AFTER:
Expense.recipient_id ──→ users.id  Expense.recipient_id ──→ employees.id
                                  (with migration to re-map existing records)
```

**Migration logic:**
```sql
-- For each expense with a recipient_id:
-- 1. Find the user record
-- 2. If the user has an employee_id link → use that employee_id
-- 3. If the user has no employee_id (shouldn't happen after migration) → create employee record
-- 4. Update expense.recipient_id to the employee.id
-- 5. Drop FK to users.id, add FK to employees.id
```

---

## 9. Visual Summary

```
BEFORE:                          AFTER:
┌──────────────────┐            ┌──────────────────┐  ┌──────────────────┐
│      USER        │            │      USER        │  │    EMPLOYEE      │
│                  │            │                  │  │                  │
│ id               │            │ id               │  │ id               │
│ email            │            │ email            │  │ full_name        │
│ password_hash    │            │ password_hash    │  │ employee_type    │
│ full_name        │            │ role_id ──────── │  │ phone_number     │
│ role_id ──────── │            │ employee_id ──── │  │ salary           │
│ phone_number  ◄──│── HR       │ is_superadmin    │  │ hire_date        │
│ salary        ◄──│  mixed     │ is_active        │  │ contract_end     │
│ hire_date     ◄──│  in        │ locale_pref      │  │ address          │
│ contract_end  ◄──│  User      │                  │  │ is_active        │
│ address       ◄──│  table     │  (no HR fields)  │  └──────────────────┘
│ is_superadmin    │            └──────────────────┘
│ is_active        │
│ locale_pref      │            New: Role → Permission mapping
└──────────────────┘            ┌──────────────────────────────────┐
                                │  ROLE_PERMISSIONS                │
Employee == User (filter)       │  superadmin → ALL pages          │
Cleaner has login access        │  manager    → 15 pages           │
No permission configurability   │  secretary  → 12 pages           │
                                │  teacher    → 9 pages            │
                                └──────────────────────────────────┘
```
