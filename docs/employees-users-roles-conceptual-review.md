# Employees, Users, Roles — Conceptual Review

**Author:** AI-generated draft for supervisor review
**Status:** Draft — needs review and sign-off
**Date:** 2026-07-02

---

## Table of Contents

1. [Overview — The Three Pages](#1-overview--the-three-pages)
2. [Employees Page — HR Management](#2-employees-page--hr-management)
3. [Users Page — System Account Management](#3-users-page--system-account-management)
4. [Roles Page — Permission Configuration](#4-roles-page--permission-configuration)
5. [Entity Relationships](#5-entity-relationships)
6. [Data Flow & Lifecycle](#6-data-flow--lifecycle)
7. [Authorization Model](#7-authorization-model)
8. [Conceptual Issues & Points for Review](#8-conceptual-issues--points-for-review)
9. [Open Questions](#9-open-questions)

---

## 1. Overview — The Three Pages

The system has three distinct management pages in the identity & authorization domain:

| Page | Route | Purpose | Primary Audience |
|------|-------|---------|-----------------|
| Employees | `/dashboard/employees` | HR records — track who works at the institution | Managers, SuperAdmin |
| Users | `/dashboard/users` | System accounts — manage who can log in | SuperAdmin only |
| Roles | `/dashboard/roles` | Authorization — configure what each role can access | SuperAdmin only |

These three pages map to three database entities that form a chain:

```
Employee  ──optional──→  User  ──required──→  Role  ──many-to-many──→  Permission
(HR record)             (login identity)     (auth level)            (access rights)
```

---

## 2. Employees Page — HR Management

### 2.1 Purpose

The Employees page is an **HR record management system**. It tracks every person who works at or for the institution, regardless of whether they need computer system access. It replaces the old pattern where HR data was stored directly on the User model.

### 2.2 Functionality

| Feature | Detail |
|---------|--------|
| **List** | Table showing: full_name, employee_type, phone, salary, system access badge, status |
| **Filter** | By employee_type (9 types: teacher, manager, secretary, cleaner, security, receptionist, accountant, maintenance, other) + free-text search by name |
| **Create** | Modal with: full_name, employee_type, phone, salary, hire_date, contract_end_date, address |
| **Edit** | Same fields, pre-populated |
| **Deactivate** | Soft-delete (`is_active = false`), row goes opaque |
| **View Detail** | Click name → `/dashboard/employees/{id}` page showing full HR info + linked user card if exists |
| **Grant Access** | If employee has no linked user: click to open modal → enter email, password, role → creates a User record linked to this Employee |
| **Revoke Access** | If employee has a linked user: click to confirm → deactivates the linked User |

### 2.3 Database Model

```
Employee:
  id                UUID (PK)
  full_name         VARCHAR(255), NOT NULL
  employee_type     ENUM (teacher|manager|secretary|cleaner|security|receptionist|accountant|maintenance|other)
  phone_number      VARCHAR(50), nullable
  salary            FLOAT, nullable
  hire_date         DATE, nullable
  contract_end_date DATE, nullable
  address           TEXT, nullable
  is_active         BOOLEAN, default true
  created_at        TIMESTAMP
  updated_at        TIMESTAMP
  ─────────────────────────────────────────────
  user              relationship → User (optional, one-to-one via User.employee_id)
```

### 2.4 Access Control

- **SuperAdmin**: full access (list, create, edit, deactivate, grant/revoke access)
- **Manager**: full access (same as SuperAdmin for this page)
- **Secretary**: no access
- **Teacher**: no access

### 2.5 Key Insight

An **Employee** is purely an HR concept. It represents a person with a job at the institution. It does **not** imply the ability to log into the system. An Employee can exist with zero User accounts linked to them (e.g., a cleaner who just gets a salary but never touches the computer).

---

## 3. Users Page — System Account Management

### 3.1 Purpose

The Users page is a **system identity management** tool. It manages who has login credentials and can access the LIMS application. Each User represents a digital identity with authentication data (email + password), a role assignment, and an optional link back to an Employee record.

### 3.2 Functionality

| Feature | Detail |
|---------|--------|
| **List** | Table showing: full_name, email, role badge, active/inactive badge, actions |
| **Filter** | By role (superadmin, manager, secretary, teacher, cleaner) + free-text search by name/email |
| **Create** | Modal with: full_name, email, password, role dropdown. No HR fields. |
| **Edit** | Same fields, password optional (leave blank to keep existing) |
| **Activate/Deactivate** | Toggle `is_active`. Cannot deactivate yourself. |
| **Self-label** | Current user sees "(you)" next to their own row |

### 3.3 Database Model

```
User:
  id                UUID (PK)
  email             VARCHAR(255), UNIQUE, NOT NULL
  password_hash     VARCHAR(255), NOT NULL
  full_name         VARCHAR(255), NOT NULL
  role_id           UUID (FK → roles.id), NOT NULL
  employee_id       UUID (FK → employees.id), NULLABLE
  locale_pref       VARCHAR(10), default 'ar'
  is_active         BOOLEAN, default true
  is_superadmin     BOOLEAN, default false
  ─────────────────────────────────────────────
  role              relationship → Role (many-to-one)
  employee          relationship → Employee (optional, one-to-one)
  refresh_tokens    relationship → RefreshToken (one-to-many)
  audit_logs        relationship → AuditLog (one-to-many)
```

### 3.4 Access Control

The GET /users endpoint behavior **differs by role**:

| Requestor Role | Users Visible |
|----------------|---------------|
| SuperAdmin | All users (no filter) |
| Manager | Only users with `role = teacher` |
| Secretary | Only users with `role = teacher` (same as Manager) |

Create/Update/Delete is limited to SuperAdmin and Manager, with restrictions:
- **Managers cannot** create, view, update, or deactivate SuperAdmin or Manager accounts
- **Managers can** create/update/deactivate teacher and secretary accounts

### 3.5 Key Insight

A **User** is purely a system identity. It represents the ability to authenticate and access the application. A User can exist without any linked Employee (e.g., a SuperAdmin who is an external consultant not on the HR payroll).

---

## 4. Roles Page — Permission Configuration

### 4.1 Purpose

The Roles page is an **authorization configuration** interface. It allows the SuperAdmin to define what each Role can access by toggling page-level permissions on and off.

### 4.2 Functionality

| Feature | Detail |
|---------|--------|
| **Role tabs** | Tabs to switch between roles (superadmin, manager, secretary, teacher + any custom roles) |
| **Permission grid** | Permissions grouped by category (General, Academic, Operations, Financial, System) — 20 permissions total |
| **Toggle** | Each permission is a toggle button. Active = granted to the selected role. |
| **Save** | Sticky bottom bar with Save / Cancel buttons. Appears only when changes are dirty. |
| **Reset** | Reloads the server state, discarding local changes |

### 4.3 Database Model

```
Role:
  id                UUID (PK)
  name              VARCHAR(50), UNIQUE, NOT NULL
  ─────────────────────────────────────────────
  users             relationship → User (one-to-many)
  role_permissions  relationship → RolePermission (one-to-many)

Permission:
  id                UUID (PK)
  codename          VARCHAR(100), UNIQUE, NOT NULL  (e.g., "page_employees")
  label             VARCHAR(255), NOT NULL            (e.g., "Employee Management")
  group             VARCHAR(50), NOT NULL             (e.g., "General")
  ─────────────────────────────────────────────
  role_permissions  relationship → RolePermission (one-to-many)

RolePermission (join table):
  role_id           UUID (FK → roles.id), PK
  permission_id     UUID (FK → permissions.id), PK
```

### 4.4 Access Control

- **SuperAdmin only.** The page renders an "Access Denied" screen for any other role.
- The endpoint `/api/v1/permissions/*` uses `superadmin_gate` dependency.

### 4.5 Permission Seed Data (20 permissions)

| Group | Codename | Label |
|-------|----------|-------|
| General | `page_dashboard` | Dashboard |
| General | `page_users` | User Management |
| General | `page_employees` | Employee Management |
| General | `page_roles` | Roles & Permissions |
| Academic | `page_courses` | Courses |
| Academic | `page_sections` | Course Sections |
| Academic | `page_students` | Students |
| Academic | `page_enrollments` | Enrollments |
| Operations | `page_attendance` | Attendance |
| Operations | `page_gradebook` | Gradebook |
| Financial | `page_payments` | Payments |
| Financial | `page_expenses` | Expenses |
| Financial | `page_revenue` | Revenue |
| Financial | `page_teacher_wallet` | Teacher Wallet |
| Financial | `page_daily_closures` | Daily Closures |
| Financial | `page_pos` | Point of Sale |
| System | `page_ingestion` | Curriculum Ingestion |
| System | `page_health` | System Health |
| System | `page_backups` | Database Backups |
| System | `page_settings` | Settings |

### 4.6 Key Insight

A **Role** is an authorization container. It sits between Users and Permissions, grouping access rights so they can be assigned to multiple users. The Roles page is the control panel for the permission system. SuperAdmin bypasses all permission checks (always has access to everything).

---

## 5. Entity Relationships

### 5.1 Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        EMPLOYEE                                 │
│  (HR record: who works here)                                    │
│                                                                 │
│  id, full_name, employee_type, phone, salary,                   │
│  hire_date, contract_end, address, is_active                    │
│                                                                 │
│  Can exist WITHOUT a User (cleaner, security guard, etc.)       │
└──────────┬──────────────────────────────────────────────────────┘
           │ 1
           │ optional (User.employee_id)
           │
           ▼ 0..1
┌─────────────────────────────────────────────────────────────────┐
│                          USER                                   │
│  (System identity: who can log in)                              │
│                                                                 │
│  id, email, password_hash, full_name, role_id, employee_id,     │
│  locale_pref, is_active, is_superadmin                          │
│                                                                 │
│  Can exist WITHOUT an Employee (external consultant SuperAdmin) │
└──────────┬──────────────────────────────────────────────────────┘
           │ *
           │ required (User.role_id)
           │
           ▼ 1
┌─────────────────────────────────────────────────────────────────┐
│                          ROLE                                   │
│  (Authorization level)                                          │
│                                                                 │
│  id, name                                                       │
│                                                                 │
│  4 system roles: superadmin, manager, secretary, teacher        │
│  + any custom roles (e.g., cleaner)                             │
└──────────┬──────────────────────────────────────────────────────┘
           │ *
           │ many-to-many via RolePermission
           │
           ▼ *
┌─────────────────────────────────────────────────────────────────┐
│                       PERMISSION                                │
│  (Access right — page/feature level)                            │
│                                                                 │
│  id, codename, label, group                                     │
│                                                                 │
│  20 seeded permissions, one per dashboard page                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Cardinality Rules

| From | To | Cardinality | Rule |
|------|----|-------------|------|
| Employee | User | 1 : 0..1 | An Employee may have 0 or 1 linked User accounts |
| User | Employee | 1 : 0..1 | A User may have 0 or 1 linked Employee records |
| User | Role | * : 1 | Every User must have exactly one Role |
| Role | Permission | * : * | A Role can have many Permissions; a Permission can belong to many Roles |

### 5.3 Practical Examples

| Scenario | Employee exists? | User exists? | Role | Can log in? |
|----------|-----------------|-------------|------|-------------|
| Full-time teacher | Yes | Yes | teacher | Yes |
| Manager who is also staff | Yes | Yes | manager | Yes |
| External SuperAdmin (not staff) | No | Yes | superadmin | Yes |
| Cleaner (no system access) | Yes | No | — | No |
| Cleaner with disabled account | Yes | Yes (inactive) | cleaner | No (blocked by both `!is_active` and `cleaner ∉ VALID_SYSTEM_ROLES`) |
| Security guard | Yes | No | — | No |
| Accountant | Yes | No | — | No |

---

## 6. Data Flow & Lifecycle

### 6.1 Creating an Employee

```
User opens /dashboard/employees
  → Fills form: name, type, phone, salary, dates, address
  → POST /api/v1/employees
  → Backend creates Employee record (no user account)
  → Employee appears in list with "No Access" badge
```

### 6.2 Granting System Access

```
User clicks "Grant System Access" on an Employee row
  → Modal: email, password, role (dropdown, excludes superadmin)
  → POST /api/v1/employees/{id}/grant-access
  → Backend creates a User with employee_id = this employee
  → Employee list now shows "Has Access" badge
  → New User appears in /dashboard/users list
```

### 6.3 Creating a User Directly

```
User opens /dashboard/users
  → Fills form: name, email, password, role
  → POST /api/v1/users
  → Backend creates a User (no linked Employee)
  → User appears in list
  → No Employee record exists — no HR data, no salary, etc.
```

### 6.4 Linking an Existing User to an Employee

Can be done two ways:
1. **From Employee's Grant Access** → creates a new User with `employee_id` set
2. **From User edit** → `PUT /api/v1/users/{id}` with `employee_id` field (schema allows it)

There is currently **no UI** on either page to link an existing Employee to an existing User or vice versa. The link is created only at User creation time via Grant Access.

### 6.5 Revoking Access

```
User clicks "Revoke System Access" on an Employee row
  → Confirmation modal
  → POST /api/v1/employees/{id}/revoke-access
  → Backend sets linked User.is_active = false
  → Employee still exists, but badge changes to "No Access"
  → User is deactivated (can't log in, appears in Users list as inactive)
```

### 6.6 Deactivating an Employee

```
User clicks deactivate on an Employee row
  → Confirmation modal
  → DELETE /api/v1/employees/{id}
  → Backend sets Employee.is_active = false
  → Linked User is NOT automatically deactivated (they remain active independently)
```

### 6.7 Deactivating a User

```
User clicks deactivate on a User row
  → Confirmation modal
  → PUT /api/v1/users/{id} with is_active = false
  → Backend sets User.is_active = false
  → Employee is NOT affected (they remain active independently)
```

---

## 7. Authorization Model

### 7.1 How Authorization Works

```
Login Flow:
  1. User submits email + password → POST /auth/login
  2. Backend verifies password, checks User.is_active
  3. Backend checks User.role.name ∈ VALID_SYSTEM_ROLES
     (valid = {"superadmin", "manager", "secretary", "teacher"})
  4. If all pass → JWT issued (payload: sub, role, is_superadmin)
  5. Frontend stores user info + fetches GET /auth/me/permissions

Page Access (Frontend):
  1. Sidebar items have a `permission` field (e.g., "page_employees")
  2. `hasPageAccess()` checks:
     a. If user.is_superadmin → always true
     b. If permissions array loaded → check if permission codename is included
     c. Fallback: hardcoded role map (PAGE_PERMISSION_MAP in layout.tsx)
  3. Items without access are filtered out of the navigation

API Access (Backend):
  1. Some endpoints use RoleChecker (checks role name only)
  2. Some endpoints use PermissionChecker (checks DB for specific codename)
  3. SuperAdmin always passes all checks

Permission Resolution:
  GET /auth/me/permissions:
    - If user.is_superadmin → return ALL 20 permission codenames
    - Otherwise → SELECT codename FROM permissions
                   JOIN role_permissions ON permissions.id = role_permissions.permission_id
                   WHERE role_permissions.role_id = user.role_id
```

### 7.2 Hybrid Authorization State

The system currently has **two authorization mechanisms** operating in parallel:

| Mechanism | How it works | Where used |
|-----------|--------------|------------|
| `RoleChecker` | Checks `user.role.name ∈ allowed_roles` list | Most API endpoints (legacy) |
| `PermissionChecker` | Queries DB for permission codename on current user's role | Newer permission-aware endpoints |
| Sidebar permission map | Hardcoded `PAGE_PERMISSION_MAP` in `layout.tsx` (fallback) | Frontend navigation filtering |

This hybrid state exists because the migration from hardcoded RBAC to the configurable permission system is in progress. The `PAGE_PERMISSION_MAP` in the frontend layout mirrors what the seeded default permissions configure, acting as a fallback when permissions haven't loaded yet.

### 7.3 Permission Groups

| Group | Purpose |
|-------|---------|
| General | Core navigation pages (dashboard, users, employees, roles) |
| Academic | Teaching & learning pages (courses, sections, students, enrollments) |
| Operations | Day-to-day operations (attendance, gradebook) |
| Financial | Money-related pages (payments, expenses, revenue, wallet, closures, POS) |
| System | Technical administration (ingestion, health, backups, settings) |

---

## 8. Conceptual Issues & Points for Review

The following areas may have conceptual mixing or design tension that the supervisor should review.

### 8.1 Overlap Between Employee Types and Roles

Employee types and system roles share three identical labels (`teacher`, `manager`, `secretary`) but are semantically different:

| | Employee Type | System Role |
|--|---------------|-------------|
| **Domain** | HR / Job classification | IT / System authorization |
| **Defined in** | `EmployeeType` enum (9 values) | `roles` DB table |
| **Purpose** | Determines job function, salary band | Determines page access, API permissions |
| **Who sets it** | HR / Manager | SuperAdmin via Roles page |
| **Direct link** | Employee.employee_type | User.role_id → Role |

**Tension:** A teacher-type Employee can be granted access with a `manager` role, and a manager-type Employee could be given a `teacher` role. There is no validation ensuring employee_type and role are consistent. This is intentional (flexibility), but could be confusing for operators who expect a Teacher-type employee to automatically get a Teacher role.

### 8.2 Managers Can Create Users (via Grant Access) But Cannot See Users Page

This is a deliberate restriction, but it creates an interesting asymmetry:

- **Managers CAN** create a User by going to Employees → Grant Access → fills email/password/role → User appears in the system
- **Managers CANNOT** see the Users page (it's filtered out of their sidebar via `page_users` permission)
- **Managers CANNOT** manage, deactivate, or edit Users they created (except by Revoke Access from the Employee page)

**Result:** A Manager can create a User but has limited ability to manage that User afterward. If a created User needs a password reset, the Manager must ask the SuperAdmin.

### 8.3 Soft Delete Independence

Deactivating an Employee does **not** deactivate the linked User, and vice versa:

| Action | Employee affected? | Linked User affected? |
|--------|-------------------|----------------------|
| Deactivate Employee | ✅ `is_active = false` | ❌ Unchanged |
| Deactivate User | ❌ Unchanged | ✅ `is_active = false` |
| Revoke Access (from Employee) | ❌ Unchanged | ✅ `is_active = false` |
| Deactivate Employee then Revoke Access | ✅ Deactivated | ✅ `is_active = false` |

**Question for review:** Should deactivating an Employee automatically trigger Revoke Access on their linked User? Currently the two are independent, which means an employee can be deactivated (inactive staff) but their user account remains active (they can still log in). This may or may not be desired behavior.

### 8.4 The Cleaner Role Problem

The `cleaner` value exists in **both** the EmployeeType enum and as a Role in the `roles` table. However:

- Cleaner-type Employee records with no User account = clean (correct — HR record, no system access)
- Cleaner-type Employee records where someone accidentally granted access with `cleaner` role = creates a User the old way
- Cleaner users **cannot log in** — login checks `VALID_SYSTEM_ROLES` which excludes `cleaner`
- But cleaner users **appear in the Users list** and can be edited
- The `cleaner` role in the Roles dropdown shows up in the permission toggle grid

**Question for review:** Should the `cleaner` role be removed entirely from the system? It serves no practical purpose (can't log in, has no permissions by default). The cleaner Employee type is sufficient for HR tracking.

### 8.5 Users List Role Filtering Is Inconsistent

The GET /users endpoint uses different filtering logic depending on who requests:

```
SuperAdmin → sees all users across all roles
Manager    → sees only users with role = teacher
Secretary  → sees only users with role = teacher
```

This means:
- A Manager cannot see other Manager accounts in the Users list
- A Manager cannot see SuperAdmin accounts in the Users list
- The Users page appears to show a subset of users, but the user has no indication that the list is filtered
- If a Manager has created teacher accounts via Grant Access, they can see them; if they created secretary accounts, they cannot

**Question for review:** Is this intentional (Manager should only manage teachers on the Users page) or should Manager see all non-SuperAdmin users? The asymmetry with the Grant Access flow (which lets a Manager choose any role for the new user) makes this feel inconsistent.

### 8.6 Permission Model vs. RoleChecker Dual System

The migration from `RoleChecker` to `PermissionChecker` is partial. Currently:

- The **frontend sidebar** uses the new permission system (checks `permissions.includes("page_xxx")`)
- The **frontend Users page** does NOT check permissions — it relies on the API returning filtered results
- Most **backend endpoints** still use `RoleChecker(["superadmin", "manager"])` rather than `PermissionChecker("page_employees")`
- The `Roles` page itself uses `superadmin_gate` (hardcoded), not `PermissionChecker("page_roles")`
- The `PAGE_PERMISSION_MAP` fallback in `layout.tsx` hardcodes role-to-page mappings that duplicate what the permission seed data already defines

**Tension:** A SuperAdmin can toggle permissions on the Roles page, but many backend endpoints don't actually check those permissions. The fronten might hide a nav item, but the API endpoint is still accessible if you know the URL. This is a security gap that needs to be resolved — either the permission system should be fully enforced at the API level, or the Roles page should clarify that it only controls sidebar visibility.

### 8.7 Employee "full_name" vs User "full_name"

Both Employee and User have a `full_name` field. When Grant Access creates a User from an Employee, the Grant Access form has its own `full_name` field (pre-populated with the Employee's name), but the User's `full_name` is independent.

This means:
- You can rename the User's full_name to something different from the Employee's full_name
- There is no sync mechanism between the two

**Question for review:** Should the User's `full_name` default from the Employee's `full_name` with an option to override? Should they be kept in sync?

---

## 9. Open Questions

1. **Should Manager have access to the Users page?** Currently yes for teachers only, but the permission system has `page_users` assigned to SuperAdmin only. Which is the source of truth?

2. **Should deactivating an Employee cascade to the linked User?** Current behavior: independent. Suggestion: make it configurable or add a warning.

3. **Should the cleaner role be removed?** It exists in the DB but adds no value — a cleaner Employee type without a User account is the correct pattern.

4. **Should PermissionChecker replace RoleChecker everywhere?** Without full backend enforcement, the Roles page gives the illusion of control that doesn't actually restrict API access.

5. **Should the Users list show ALL users to Manager, or just teachers?** The current code restricts by role, but the frontend gives no indication of filtering.

6. **Should employee_type and role be validated for consistency?** Currently a teacher-type employee can be granted manager system access. Is this acceptable flexibility or a conceptual mismatch?

---

*This document is intended for internal review. Please mark up with corrections, additions, and decisions.*
