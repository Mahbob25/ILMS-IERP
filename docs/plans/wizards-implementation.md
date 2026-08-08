# Guided Multi-Step Flows (Wizards) — Implementation Plan

**Status:** Phases 1–3 implemented; Phase 4 cancelled; Phase 5 (Dashboard Integration + Polish) in progress  
**Source:** `docs/plans/ux-suggestions.md`, item #4  
**Effort:** L (2+ weeks)  
**Date:** 2026-08-06

---

## 1. What the Wizards Are Really About

The current LIMS splits a single logical business operation across 3–4 separate pages. A secretary who needs to register a student, enroll them, and collect payment must:

1. Navigate to **Students** → open modal → fill form → save → close modal → note the student name/code
2. Navigate to **Enrollments** → open modal → search for the student they just created → pick a section → add discount → save
3. Navigate to **Payments** (or **POS**) → search for student → pick enrollment → enter amount → save → see receipt

Each page loads its own lookup data independently (students, courses, sections, enrollments — each fetching up to 1000 records). The user context-switches through the sidebar between each step. Records get dropped when someone creates a student but forgets to enroll them, or enrolls without taking payment.

The same pattern applies to course creation: **Courses** → **Sections** (with teacher assignment embedded in the section form).

**The wizard collapses these 3–4 page navigations into a single, linear, guided form** with a visual step indicator. The flow naturally pushes the user from start to finish, preventing dropped records and eliminating navigation overhead.

### Wizard 1: Student Registration + Enrollment + Payment
```
Step 1: Student Details → Step 2: Section Enrollment + Discount → Step 3: Payment + Receipt
```

### Wizard 2: Course + Section + Teacher Assignment
```
Step 1: Course Details → Step 2: Section Details + Teacher Assignment
```

---

## 2. How It Improves User Experience

| Current Pain Point | How the Wizard Fixes It |
|---|---|
| 3 sidebar navigations per student registration | 0 navigations — everything in one flow |
| Each page re-fetches 3–4 lookup datasets independently | Lookup data fetched once, shared across all steps |
| Student created but not enrolled (dropped record) | Flow naturally leads from registration → enrollment → payment |
| Enrolled but no payment collected | Step 3 is right there; payment and receipt are part of the flow |
| Mental context switching between pages | Single linear flow with persistent context; no "which student was I working on?" |
| Section creation requires separate course creation first | Wizard 2 handles both in sequence |
| Teacher assignment is buried in a large section form | Explicit step with dedicated attention |
| POS page already demonstrates a "search student → pick enrollment → pay" flow but can't create students | Wizard integrates creation into the same streamlined experience |

---

## 3. Difficulty Assessment

**Overall: Medium-High**

### Medium aspects (well-understood, existing patterns)

