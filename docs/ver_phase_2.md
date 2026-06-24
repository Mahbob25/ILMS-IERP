# Phase 2 — Manual Verification Instructions

## Prerequisites

- Docker containers running: `docker compose up -d`
- Backend running from terminal (or via Docker): verify `uvicorn` is serving on port 8000
- Frontend running: `cd frontend && npm run dev`
- Caddy Root CA trusted on client machine
- `curl` or HTTP client available

### Default seed credentials

| Field | Value |
|-------|-------|
| Email | `superadmin@institute.dev` |
| Password | `admin123` |
| Role | `superadmin` |

---

## 1. Create an Academic Term

```bash
# Login and save cookies
curl -k -c cookies.txt -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@institute.dev","password":"admin123"}' -v 2>&1

# Create a term
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/terms" \
  -H "Content-Type: application/json" \
  -d '{"name":"Fall 2026","code":"F2026","start_date":"2026-09-01","end_date":"2027-01-15","is_active":true}' -v 2>&1
```

**Expected:**
- HTTP status `201 Created`
- Response body includes `id`, `name`, `code`, `start_date`, `end_date`, `is_active: true`

```bash
# Verify in DB
docker exec -i lims_database psql -U lims -d lims -c "SELECT id, name, code, start_date, end_date, is_active FROM terms;"
```

**Expected:** one row with the term data.

---

## 2. Create a Course

```bash
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/courses" \
  -H "Content-Type: application/json" \
  -d '{"name":"Math 101","code":"MATH101","credits":3}' -v 2>&1
```

**Expected:**
- HTTP status `201 Created`
- Response body includes `id`, `name`, `code`, `credits`

---

## 3. Create a Course Section and Assign Teacher

```bash
# Get a teacher user's ID
curl -k -b cookies.txt "https://lims.institute.local/api/v1/users" | python -m json.tool

# Get term and course IDs (from previous steps or from list endpoints)
curl -k -b cookies.txt "https://lims.institute.local/api/v1/academic/terms"
curl -k -b cookies.txt "https://lims.institute.local/api/v1/academic/courses"

# Create section (replace IDs with actual values)
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/course-sections" \
  -H "Content-Type: application/json" \
  -d '{"course_id":"<course_id>","term_id":"<term_id>","teacher_id":"<teacher_id>","capacity":30}' -v 2>&1
```

**Expected:**
- HTTP status `201 Created`
- Response includes `id`, `course_id`, `term_id`, `teacher_id`, `capacity`, `enrolled_count: 0`

---

## 4. Enroll a Student

```bash
# Create a student
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/students" \
  -H "Content-Type: application/json" \
  -d '{"student_code":"STU001","full_name":"Alice Student"}' -v 2>&1

# Enroll the student in the section (replace IDs)
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/enrollments" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<student_id>","section_id":"<section_id>"}' -v 2>&1
```

**Expected:**
- Student created with HTTP `201`
- Enrollment created with HTTP `201`

```sql
-- Verify in DB
docker exec -i lims_database psql -U lims -d lims -c "SELECT s.full_name, sec.course_id, sec.enrolled_count FROM enrollments e JOIN students s ON e.student_id = s.id JOIN course_sections sec ON e.section_id = sec.id;"
```

---

## 5. Capacity Validation

```bash
# Create a section with capacity=1
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/course-sections" \
  -H "Content-Type: application/json" \
  -d '{"course_id":"<course_id>","term_id":"<term_id>","teacher_id":"<teacher_id>","capacity":1}'

# Create 2 students
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/students" \
  -H "Content-Type: application/json" \
  -d '{"student_code":"STU002","full_name":"Bob Student"}'

curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/students" \
  -H "Content-Type: application/json" \
  -d '{"student_code":"STU003","full_name":"Charlie Student"}'

# Enroll first student (should succeed)
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/enrollments" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<stu002_id>","section_id":"<section_id>"}'

# Enroll second student (should fail - capacity 1)
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/academic/enrollments" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<stu003_id>","section_id":"<section_id>"}'
```

**Expected:**
- First enrollment: HTTP `201 Created`
- Second enrollment: HTTP `400 Bad Request` with detail `"Section is full or enrollment already exists"`
- `enrolled_count` remains at 1

---

## 6. Teacher Scoping

```bash
# Create a teacher user (needs admin role)
curl -k -b cookies.txt -X POST "https://lims.institute.local/api/v1/users" \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@institute.dev","password":"teacher123","full_name":"Mr. Teacher","role_id":"<teacher_role_id>"}'

# Login as teacher
curl -k -c teacher_cookies.txt -X POST "https://lims.institute.local/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@institute.dev","password":"teacher123"}'

# List sections — teacher should see only their own sections
curl -k -b teacher_cookies.txt "https://lims.institute.local/api/v1/academic/course-sections"
```

**Expected:** Only sections where this teacher is assigned appear.

---

## Full Verification Checklist Summary

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1 | Create term via API | `201 Created`, DB entry exists | ☐ |
| 2 | Create course | `201 Created`, DB entry exists | ☐ |
| 3 | Create section with teacher assignment | `201 Created`, correct teacher linked | ☐ |
| 4 | Enroll student | `201 Created`, enrolled_count incremented | ☐ |
| 5 | Over-capacity enrollment | `400 Bad Request`, section full | ☐ |
| 6 | Teacher sees only own sections | Filtered list returned | ☐ |
| 7 | Frontend Terms page loads | Table displays terms data | ☐ |
| 8 | Frontend Courses page loads | Table displays courses data | ☐ |
| 9 | Frontend Sections page loads | Table displays sections data | ☐ |
| 10 | Frontend Students page loads | Table displays students data | ☐ |
| 11 | Frontend Enrollments page loads | Table displays enrollments data | ☐ |
| 12 | Unauthenticated access to academic endpoints | `401 Unauthorized` | ☐ |
