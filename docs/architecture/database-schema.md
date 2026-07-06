# Database Schema — 22 Tables

PostgreSQL 16 + pgvector. All tables use UUID primary keys with `gen_random_uuid()`.

---

## Identity Module (7 tables)

### `roles`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| name | VARCHAR(50) | UNIQUE, NOT NULL, indexed |

Seed data: superadmin, manager, secretary, teacher.

### `employees`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| full_name | VARCHAR(255) | NOT NULL |
| employee_type | ENUM | teacher, manager, secretary, cleaner, security, receptionist, accountant, maintenance, other |
| phone_number | VARCHAR(50) | nullable |
| salary | NUMERIC(12,2) | nullable |
| compensation_type | ENUM | salary, percentage, hybrid |
| default_percentage | NUMERIC(5,2) | nullable |
| hire_date | DATE | nullable |
| contract_end_date | DATE | nullable |
| address | TEXT | nullable |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL, onupdate |

### `users`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| email | VARCHAR(255) | UNIQUE, NOT NULL, indexed |
| password_hash | VARCHAR(255) | NOT NULL |
| role_id | UUID | FK → roles.id, NOT NULL, indexed |
| employee_id | UUID | FK → employees.id, nullable, indexed |
| locale_pref | VARCHAR(10) | default 'ar' |
| is_active | BOOLEAN | default true |
| is_superadmin | BOOLEAN | default false (deprecated — use role.name) |
| failed_login_attempts | INTEGER | default 0 |
| locked_until | TIMESTAMP | nullable |

### `refresh_tokens`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| user_id | UUID | FK → users.id, NOT NULL, indexed, CASCADE delete |
| token_hash | VARCHAR(255) | UNIQUE, NOT NULL, indexed |
| expires_at | TIMESTAMPTZ | NOT NULL, indexed |
| revoked | BOOLEAN | default false |

### `audit_logs`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| user_id | UUID | FK → users.id, nullable, indexed, SET NULL on delete |
| action | VARCHAR(255) | NOT NULL |
| payload | JSONB | nullable |
| ip_address | VARCHAR(45) | nullable |
| timestamp | TIMESTAMPTZ | NOT NULL |

### `permissions`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| codename | VARCHAR(100) | UNIQUE, NOT NULL, indexed |
| label | VARCHAR(255) | NOT NULL |
| group | VARCHAR(50) | NOT NULL |

### `role_permissions`

| Column | Type | Constraints |
|--------|------|------------|
| role_id | UUID | FK → roles.id, PK, CASCADE delete |
| permission_id | UUID | FK → permissions.id, PK, CASCADE delete |

Composite PK (role_id, permission_id).

---

## Academic Module (6 tables)

### `courses`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| name | VARCHAR(255) | NOT NULL |
| code | VARCHAR(50) | UNIQUE, NOT NULL, indexed |
| description | TEXT | nullable |
| credits | INTEGER | default 3 |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

### `course_sections`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| course_id | UUID | FK → courses.id, NOT NULL, indexed |
| teacher_id | UUID | FK → employees.id, NOT NULL, indexed |
| capacity | INTEGER | default 30 |
| enrolled_count | INTEGER | default 0, CHECK ≥0 AND ≤capacity |
| status | ENUM | pending, active, completed |
| teacher_percentage | NUMERIC(5,2) | nullable |
| min_students_required | INTEGER | nullable |
| start_date | DATE | nullable |
| end_date | DATE | nullable |
| class_time | TIME | nullable |
| class_duration_minutes | INTEGER | nullable |
| classroom | VARCHAR(100) | nullable |
| price | NUMERIC(12,2) | nullable |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

### `students`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| student_code | VARCHAR(50) | UNIQUE, NOT NULL, indexed |
| full_name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | nullable |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

### `enrollments`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| student_id | UUID | FK → students.id, NOT NULL, indexed |
| section_id | UUID | FK → course_sections.id, NOT NULL, indexed |
| enrolled_at | TIMESTAMPTZ | NOT NULL |
| agreed_price | NUMERIC(12,2) | nullable |
| admin_discount | NUMERIC(5,2) | nullable |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

UNIQUE (student_id, section_id).

### `final_grades`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| section_id | UUID | FK → course_sections.id, NOT NULL, indexed |
| student_id | UUID | FK → students.id, NOT NULL, indexed |
| final_score | NUMERIC(5,2) | NOT NULL |
| graded_by | UUID | FK → users.id, NOT NULL |
| graded_at | TIMESTAMPTZ | NOT NULL |
| notes | TEXT | nullable |

