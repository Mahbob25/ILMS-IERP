# Section Name Identification — Implementation Plan

**Date:** 2026-07-10
**Status:** Draft for Review

---

## 1. Problem Statement

When a **Course** (e.g., "Mathematics 101") has multiple **Sections** (morning group, evening group, different teachers, different classrooms), there is currently no clear visual way for users to tell them apart in the UI. The sections listing shows only the shared course name in the "Course" column, making identical-looking rows when multiple sections belong to the same course.

---

## 2. Proposed Solution

Add an optional `name` field to `CourseSection` (user-friendly label like "Morning Group", "Section A") combined with auto-generated `section_number` codes (e.g., "CS101-01", "CS101-02") as a fallback display when no name is provided.

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A: Add `name` field only** | Simple, flexible, meaningful labels | Requires migration; manual entry needed |
| **B: Auto-generated section code only** | No user effort needed | Codes like "CS101-01" less meaningful than "Morning Group" |
| **C: Display composite from existing fields** | No schema change | Relies on schedule fields; falls apart when empty |
| **D: `name` field + auto-generated fallback** | Best of both worlds | More implementation work |

**Decision: Option D** — Add a `name` column + auto-generate section number as fallback.

---

## 3. Implementation Phases

### Phase 1: Database Schema — Add `name` & `section_number` to `course_sections`

| Task | Files | Estimate |
|------|-------|----------|
| Create Alembic migration adding `name` (nullable VARCHAR(255)) and `section_number` (nullable VARCHAR(50)) to `course_sections` | `apps/erp/backend/alembic/versions/` | 30 min |
| Add `name: Mapped[Optional[str]]` and `section_number: Mapped[Optional[str]]` to `CourseSection` model | `apps/erp/backend/app/modules/academic/models.py` | 15 min |
| Add `name`, `section_number` to `CourseSectionCreate`, `CourseSectionUpdate`, `CourseSectionResponse` schemas | `apps/erp/backend/app/modules/academic/schemas.py` | 15 min |

### Phase 2: Backend Logic — Auto-generation & Service Layer

| Task | Files | Estimate |
|------|-------|----------|
| Auto-generate `section_number` on create (e.g. `course.code` + sequential count like "CS101-03") | `apps/erp/backend/app/modules/academic/service.py` | 20 min |
| Auto-generate `name` fallback when not provided (e.g. "Mathematics 101 — Section 1") | `apps/erp/backend/app/modules/academic/service.py` | 15 min |
| Include `course_name` in `CourseSectionResponse` (join with Course, avoid N+1) | `schemas.py`, `service.py` | 15 min |

### Phase 3: Frontend — Main Sections Pages

| Task | Files | Estimate |
|------|-------|----------|
| Update sections list table to show section name/number prominently; change "Course" to "Section / Course" | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/sections/page.tsx` | 30 min |
| Add `name` text input to create/edit modal (pre-populated with auto-generated suggestion) | Same file as above | 20 min |
| Update section detail page to show name as primary heading | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/sections/[sectionId]/page.tsx` | 15 min |

### Phase 4: Frontend — Secondary Pages Referencing Sections

| Task | Files | Estimate |
|------|-------|----------|
| Enrollments page — show section name in selector and table | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/enrollments/page.tsx` | 15 min |
| POS page — show section name in course/section dropdowns | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/pos/page.tsx` | 15 min |
| Attendance page — display section name in selector | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/attendance/page.tsx` | 10 min |
| Gradebook page — display section name in selector | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/gradebook/page.tsx` | 10 min |
| Student detail page — show section name in enrollment list | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/students/[id]/page.tsx` | 10 min |
| Payments page — show section name in payment references | `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/payments/page.tsx` | 10 min |

### Phase 5: Dashboard Widgets

| Task | Files | Estimate |
|------|-------|----------|
| Update ManagerDashboard to use section `name` field | `apps/erp/frontend/components/dashboard/ManagerDashboard.tsx` | 10 min |
| Update TeacherDashboard to use section `name` field | `apps/erp/frontend/components/dashboard/TeacherDashboard.tsx` | 10 min |

### Phase 6: Testing

| Task | Estimate |
|------|----------|
| Update backend tests — verify name and section_number auto-generation on create | 20 min |
| Verify existing sections without names still work | 10 min |
| Verify section listing API returns new fields | 10 min |
| E2E tests — add assertions for section name display in table | 20 min |
| E2E tests — verify sections from same course show distinguishable names | 15 min |

---

## 4. Dependencies

| Dependency | For | Status |
|------------|-----|--------|
| PostgreSQL | Database | Already configured |
| Alembic | Schema migrations | Already configured |
| Nothing external | — | All changes within existing stack |

---

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Existing API consumers not expecting new fields | LOW | `name` is optional in request/response schemas — backwards compatible |
| Existing sections without names show empty field | LOW | `section_number` auto-generated as fallback display |
| Frontend changes spread across many files | LOW | Consistent pattern: add field to interface, use in display |

---

## 6. Total Estimate

| Phase | Estimate |
|-------|----------|
| Phase 1: Database Schema | ~1 hour |
| Phase 2: Backend Logic | ~1 hour |
| Phase 3: Main Pages | ~1 hour |
| Phase 4: Secondary Pages | ~1 hour |
| Phase 5: Dashboards | ~20 min |
| Phase 6: Testing | ~1 hour |
| **Total** | **~5 hours** |
