# Technical Requirements Document - Update v1.7 (Institute Financial & Administrative System)

**To the Development Team:**
Work on the AI curriculum ingestion pipeline (Phases 4 & 5 & 6) is temporarily paused to focus 100% on building a robust, integrated ERP and accounting system for the institute. The legacy concept of "Terms/Semesters" is officially abolished; the system will now operate entirely on independent "Courses".

Below are the architectural and logical details required for immediate implementation:

## 1. User Roles & Permissions (RBAC)

The system requires 4 main roles with strictly defined boundaries:

* **Technical System Engineer (SuperAdmin):** Full system access, backup management, and infrastructure maintenance.
* **Manager:** Reviews and closes the daily financial ledger, grants special student discounts, monitors analytics, and manages reminder configurations.
* **Secretary:** The operational interface; registers students, creates courses, processes incoming payments, logs outgoing expenses, and prints receipts.
* **Teacher:** Restricted access to view their assigned courses, track student attendance/grades, and monitor their available financial balance for withdrawal.

---

## 2. Course Management & Registration

The `Terms` entity has been removed. The `Course` is now the primary entity and transitions between two main states:

### A. Pending Course (Awaiting Quota)

* Created with the following parameters: Course Name, Maximum Capacity, Base Price, Assigned Teacher, and Room Number.
* **Initial Registration:** The Secretary registers prospective students (Student Name, Phone, Address, Guardian Phone) as "Interested".
* **Minimum Quota Reminder:** The system must feature a UI notification threshold. When the registered student count reaches the predefined minimum, the system alerts the Secretary to initiate the course.
* **Course Activation:** Once the quota is met and confirmed, the Secretary finalizes the schedule (Start/End Dates, Start/End Times) and sets the **Teacher's Revenue Percentage**.

### B. Active Course (Late Registration)

* If a course is already underway, new students can still register and join immediately.
* **Flexible Pricing:** The Secretary has the authority to apply a "Late Joining Discount" to dynamically adjust the course price for the late student, compensating for missed lectures.

---

## 3. Core Financial & Accounting Engine

### 3.1 Payments & Flexible Installments

* Upfront full payment is not mandatory. Students can pay via flexible installments at any time.
* Every transaction generates a **Payment Receipt** formatted for standard printing (A4/A5), requiring a physical signature from the student.
* **Automated Reminder System:** The Manager configures a deadline rule (e.g., full payment required *X* days before the course ends). The system automatically tracks outstanding balances and generates actionable alerts for the Secretary, listing students with overdue payments.

### 3.2 Automated Revenue Split

* **Core Logic:** The Teacher's balance is calculated based purely on **actual amounts paid by students**, NOT the theoretical total value of the course.
* *Transaction Flow:* When a student makes a payment (e.g., $100), the system synchronously multiplies it by the Teacher's Percentage (e.g., 40%). It immediately routes $40 to the "Teacher's Available Balance" and $60 to the "Institute Revenue".
* **Manager's Special Discount Rule:** If the Manager grants a special discount to a specific student, **this deduction is taken exclusively from the Institute's share**.
* *Developer Constraint:* `Teacher_Share = Base_Course_Price * Teacher_Percentage`. The total amount the teacher expects per student remains fixed; the discount only reduces the remaining `Institute_Share`.



### 3.3 Employee Salaries & Withdrawals

* **Teacher Wallet:** Teachers have a digital ledger tracking their available balance. They can request a withdrawal at any time up to their maximum available funds. The system generates an **Expense Voucher** to be signed upon cash handover.
* **Secretary Advances:** The Secretary receives a fixed monthly salary but can log a financial "Advance" during the month. This must be recorded as a specific expense type and automatically deducted when generating the end-of-month payroll report.

### 3.4 General Expenses Management

* The Secretary can log all operational outgoings (e.g., electricity bills, office supplies, maintenance).
* Required inputs: Amount, Description/Justification, and Recipient Name. The system generates a printable **Expense Voucher** to be signed by the person receiving the cash.

---

## 4. Auditing & Day Closure (Manager Operations)

This is a highly critical feature relying on a robust `daily_closures` state machine:

* **Daily Review:** The Manager accesses a daily ledger consolidating all cash flow (Student payment receipts IN, Teacher withdrawals/General expenses OUT).
* **Locking (Close Day):** If the physical cash and paper receipts match the system's ledger, the Manager triggers the **"Close Day"** action.
* **Backend Constraints:** Once a date is flagged as `closed`, the FastAPI backend MUST strictly reject any `PUT`, `DELETE`, or retroactive `POST` requests attempting to modify financial records for that specific date.
* **Pending Status:** If discrepancies are found, the Manager leaves the day "Under Review". **Crucially, this does not halt operations.** The Secretary can continue logging new transactions for the current/new calendar days without interruption.
* **Unlock Requests:** To fix an error on a closed day, the Secretary submits an "Unlock Request" via the UI. If approved by the Manager, the lock is temporarily lifted, the correction is made, and the day must be manually closed again.

---

## 5. Database Schema Updates (Backend/Alembic)

The database developer must execute the following schema migrations:

1. **`courses` table:** Remove `term_id` FK. Add columns: `status` (Enum: pending, active, completed), `teacher_percentage` (Float), `min_students_required` (Integer).
2. **`enrollments` table:** Add columns: `agreed_price` (Float - after Secretary's late discount) and `admin_discount` (Float - Manager's special discount).
3. **`payments` table (Income):** `student_id`, `course_id`, `amount`, `date`, `receipt_number`.
4. **`expenses` table (Outgoing):** `amount`, `description`, `recipient_name`, `date`, `receipt_number`, `type` (Enum: general_expense, teacher_withdrawal, secretary_advance).
5. **`teacher_wallets` table:** A ledger to track cumulative teacher balances derived from the `payments` table.
6. **`daily_closures` table:** `date` (PK/Unique), `status` (Enum: closed, pending, open_requested), `closed_by_manager_id` (FK).

---

## 6. Frontend UI/UX Requirements (Next.js)

* **Point of Sale (POS) Interface:** Design a streamlined, rapid-entry interface for the Secretary to process incoming payments and log expenses with minimal clicks.
* **Print Templates:** Develop clean, professional, and printer-friendly layouts for both Payment Receipts and Expense Vouchers (A4/A5 formats). Must include the Institute's logo and designated signature lines.
* **Auditing Dashboard:** Build a dedicated, calendar-driven view for the Manager to audit daily cash flows (Day-by-Day comparison) equipped with clear action buttons (Close Day / Approve Edit Request).