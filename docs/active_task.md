# Active Task: Phase 2 - Academic Information System (SIS) Modules

## Goal
Implement core school administrative data structures — terms, courses, sections, students, enrollments — with full CRUD APIs and frontend management interfaces.

---

## Status
- **Current Phase**: Phase 2
- **Progress**: 100% Completed
- **Next Action**: Proceed to Phase 3 (Attendance, Assignments & Classroom Modules)

---

## Tasks Checklist

### 1. Alembic Migration — Academic Schema
- [x] Create migration with 5 tables: `terms`, `courses`, `course_sections`, `students`, `enrollments`

### 2. Backend Academic Module
- [x] Create `models.py` — SQLAlchemy ORM models
- [x] Create `schemas.py` — Pydantic validation schemas
- [x] Create `service.py` — CRUD helper functions
- [x] Create `router.py` — FastAPI endpoints with RBAC access control
- [x] Register router in `main.py`, update `env.py`

### 3. Frontend Academic Interfaces
- [x] Build Terms management page
- [x] Build Courses management page
- [x] Build Course Sections management page
- [x] Build Students roster page
- [x] Build Enrollments management page
- [x] Update dashboard sidebar navigation