UNIQUE (section_id, student_id).

### `certificates`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| student_id | UUID | FK → students.id, NOT NULL, indexed |
| section_id | UUID | FK → course_sections.id, NOT NULL, indexed |
| enrollment_id | UUID | FK → enrollments.id, NOT NULL, indexed |
| certificate_number | VARCHAR(50) | UNIQUE, NOT NULL, indexed |
| course_name | VARCHAR(255) | NOT NULL |
| student_name | VARCHAR(255) | NOT NULL |
| issued_at | TIMESTAMPTZ | NOT NULL |
| final_score | NUMERIC(5,2) | nullable |
| grade_label | VARCHAR(20) | nullable |
| student_id_no | VARCHAR(50) | nullable |
| extra_data | JSONB | nullable |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

UNIQUE (student_id, section_id).

---

## LMS Module (9 tables)

### `attendance_sessions`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| section_id | UUID | FK → course_sections.id, NOT NULL, indexed |
| date | DATE | NOT NULL |
| created_by | UUID | FK → users.id, NOT NULL, indexed |
| created_at | TIMESTAMPTZ | NOT NULL |

UNIQUE (section_id, date).

### `attendance_records`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| session_id | UUID | FK → attendance_sessions.id, NOT NULL, indexed |
| student_id | UUID | FK → students.id, NOT NULL, indexed |
| status | VARCHAR(20) | default 'present' |

UNIQUE (session_id, student_id).

### `assignments`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| section_id | UUID | FK → course_sections.id, NOT NULL, indexed |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | nullable |
| due_date | TIMESTAMPTZ | nullable |
| max_score | INTEGER | default 100 |
| created_at | TIMESTAMPTZ | NOT NULL |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

### `submissions`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| assignment_id | UUID | FK → assignments.id, NOT NULL, indexed |
| student_id | UUID | FK → students.id, NOT NULL, indexed |
| submitted_at | TIMESTAMPTZ | NOT NULL |
| file_path | VARCHAR(500) | nullable |
| status | VARCHAR(20) | default 'submitted' |

UNIQUE (assignment_id, student_id).

### `grades`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| submission_id | UUID | FK → submissions.id, UNIQUE, NOT NULL |
| score | NUMERIC(5,2) | NOT NULL |
| feedback | TEXT | nullable |
| graded_by | UUID | FK → users.id, NOT NULL, indexed |
| graded_at | TIMESTAMPTZ | NOT NULL |

### `payments`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| enrollment_id | UUID | FK → enrollments.id, NOT NULL, indexed |
| amount | NUMERIC(12,2) | NOT NULL |
| date | DATE | NOT NULL |
| receipt_number | VARCHAR(50) | UNIQUE, NOT NULL, indexed |
| payment_method | ENUM | cash, online |
| transaction_number | VARCHAR(100) | nullable |

### `expenses`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| amount | NUMERIC(12,2) | NOT NULL |
| description | TEXT | nullable |
| recipient_name | VARCHAR(255) | NOT NULL |
| recipient_id | UUID | FK → employees.id, nullable, indexed |
| date | DATE | NOT NULL |
| receipt_number | VARCHAR(50) | UNIQUE, NOT NULL, indexed |
| type | ENUM | general_expense, teacher_withdrawal, secretary_advance |

### `teacher_wallets`

| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| teacher_id | UUID | FK → employees.id, UNIQUE, NOT NULL, CASCADE delete |
| balance | NUMERIC(12,2) | NOT NULL, default 0 |
| last_updated | TIMESTAMPTZ | NOT NULL |

### `daily_closures`

| Column | Type | Constraints |
|--------|------|------------|
| date | DATE | PK |
| status | ENUM | closed, pending, unlock_requested |
| closed_by_manager_id | UUID | FK → users.id, nullable, indexed |

---

## Relationships

```
roles ──1:N──> users ──1:1──> employees
users ──1:N──> refresh_tokens
users ──1:N──> audit_logs
roles ──N:N──> permissions  (via role_permissions)

courses ──1:N──> course_sections ──1:N──> enrollments
course_sections ──N:1──> employees (teacher)
students ──1:N──> enrollments ──1:N──> payments
enrollments ──1:N──> certificates
course_sections ──1:N──> final_grades

course_sections ──1:N──> attendance_sessions ──1:N──> attendance_records
course_sections ──1:N──> assignments ──1:N──> submissions ──1:1──> grades
employees ──1:1──> teacher_wallets
employees ──1:N──> expenses
```
