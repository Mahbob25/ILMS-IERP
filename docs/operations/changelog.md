# Changelog

## v1.7 ERP & Financial System (July 2026)

Abolished the `terms`/semesters concept. Courses are now independent stateful entities. Added a full financial engine.

### Phases 1-9 — Code Complete

| Phase | Change |
|-------|--------|
| Phase 1 | Database: payments, expenses, teacher_wallets, daily_closures tables; drop terms |
| Phase 2 | RBAC: admin→manager rename, secretary role, `require_role()` gates |
| Phase 3 | Stateful courses: pending/active/completed status, quota validation, activation |
| Phase 4 | Financial engine: payments, revenue split, teacher wallets, receipt numbers |
| Phase 5 | Expenses: general expenses, teacher withdrawals, secretary advances |
| Phase 6 | Daily closure state machine: close, lock, unlock request workflow |
| Phase 7 | Frontend: RefreshButton, role-based sidebar, student detail page, POS |
| Phase 8 | Role data cleanup: remove `is_superadmin` from responses, use role.name |
| Phase 9 | POS: student autocomplete, quick-amount buttons, receipt preview |

### Phase 10 — Integration Testing (Pending)

Run the E2E integration tests + frontend build to sign off v1.7.

### Next: AI Ingestion Pipeline

After v1.7 sign-off: document upload/parsing (PDF/DOCX), Gemini embeddings, pgvector semantic search, concept map extraction, question generation.

---

## v1.6 Foundation (June 2026)

Initial LIMS MVP with auth system, RBAC, course management, attendance, assignments, grades.