- **The individual forms already exist**: Student form (students page), enrollment form (enrollments page), payment form (payments page, POS page), course form (courses page), section form (`SectionFormModal` component)
- **All API endpoints exist**: `POST /academic/students`, `POST /academic/enrollments`, `POST /lms/payments`, `POST /academic/courses`, `POST /academic/course-sections`
- **UI primitives exist**: `Modal` component, `Select` component, form field patterns, error display patterns
- **POS page is a partial proof of concept**: Already does "pick student → pick enrollment → pay → receipt" in one page (but can't create students)
- **Bilingual/RTL patterns are well-established**: Every page follows the same `t` translation object + `isRtl` pattern

### High aspects (new work, complexity, integration)

- **Multi-step state machine with dependency chain**: Step 1 creates a student (returns ID) → Step 2 enrolls using that ID (returns enrollment ID) → Step 3 pays using enrollment ID. If step 2 fails, the student from step 1 already exists in the database. Need careful handling — intentionally **never roll back**, always allow retry.
- **Bidirectional integration with POS**: The wizard IS essentially an enhanced POS — after the wizard launches, should we also surface wizard-launched enrollments in the POS page? Yes, both must share the same data.
- **No existing stepper/progress indicator component**: Must build a lightweight, reusable `WizardStepper` component.
- **Navigation guard**: If a user clicks a sidebar link mid-wizard, we need to warn "You have unsaved progress — leave anyway?" without losing state if they cancel.
- **Conditional flexibility**: Step 1 might be skipped if the user picks an existing student. Step 3 might be skipped if the user just wants to enroll without immediate payment. The wizard needs optional skip-ability.
- **Receipt printing integration**: After payment in step 3, the receipt must show with all resolved data (student name, course name, amounts). Currently `ReceiptModal` receives pre-resolved data from the parent component — the wizard needs to construct this correctly from its internal state.
- **Dual existence**: The wizard is **additive** — the existing individual pages (students, enrollments, payments, courses, sections) must continue working. No existing code is removed.

---

## 4. Risks

### Risk 1: Orphan Records (Medium severity, Low probability)
**What**: Student created in step 1, then browser crashes before step 2 completes. A student exists with no enrollment.  
**Mitigation**: This is already possible today (create student, never enroll them). The wizard doesn't make it worse. Also, the student list page shows all students regardless of enrollment status. No action needed — this is acceptable.

### Risk 2: Race Conditions on Enrollment (Low severity, Low probability)  
**What**: Two secretaries enroll the same student in the same section simultaneously.  
**Mitigation**: The backend already handles this (`/academic/enrollments` returns a constraint error for duplicate enrollments). The wizard just needs to surface the error message clearly in step 2.

### Risk 3: Permission Boundary Violation (Medium severity, Low probability)  
**What**: A secretary uses the wizard but lacks payment permissions for step 3. Or a role that can create courses but not sections.  
**Mitigation**: Check permissions per step. If the user can't perform step 3, either: (a) skip it entirely, or (b) show step 3 as "locked" with a message. For the enrollment wizard, secretaries, managers, and superadmins all have payment access — this is a non-issue in practice, but we should still guard it.

### Risk 4: Maintenance Burden — Shared Form Logic (Medium severity, Medium probability)  
**What**: Two copies of essentially the same form logic (wizard + existing pages) need to be kept in sync.  
**Mitigation**: Extract shared form components. For example, `StudentFormFields`, `EnrollmentFormFields`, `PaymentFormFields` can be shared between the wizard and the existing modals. This is part of the implementation plan.

### Risk 5: Accidental Navigation Loss (Medium severity, Medium probability)  
**What**: User clicks sidebar mid-wizard and loses all entered data.  
**Mitigation**: Implement a `beforeunload` event handler and/or a React Router/navigation guard that prompts "You have unsaved progress. Leave?" The wizard state is held in React state (not URL), so closing the modal is also destructive — handle the close button similarly.

### Risk 6: Performance on Wizard Init (Low severity, Low probability)  
**What**: Loading all lookups (students, courses, sections, enrollments) at once on wizard open.  
**Mitigation**: The existing pages already fetch 1000-item lists on init. The wizard fetches the same data, just once instead of 3 times. This is actually an improvement.

### Risk 7: Backend Does Not Support Batch/Multi-Step Operations (Low severity, None)  
**What**: The backend has no batch endpoint. Must call individual APIs sequentially.  
**Mitigation**: This is fine. The APIs are independent and fast. No backend changes needed.

---

## 5. Technical Architecture

### Route

The wizard will be a **page-level component**, not a modal, to allow full-width layout and prevent accidental dismissal:

```
/dashboard/wizards/student-enrollment  →  Wizard 1
/dashboard/wizards/course-section      →  Wizard 2
```

This also allows linking from the sidebar menu (or a dashboard card) directly.

### Component Tree

```
WizardPage (page component, holds all state)
├── WizardStepper (visual step indicator — 3 steps / 2 steps)
├── Step 1: StudentFormFields (reused from existing modal logic)
├── Step 2: EnrollmentFormFields (student + section + discount)
│   └── ExistingStudentPicker (search or select from list)
│   └── OR CreateStudentInline (if student not found)
│   └── SectionPicker (Select dropdown with course name resolution)
│   └── DiscountField (admin-only)
├── Step 3: PaymentFormFields (enrollment summary + amount + method)
│   └── PaymentSummaryCard (agreed price, paid, remaining)
│   └── PaymentMethodToggle (cash / online)
│   └── ReceiptPreview (shown after successful payment)
└── WizardNavigationBar (Back / Next / Skip / Finish buttons)
```

### State Management

All state lives in a single `useReducer` in the wizard page, shaped like:

```typescript
interface Wizard1State {
  step: 1 | 2 | 3;
  // Step 1 output
  studentId: string | null;       // null = not yet created/selected
  studentName: string;
  studentCode: string;
  studentEmail: string;
  // Step 2 output
  enrollmentId: string | null;
  sectionId: string | null;
  sectionDisplayName: string;
  discount: number | null;
  agreedPrice: number | null;
  // Step 3 output
  paymentCompleted: boolean;
  paymentReceiptData: ReceiptData | null;
  // UI state
  isExistingStudent: boolean;     // true = picked from list, false = created new
  submitting: boolean;
  error: string | null;
}
```

### API Call Flow

```
Step 1 submit:
  if isExistingStudent → validate studentId is set → advance to step 2
  else → POST /academic/students → get studentId → advance to step 2

Step 2 submit:
  POST /academic/enrollments { student_id, section_id, admin_discount }
  → get enrollmentId → advance to step 3

Step 3 submit:
  POST /lms/payments { enrollment_id, amount, payment_method, ... }
  → get payment (with receipt_number) → mark paymentCompleted → show receipt

Skip step 3: advance to "Complete" screen with summary (no payment recorded)
```

### Shared Components to Extract

| Component | Used By | Extracted From |
|---|---|---|
| `StudentFormFields` | Wizard Step 1, Students page modal | Students page lines 266-282 |
| `EnrollmentFormFields` | Wizard Step 2, Enrollments page modal | Enrollments page lines 380-458 |
| `PaymentFormFields` | Wizard Step 3, Payments page modal, POS page | Payments page lines 412-576 |
| `WizardStepper` | Both wizards | New component |
| `WizardNavigationBar` | Both wizards | New component |

---

## 6. Phased Implementation Plan

### Phase 1: Foundation — `WizardStepper` + `WizardNavigationBar` (2–3 days)

**Goal**: Build the reusable wizard shell components that both wizards will use.

**Tasks**:
1. Create `frontend/components/wizards/WizardStepper.tsx` — renders numbered steps with active/completed/pending visual states, supports RTL
2. Create `frontend/components/wizards/WizardNavigationBar.tsx` — Back/Next/Skip/Finish buttons with proper disabled states
3. Add CSS for step transitions (fade/slide)
4. Write translations for wizard UI strings (AR/EN): "Step X of Y", "Back", "Next", "Skip Payment", "Finish", "Student Registered Successfully"

**Files to create**:
- `frontend/components/wizards/WizardStepper.tsx`
- `frontend/components/wizards/WizardNavigationBar.tsx`

**Files to modify**: None (purely additive)

**Validation**: Storybook or manual testing — render stepper with steps=["Student Details", "Enrollment", "Payment"] in both locales

---

### Phase 2: Extract Shared Form Components (2–3 days)

**Goal**: Refactor existing form fields into reusable sub-components so the wizard and existing modals share the same logic.

**Tasks**:
1. Extract `StudentFormFields` from Students page modal (fields: student_code, full_name, email; validation: validateName)
2. Extract `EnrollmentFormFields` from Enrollments page (student picker with search + inline create, section selector, discount)
3. Extract `PaymentFormFields` from Payments page (enrollment summary display, amount input with balance cap, payment method toggle)
4. Refactor existing Students, Enrollments, Payments pages to use the extracted components
5. Verify existing pages still work identically after refactor

**Files to create**:
- `frontend/components/students/StudentFormFields.tsx`
- `frontend/components/enrollments/EnrollmentFormFields.tsx`
- `frontend/components/payments/PaymentFormFields.tsx`

**Files to modify**:
- `frontend/app/[locale]/(dashboard)/dashboard/students/page.tsx` (use StudentFormFields)
- `frontend/app/[locale]/(dashboard)/dashboard/enrollments/page.tsx` (use EnrollmentFormFields)
- `frontend/app/[locale]/(dashboard)/dashboard/payments/page.tsx` (use PaymentFormFields)

**Risk**: This is the highest-risk phase — refactoring existing pages. Mitigate by keeping the refactor minimal (just extract the JSX, don't change logic) and testing each page immediately.

**Validation**: Manual walkthrough of Students, Enrollments, Payments pages in both AR and EN — confirm all behavior is identical.

---

### Phase 3: Wizard 1 — Student Registration + Enrollment + Payment (4–5 days)

**Goal**: Build the primary wizard page.

**Tasks**:
1. Create `frontend/app/[locale]/(dashboard)/dashboard/wizards/student-enrollment/page.tsx`
2. Implement `Wizard1State` reducer and all step transitions
3. **Step 1**: Student selection — searchable picker (reuse enrollment page's student search) OR "Create New" inline form. If creating new, POST student and advance.
4. **Step 2**: Section picker + discount (reuse EnrollmentFormFields). POST enrollment on submit.
5. **Step 3**: Payment summary + amount input + method toggle (reuse PaymentFormFields). POST payment on submit. Show ReceiptModal on success. Allow skip.
6. Implement navigation guard (warn on sidebar click / close attempt if state is dirty)
7. Handle error states per step (API errors, validation errors) with retry buttons
8. Add a success summary screen after completion (student name, section, amount paid, receipt number)

**Files to create**:
- `frontend/app/[locale]/(dashboard)/dashboard/wizards/student-enrollment/page.tsx`

**Files to modify**:
- `frontend/app/[locale]/(dashboard)/layout.tsx` — add `page_wizards: ["superadmin", "manager", "secretary"]` permission and navigation item
- Dashboard page — add a "Quick Registration" card/button linking to the wizard

**Validation**: 
- Full flow: Create new student → Enroll → Pay → Print receipt
- Partial flow: Create new student → Enroll → Skip payment
- Partial flow: Pick existing student → Enroll → Pay
- Error case: Duplicate enrollment error → retry
- Navigation guard: Try to leave mid-wizard → confirm dialog
- Both AR and EN locales, RTL layout

---

### Phase 4: Wizard 2 — Course + Section + Teacher Assignment — CANCELLED

> **Cancelled.** The Course + Section + Teacher Assignment wizard is no longer required.
> This section is retained for historical reference only. No work will be done under Phase 4,
> and Phase 5 has been revised to remove all dependencies on Wizard 2.

**Tasks**:
1. Create `frontend/app/[locale]/(dashboard)/dashboard/wizards/course-section/page.tsx`
2. **Step 1**: Course creation form (name, code, description, credits) — reuse course page form logic
3. **Step 2**: Section creation + teacher assignment (course_id pre-filled from step 1, select teacher, capacity, dates, price, compensation model). Reuse `SectionFormModal` logic.
4. Handle contract assignment API call integrated into section creation (same as existing sections page)
5. Success screen with course name, section details, assigned teacher

**Files to create**:
- `frontend/app/[locale]/(dashboard)/dashboard/wizards/course-section/page.tsx`

**Files to modify**:
- Dashboard layout — ensure the wizard menu item covers this page too

**Validation**:
- Full flow: Create course → Create section with teacher + compensation → success
- Error: Missing required section fields → validation error
- Both locales

---

### Phase 5: Dashboard Integration + Polish (1–2 days)

**Goal**: Make wizards discoverable from the main dashboard.

**Tasks**:
1. Add "Quick Registration" shortcut to dashboards that have wizard access (Phase 4/Wizard 2 cancelled, so the "Create New Course" card is dropped):
   - SecretaryDashboard: add a "Quick Registration" button to the existing Quick Actions card → links to Wizard 1
   - ManagerDashboard: add a small "Quick Registration" card → links to Wizard 1
   - (Superadmin already has a Wizard 1 sidebar shortcut; Teachers have no wizard access.)
2. Add wizard links to existing pages:
   - "Quick Enroll" button on students page → links to Wizard 1 (`/dashboard/wizards/student-enrollment`)
   - "Sections" quick link on courses page → links to the existing `/dashboard/sections` page (replaces the cancelled "Quick Create Section" wizard destination; `SectionFormModal` already lives there)
3. Track wizard completions (optional — client-side `localStorage` counter, not blocking, no backend required)

**Files to modify**:
- `docs/plans/wizards-implementation.md` — this doc (Phase 4 / Phase 5 revised)
- `frontend/components/dashboard/SecretaryDashboard.tsx` — "Quick Registration" button
- `frontend/components/dashboard/ManagerDashboard.tsx` — "Quick Registration" card
- `frontend/app/[locale]/(dashboard)/dashboard/students/page.tsx` — "Quick Enroll" link
- `frontend/app/[locale]/(dashboard)/dashboard/courses/page.tsx` — "Sections" link

---

## 7. Testing Strategy

### Unit/Integration Tests
- Wizard state reducer: test all step transitions, skip logic, error clearing
- Navigation guard behavior

### E2E Tests (Playwright — project already has Playwright config)
- Wizard 1 happy path: create student → enroll → pay (3 steps)
- Wizard 1 partial: pick existing student → enroll → skip payment
- Navigation abandonment: start wizard, attempt to navigate away
- (Phase 4 / Wizard 2 cancelled — that test case is removed)

### Manual Testing Checklist
- Both wizards in Arabic (RTL) and English (LTR)
- All error states (API failures, validation errors)
- Skip payment flow
- Receipt printing after payment
- Existing pages still work after component extraction refactor
- Sidebar navigation guard

---

## 8. Out of Scope

- **Batch student registration**: This wizard handles one student at a time. Bulk import is a separate feature (already handled via ingestion).
- **Replacing existing pages**: The wizard is additive. Students, Enrollments, Payments, Courses, and Sections pages remain as-is.
- **Wizard for financial operations**: Refunds, expenses, and daily closures remain on their dedicated pages.
- **Multi-section enrollment in one wizard**: One student → one section per wizard run. For enrolling a student in multiple sections, use the existing enrollments page.
- **URL-based state persistence**: Wizard state is in-memory React state. Refreshing the page resets the wizard (acceptable for a guided flow, and the navigation guard prevents accidental loss).

---

## 9. Success Metrics

- Time to complete "register + enroll + pay" reduced from 3 page navigations + 3 modal opens to a single linear flow
- Zero context switches (no sidebar navigation needed)
- Student creation always followed by enrollment opportunity (reduced dropped records)
- Existing pages unaffected — zero regression
