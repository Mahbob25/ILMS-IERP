# Staff Payroll MVP — Implementation Plan

> **Stack:** Next.js (App Router) — FastAPI — PostgreSQL  
> **Audience:** Architects & engineers implementing the feature  
> **Goal:** Allow non-teaching staff (managers, secretaries, cleaners, etc.) to make multiple partial salary withdrawals throughout the month without exceeding their monthly ceiling.

---

## 1. Database Layer (PostgreSQL)

### 1.1 Current State

The `employees` table (not `users`) already carries the salary field:

```sql
-- apps/erp/backend/app/modules/identity/models.py:57
default_salary: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
```

The `users` table has no salary column and should not need one — salary is an **employment attribute**, not an auth attribute. All staff payroll queries join through `User → Employee`.

### 1.2 Unified Expense Type: `salary_draw`

The MVP eliminates the split between `secretary_advance` and `salary_payment` by introducing a single type `salary_draw` that covers **any partial salary withdrawal for any non-teacher role**.

**Why:** The current architecture (see `docs/expenses-page.md` for the documented bug) uses independent queries per type against the same `default_salary`, allowing over-disbursement. A single type guarantees the aggregation SQL always sees all draws.

#### Migration: Alembic revision

File: `apps/erp/backend/alembic/versions/202607200000_add_salary_draw_expense_type.py`

```python
"""add salary_draw to expensetype enum

Revision ID: 202607200000
Revises: <latest_revision_id>
"""

def upgrade() -> None:
    op.execute("ALTER TYPE expensetype ADD VALUE 'salary_draw'")

def downgrade() -> None:
    # PostgreSQL cannot remove enum values — recreate
    op.execute("ALTER TYPE expensetype RENAME TO expensetype_old")
    op.execute("""
        CREATE TYPE expensetype AS ENUM (
            'general_expense', 'teacher_withdrawal',
            'secretary_advance', 'salary_payment'
        )
    """)
    op.execute("""
        ALTER TABLE expenses ALTER COLUMN type
        TYPE expensetype USING type::text::expensetype
        WHERE type IN ('general_expense', 'teacher_withdrawal',
                       'secretary_advance', 'salary_payment')
    """)
    op.execute("DROP TYPE expensetype_old")
```

#### Model Update

Add `salary_draw` to the `Expense.type` enum in `apps/erp/backend/app/modules/lms/models.py`:

```python
type: Mapped[str] = mapped_column(
    SAEnum(
        'general_expense', 'teacher_withdrawal',
        'secretary_advance', 'salary_payment', 'salary_draw',
        name='expensetype'
    ),
    nullable=False, default="general_expense",
    server_default="general_expense"
)
```

### 1.3 Index Suggestion

Add a composite index for the monthly aggregation query the payroll endpoints will run:

```sql
CREATE INDEX ix_expenses_salary_draw_month
    ON expenses (recipient_id, date, type)
    WHERE type = 'salary_draw';
```

Alembic:

```python
def upgrade() -> None:
    op.create_index(
        "ix_expenses_salary_draw_month",
        "expenses",
        ["recipient_id", "date", "type"],
        postgresql_where=text("type = 'salary_draw'"),
    )
```

---

## 2. Backend Layer (FastAPI)

### 2.1 New File: `apps/erp/backend/app/modules/lms/staff_payroll_service.py`

Contains all business logic for the staff payroll feature, keeping `financial_service.py` focused on its existing concerns.

```python
import uuid
from decimal import Decimal
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.modules.identity.models import Employee, EmployeeType, User
from app.modules.lms.models import Expense
from app.modules.lms.financial_service import get_next_voucher_number


async def list_staff_for_payroll(
    db: AsyncSession,
) -> list[dict]:
    """
    Returns all active non-teacher employees with their
    monthly salary, current-month total drawn, and remaining balance.
    """
    now = date.today()
    month_start = now.replace(day=1)

    # 1. Fetch all active non-teacher employees
    employees_result = await db.execute(
        select(Employee)
        .where(
            Employee.employee_type != EmployeeType.TEACHER,
            Employee.is_active,
        )
        .options(joinedload(Employee.user))
        .order_by(Employee.full_name)
    )
    employees = employees_result.unique().scalars().all()

    if not employees:
        return []

    # 2. Bulk-fetch current-month salary_draw totals for these employees
    emp_ids = [e.id for e in employees]
    draws_result = await db.execute(
        select(
            Expense.recipient_id,
            func.coalesce(func.sum(Expense.amount), 0),
        )
        .where(
            Expense.recipient_id.in_(emp_ids),
            Expense.type == "salary_draw",
            Expense.date >= month_start,
            Expense.date <= now,
        )
        .group_by(Expense.recipient_id)
    )
    draws_map = dict(draws_result.fetchall())

    # 3. Assemble response
    result = []
    for emp in employees:
        monthly_salary = float(emp.default_salary or 0)
        total_drawn = float(draws_map.get(emp.id, 0))
        remaining = monthly_salary - total_drawn

        result.append({
            "id": str(emp.id),
            "full_name": emp.full_name,
            "role": emp.employee_type.value,
            "monthly_salary": monthly_salary,
            "total_drawn_this_month": total_drawn,
            "remaining_balance": remaining,
        })

    return result


async def process_salary_withdrawal(
    db: AsyncSession,
    employee_id: uuid.UUID,
    amount: float,
    created_by: uuid.UUID,
    description: Optional[str] = None,
    withdrawal_date: Optional[date] = None,
) -> Expense:
    """
    Validates and records a single salary draw against an employee's
    monthly ceiling.
    """
    if withdrawal_date is None:
        withdrawal_date = date.today()

    if amount <= 0:
        raise ValueError("Withdrawal amount must be positive")

    # 1. Verify employee exists and is non-teacher
    #    Pessimistic row lock prevents concurrent requests from both
    #    reading the same total_drawn and both passing validation.
    emp_result = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .with_for_update()
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise ValueError("Employee not found")
    if not employee.is_active:
        raise ValueError("Employee is not active")
    if employee.employee_type == EmployeeType.TEACHER:
        raise ValueError("Teachers use teacher withdrawal, not salary draw")
    if not employee.default_salary or employee.default_salary <= 0:
        raise ValueError("Employee has no monthly salary configured")

    monthly_salary = float(employee.default_salary)
    amount_dec = Decimal(str(amount))
    month_start = withdrawal_date.replace(day=1)

    # 2. Calculate remaining balance for the current month
    #    Includes ALL salary_draw expenses for this employee this month.
    total_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.type == "salary_draw",
            Expense.recipient_id == employee_id,
            Expense.date >= month_start,
            Expense.date <= withdrawal_date,
        )
    )
    total_drawn = float(total_result.scalar() or 0)
    remaining = monthly_salary - total_drawn

    if amount > remaining:
        raise ValueError(
            f"Insufficient remaining monthly salary. "
            f"Available: {remaining:.2f}, Requested: {amount:.2f}. "
            f"Monthly ceiling: {monthly_salary:.2f}, "
            f"Already drawn: {total_drawn:.2f}."
        )

    # 3. Create the expense record
    receipt_number = await get_next_voucher_number(db, withdrawal_date)

    expense = Expense(
        amount=amount_dec,
        description=description,
        recipient_name=employee.full_name,
        recipient_id=employee_id,
        date=withdrawal_date,
        receipt_number=receipt_number,
        type="salary_draw",
        created_by=created_by,
    )
    db.add(expense)
    await db.flush()

    return expense
```

**Key design decisions:**
- Bulk aggregation via `recipient_id IN (...)` to avoid N+1 queries.
- Amount validation uses `Decimal` internally for precision; exposed as `float` at the API boundary.
- Error messages include context (monthly ceiling, already drawn) for easier debugging.
- Reuses the existing `get_next_voucher_number()` from `financial_service.py`.

### 2.2 New Router: `apps/erp/backend/app/modules/lms/staff_payroll_router.py`

```python
import uuid
from decimal import Decimal
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.modules.identity.models import User
from app.modules.identity.dependencies import get_current_user, RoleChecker
from app.modules.lms import staff_payroll_service
from app.modules.lms.closure_service import is_date_closed
from app.core.error_messages import get_error_detail


router = APIRouter(prefix="/staff-payroll", tags=["Staff Payroll"])


# --- Schemas ---

class StaffPayrollMember(BaseModel):
    id: str
    full_name: str
    role: str
    monthly_salary: float
    total_drawn_this_month: float
    remaining_balance: float


class WithdrawRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Withdrawal amount")
    description: Optional[str] = None
    date: Optional[str] = None


class WithdrawResponse(BaseModel):
    id: str
    receipt_number: str
    amount: float
    recipient_name: str
    date: date
    remaining_balance: float


# --- Endpoints ---

@router.get("", response_model=list[StaffPayrollMember])
async def list_staff_payroll(
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager", "secretary"])
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all non-teacher staff with their monthly salary,
    total drawn this month, and remaining balance.
    """
    return await staff_payroll_service.list_staff_for_payroll(db)


@router.post("/{employee_id}/withdraw", response_model=WithdrawResponse)
async def process_withdrawal(
    employee_id: uuid.UUID,
    data: WithdrawRequest,
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager"])
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Processes a partial salary withdrawal for a staff member.
    Validates against the monthly ceiling before recording.
    """
    withdrawal_date = date.fromisoformat(data.date) if data.date else date.today()

    # Check date closure
    if await is_date_closed(db, withdrawal_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_error_detail("date_is_closed", locale),
        )

    try:
        expense = await staff_payroll_service.process_salary_withdrawal(
            db,
            employee_id=employee_id,
            amount=data.amount,
            created_by=current_user.id,
            description=data.description,
            withdrawal_date=withdrawal_date,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Re-read to get the updated remaining balance for the response
    month_start = withdrawal_date.replace(day=1)
    total_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.type == "salary_draw",
            Expense.recipient_id == employee_id,
            Expense.date >= month_start,
            Expense.date <= withdrawal_date,
        )
    )
    total_drawn = float(total_result.scalar() or 0)
    employee_result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = employee_result.scalar_one_or_none()
    remaining = float(employee.default_salary or 0) - total_drawn

    return {
        "id": str(expense.id),
        "receipt_number": expense.receipt_number,
        "amount": float(expense.amount),
        "recipient_name": expense.recipient_name,
        "date": expense.date,
        "remaining_balance": remaining,
    }
```

### 2.3 Registration in the FastAPI app

Add to `apps/erp/backend/app/modules/lms/router.py` (or the main app `__init__.py` depending on current structure):

```python
from app.modules.lms.staff_payroll_router import router as staff_payroll_router

# In the main app or lms sub-router
lms_router.include_router(staff_payroll_router)
```

Or mount as a top-level prefix if preferred:

```python
app.include_router(staff_payroll_router, prefix="/api/v1")
```

### 2.4 API Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/staff-payroll` | superadmin, manager, secretary | List all staff with salary + draw info |
| POST | `/api/v1/staff-payroll/{id}/withdraw` | superadmin, manager | Process a salary draw |

**Validation sequence for POST:**
1. Check `Idempotency-Key` header — return existing expense if already processed → HTTP 200
2. Date not closed → HTTP 409 if closed
3. Employee exists + active + non-teacher → HTTP 400 if invalid
4. `default_salary > 0` configured → HTTP 400 if missing
5. Acquire `FOR UPDATE` row lock on employee record (blocks concurrent withdrawals)
6. `amount <= remaining_balance` → HTTP 400 if exceeded
7. Insert expense row, recording the idempotency key
8. Commit transaction (releases row lock) → HTTP 200 with response body

### 2.5 Idempotency Layer

**Why:** In containerized deployments (Cloud Run, ECS, K8s), the platform may silently retry a POST request if the upstream response times out. Without idempotency, the retry creates a duplicate expense row and overdrafts the salary budget. The `with_for_update()` lock (fix #1) prevents concurrent races but cannot prevent sequential retries — idempotency keys solve that.

#### Persistence Table

Add a table to store completed idempotency keys:

```sql
CREATE TABLE idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(255) NOT NULL,
    response_body   JSONB NOT NULL,
    response_status SMALLINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ix_idempotency_keys_key ON idempotency_keys (key);
CREATE INDEX ix_idempotency_keys_created_at ON idempotency_keys (created_at);
```

Alembic migration:

```python
def upgrade() -> None:
    op.create_table(
        "idempotency_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("response_body", postgresql.JSONB, nullable=False),
        sa.Column("response_status", sa.SmallInteger, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    op.create_index("ix_idempotency_keys_key", "idempotency_keys", ["key"], unique=True)
    op.create_index("ix_idempotency_keys_created_at", "idempotency_keys", ["created_at"])
```

#### Service Layer — `apps/erp/backend/app/modules/lms/idempotency_service.py`

```python
import json
from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def extract_idempotency_key(request: Request) -> str | None:
    return request.headers.get("Idempotency-Key")


async def find_idempotent_response(
    db: AsyncSession,
    key: str,
) -> dict | None:
    result = await db.execute(
        text("SELECT response_status, response_body FROM idempotency_keys WHERE key = :key"),
        {"key": key},
    )
    row = result.fetchone()
    if row:
        return {"status": row[0], "body": row[1]}
    return None


async def save_idempotent_response(
    db: AsyncSession,
    key: str,
    status_code: int,
    response_body: dict,
) -> None:
    await db.execute(
        text("""
            INSERT INTO idempotency_keys (key, response_status, response_body)
            VALUES (:key, :status, :body)
            ON CONFLICT (key) DO NOTHING
        """),
        {"key": key, "status": status_code, "body": json.dumps(response_body)},
    )
```

#### Router Integration

```python
@router.post("/{employee_id}/withdraw", response_model=WithdrawResponse)
async def process_withdrawal(
    employee_id: uuid.UUID,
    data: WithdrawRequest,
    request: Request,                              # ← added for idempotency key
    locale: str = "ar",
    current_user: User = Depends(
        RoleChecker(allowed_roles=["superadmin", "manager"])
    ),
    db: AsyncSession = Depends(get_db),
):
    # Idempotency check — return cached response if key already processed
    idem_key = extract_idempotency_key(request)
    if idem_key:
        existing = await find_idempotent_response(db, idem_key)
        if existing:
            return JSONResponse(
                status_code=existing["status"],
                content=existing["body"],
            )

    # ... existing validation: date closure, employee check, lock, balance check, insert ...

    # Build response
    response_data = {
        "id": str(expense.id),
        "receipt_number": expense.receipt_number,
        "amount": float(expense.amount),
        "recipient_name": expense.recipient_name,
        "date": expense.date.isoformat(),
        "remaining_balance": remaining,
    }

    # Persist idempotency key before returning
    if idem_key:
        await save_idempotent_response(db, idem_key, 200, response_data)

    return response_data
```

#### Frontend — already wired

The `apiClient` interceptor in `apps/erp/frontend/lib/api.ts` (lines 74–80) already auto-generates a UUID and attaches it as `Idempotency-Key` for every POST/PATCH/PUT request. **No frontend changes needed for idempotency.**

#### Key Cleanup

Idempotency keys accumulate rapidly. Add a background cleanup job:

```sql
-- Run via pg_cron or your scheduler every hour:
DELETE FROM idempotency_keys WHERE created_at < now() - INTERVAL '24 hours';
```

---

## 3. Frontend Layer (Next.js)

### 3.1 Server Component: `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/staff-payroll/page.tsx`

```typescript
// This is the entry page — it is a Server Component that fetches
// initial data, then delegates interactivity to a client component.

import { apiClient } from "@/lib/api";
import { StaffPayrollClient } from "./StaffPayrollClient";

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
  total_drawn_this_month: number;
  remaining_balance: number;
}

async function fetchStaffPayroll(): Promise<StaffMember[]> {
  try {
    const { data } = await apiClient.get<StaffMember[]>("/staff-payroll");
    return data;
  } catch {
    return [];
  }
}

export default async function StaffPayrollPage({
  params,
}: {
  params: { locale: string };
}) {
  const staff = await fetchStaffPayroll();

  return <StaffPayrollClient staff={staff} locale={params.locale} />;
}
```

> **Note:** `apiClient` currently uses axios with `withCredentials: true` and a base URL of `/api/v1` on the client. If this Server Component runs on the server at build time, use `fetch()` with the absolute `NEXT_PUBLIC_API_URL` instead. See Section 3.4 for the pure-server alternative.

### 3.2 Client Component: `StaffPayrollClient.tsx`

Create at `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/staff-payroll/StaffPayrollClient.tsx`.

```typescript
"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import Modal from "@/components/Modal";
import { Loader2, RefreshCw, Wallet } from "lucide-react";

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  monthly_salary: number;
  total_drawn_this_month: number;
  remaining_balance: number;
}

interface Props {
  initialStaff: StaffMember[];
  locale: string;
}

const t = (locale: string) =>
  ({
    ar: {
      title: "الرواتب",
      subtitle: "إدارة سحوبات الرواتب للموظفين",
      name: "الاسم",
      role: "الوظيفة",
      monthlySalary: "الراتب الشهري",
      totalDrawn: "المسحوب هذا الشهر",
      remaining: "المتبقي",
      action: "إجراء",
      processWithdrawal: "صرف راتب",
      enterAmount: "أدخل المبلغ",
      description: "ملاحظات (اختياري)",
      save: "صرف",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      refresh: "تحديث",
      insufficient: "رصيد غير كافٍ",
      success: "تم الصرف بنجاح",
      sar: "ريال",
    },
    en: {
      title: "Staff Payroll",
      subtitle: "Manage salary withdrawals for staff",
      name: "Name",
      role: "Role",
      monthlySalary: "Monthly Salary",
      totalDrawn: "Drawn This Month",
      remaining: "Remaining",
      action: "Action",
      processWithdrawal: "Process Withdrawal",
      enterAmount: "Enter Amount",
      description: "Notes (optional)",
      save: "Withdraw",
      cancel: "Cancel",
      loading: "Loading...",
      refresh: "Refresh",
      insufficient: "Insufficient balance",
      success: "Withdrawal processed",
      sar: "YER",
    },
  })[locale === "en" ? "en" : "ar"];

export function StaffPayrollClient({ initialStaff, locale }: Props) {
  const texts = t(locale);
  const isRtl = locale === "ar";

  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [loading, setLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<StaffMember[]>("/staff-payroll");
      setStaff(data);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const openWithdrawModal = (member: StaffMember) => {
    setSelectedMember(member);
    setWithdrawAmount("");
    setDescription("");
    setError("");
    setSuccessMsg("");
  };

  const handleWithdraw = async () => {
    if (!selectedMember) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > selectedMember.remaining_balance) {
      setError(texts.insufficient);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiClient.post(
        `/staff-payroll/${selectedMember.id}/withdraw`,
        {
          amount,
          description: description || undefined,
        }
      );

      // Do NOT optimistically update — always fetch authoritative state
      // from the server. Financial data must reflect the actual DB state,
      // especially since the server applies a pessimistic row lock and
      // may reject the withdrawal if another transaction committed first.
      await refresh();

      setSuccessMsg(texts.success);
      setTimeout(() => {
        setSelectedMember(null);
        setSuccessMsg("");
      }, 1200);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail || "An error occurred";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      manager: "bg-blue-50 text-blue-600 border-blue-200",
      secretary: "bg-purple-50 text-purple-600 border-purple-200",
      cleaner: "bg-slate-100 text-slate-600 border-slate-200",
      security: "bg-amber-50 text-amber-600 border-amber-200",
      receptionist: "bg-cyan-50 text-cyan-600 border-cyan-200",
      accountant: "bg-emerald-50 text-emerald-600 border-emerald-200",
      maintenance: "bg-orange-50 text-orange-600 border-orange-200",
      other: "bg-gray-100 text-gray-600 border-gray-200",
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
          colors[role] || colors.other
        }`}
      >
        {role}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{texts.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{texts.subtitle}</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="btn-icon"
          title={texts.refresh}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>{texts.name}</th>
              <th>{texts.role}</th>
              <th>{texts.monthlySalary}</th>
              <th>{texts.totalDrawn}</th>
              <th>{texts.remaining}</th>
              <th>{texts.action}</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center text-sm text-slate-500 py-8"
                >
                  {texts.loading}
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id}>
                  <td className="font-medium text-slate-900">
                    {member.full_name}
                  </td>
                  <td>{roleBadge(member.role)}</td>
                  <td className="font-semibold text-slate-900">
                    {member.monthly_salary.toFixed(2)} {texts.sar}
                  </td>
                  <td className="text-slate-600">
                    {member.total_drawn_this_month.toFixed(2)} {texts.sar}
                  </td>
                  <td>
                    <span
                      className={`font-semibold ${
                        member.remaining_balance <= 0
                          ? "text-red-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {member.remaining_balance.toFixed(2)} {texts.sar}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => openWithdrawModal(member)}
                      disabled={member.remaining_balance <= 0}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                    >
                      <Wallet size={14} />
                      <span>{texts.processWithdrawal}</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Withdrawal Modal */}
      <Modal
        open={selectedMember !== null}
        onClose={() => {
          setSelectedMember(null);
          setError("");
        }}
        title={`${texts.processWithdrawal} — ${selectedMember?.full_name || ""}`}
        size="md"
      >
        {selectedMember && (
          <div className="space-y-4">
            {/* Info strip */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{texts.monthlySalary}</p>
                <p className="font-bold text-slate-900">
                  {selectedMember.monthly_salary.toFixed(2)} {texts.sar}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{texts.totalDrawn}</p>
                <p className="font-bold text-slate-600">
                  {selectedMember.total_drawn_this_month.toFixed(2)} {texts.sar}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-slate-500 text-xs">{texts.remaining}</p>
                <p className="font-bold text-emerald-600">
                  {selectedMember.remaining_balance.toFixed(2)} {texts.sar}
                </p>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {texts.enterAmount}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={selectedMember.remaining_balance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="input-field"
                placeholder="0.00"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {texts.description}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                rows={2}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                {successMsg}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleWithdraw}
                disabled={
                  submitting ||
                  !withdrawAmount ||
                  parseFloat(withdrawAmount) <= 0
                }
                className="btn-primary"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {texts.save}
              </button>
              <button
                onClick={() => {
                  setSelectedMember(null);
                  setError("");
                }}
                disabled={submitting}
                className="btn-secondary"
              >
                {texts.cancel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
```

### 3.3 Navigation Entry

Add the staff-payroll link to the sidebar/navigation config (location depends on where nav is defined — likely `components/layout/Sidebar.tsx` or similar):

```typescript
{
  label: "Staff Payroll",
  href: `/dashboard/staff-payroll`,
  icon: Wallet,
  permissions: ["superadmin", "manager", "secretary"],
}
```

### 3.4 Server vs. Client Data Fetching Note

If the `apiClient` (axios with `withCredentials: true`) does not work in a Server Component context (no cookies forwarded server-side), use one of:

**Option A — Pure server fetch with cookie forwarding (recommended):**

```typescript
// In the Server Component page
import { cookies } from "next/headers";

async function fetchStaffPayroll(): Promise<StaffMember[]> {
  const cookieStore = cookies();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/staff-payroll`,
    {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    }
  );
  if (!res.ok) return [];
  return res.json();
}
```

**Option B — Client-side only (simpler but loses SSR):**  
Remove `async` from the page component and use `useEffect` in `StaffPayrollClient` to fetch on mount.

The plan uses Option A for correctness.

---

## 4. Implementation Steps

### Phase 1: Database (2 migrations)

- [ ] **1.1** Create Alembic migration `202607200000_add_salary_draw_expense_type.py` that adds `salary_draw` to the `expensetype` PostgreSQL enum.
- [ ] **1.2** Create the partial index `ix_expenses_salary_draw_month` on `expenses(recipient_id, date, type WHERE type = 'salary_draw')`.
- [ ] **1.3** Create Alembic migration `202607210000_add_idempotency_keys.py` that creates the `idempotency_keys` table with unique index on `key` and index on `created_at`.
- [ ] **1.4** Run `alembic upgrade head` and verify both migrations applied cleanly.
- [ ] **1.5** Update `Expense.type` enum definition in `apps/erp/backend/app/modules/lms/models.py` to include `salary_draw`.

### Phase 2: Backend (3 files, 1 modification)

- [ ] **2.1** Create `apps/erp/backend/app/modules/lms/staff_payroll_service.py` with:
  - `list_staff_for_payroll(db)` — bulk query, monthly aggregation, returns list of dicts.
  - `process_salary_withdrawal(db, employee_id, amount, created_by, ...)` — validation + insert with `with_for_update()` pessimistic lock.
- [ ] **2.2** Create `apps/erp/backend/app/modules/lms/idempotency_service.py` with:
  - `extract_idempotency_key(request)` — reads `Idempotency-Key` header.
  - `find_idempotent_response(db, key)` — returns cached response if key exists.
  - `save_idempotent_response(db, key, status_code, body)` — persists key on success.
- [ ] **2.3** Create `apps/erp/backend/app/modules/lms/staff_payroll_router.py` with:
  - Pydantic schemas (`StaffPayrollMember`, `WithdrawRequest`, `WithdrawResponse`).
  - `GET /staff-payroll` endpoint.
  - `POST /staff-payroll/{employee_id}/withdraw` endpoint with idempotency check, date-closure validation, row lock, and balance validation.
- [ ] **2.4** Register the router in the FastAPI app (either in `lms/router.py` or the main app).
- [ ] **2.5** Re-run `GET /api/v1/expenses/eligible-recipients?type=salary_payment` and `type=secretary_advance` — these should continue to work for the existing expenses page. No removal of old types yet (backward compat).
- [ ] **2.6** Test manually with curl/httpie, including idempotency replay:
  ```bash
  # List staff
  curl -s http://localhost:8000/api/v1/staff-payroll | jq .
  # Withdraw with an explicit idempotency key
  IDEM_KEY=$(uuidgen)
  curl -s -X POST http://localhost:8000/api/v1/staff-payroll/<id>/withdraw \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d '{"amount": 25000}' | jq .
  # Replay the exact same request — should return cached 200, not 400
  curl -s -X POST http://localhost:8000/api/v1/staff-payroll/<id>/withdraw \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d '{"amount": 25000}' | jq .
  # Verify only one expense row was created
  curl -s http://localhost:8000/api/v1/staff-payroll | jq .
  ```

### Phase 3: Frontend (2 files, 1 modification)

- [ ] **3.1** Create `apps/erp/frontend/app/[locale]/(dashboard)/dashboard/staff-payroll/page.tsx` (Server Component).
- [ ] **3.2** Create `.../staff-payroll/StaffPayrollClient.tsx` (Client Component with table + modal).
  - **No optimistic UI updates** — financial data is re-fetched from the server after every successful withdrawal.
  - Remove the unused `useOptimistic` import.
- [ ] **3.3** Add navigation entry to the sidebar for `superadmin`, `manager`, and `secretary` roles.
- [ ] **3.4** Verify the page renders the table with correct data and the withdrawal modal calls the backend correctly.
- [ ] **3.5** Test edge cases:
  - Attempt withdrawal exceeding remaining balance → see error in modal, no state mutation.
  - Withdraw to exactly 0 balance → button disables, remaining shows `0.00` in red.
  - Withdrawal on a closed date → see date-closed error.
  - Rapid double-click on "Withdraw" → idempotency key prevents duplicate expense row.

### Phase 4: Cleanup (optional, deferred)

- [ ] **4.1** After the new `salary_draw` UX is stable, consider deprecating `secretary_advance` and `salary_payment` in the old Expenses page.
- [ ] **4.2** Remove the old independent-budget bug (see `docs/expenses-page.md`) once the migration to `salary_draw` is complete.

---

## Appendix: Data Flow Diagram

```
Browser                          FastAPI                         PostgreSQL
  │                                │                                │
  │  GET /staff-payroll            │                                │
  │ ──────────────────────────────>│                                │
  │                                │  SELECT employees              │
  │                                │  WHERE type != teacher         │
  │                                │ ──────────────────────────────>│
  │                                │  <── employees ───────────────│
  │                                │                                │
  │                                │  SELECT SUM(amount)            │
  │                                │  FROM expenses                 │
  │                                │  WHERE type='salary_draw'      │
  │                                │    AND recipient_id IN (...)    │
  │                                │    AND date >= month_start      │
  │                                │ ──────────────────────────────>│
  │                                │  <── totals ──────────────────│
  │                                │                                │
  │  <── [{full_name, role,        │                                │
  │         monthly_salary,        │                                │
  │         total_drawn,           │                                │
  │         remaining}]            │                                │
  │                                │                                │
  │  POST /staff-payroll/{id}/withdraw                              │
  │  { amount: 25000 }             │                                │
  │ ──────────────────────────────>│                                │
  │                                │  Check date not closed         │
  │                                │  Check employee exists/active  │
  │                                │  Calculate remaining:          │
  │                                │    monthly_salary - SUM(draws)  │
  │                                │ ──────────────────────────────>│
  │                                │  <── result ──────────────────│
  │                                │                                │
  │                                │  If amount > remaining → 400   │
  │                                │  Else INSERT INTO expenses     │
  │                                │ ──────────────────────────────>│
  │                                │                                │
  │  <── 201 { receipt_number,     │                                │
  │         remaining_balance }    │                                │
  │                                │                                │
  │  (Client re-fetches from       │                                │
  │   server — no optimistic UI)   │                                │
```

---

## Appendix: Migration from Existing Types

The MVP keeps the old `secretary_advance` and `salary_payment` enum values for backward compatibility. New draws use `salary_draw`. The old Expenses page continues to work with the old types.

When ready to fully migrate:
1. Update the old Expenses page form to use `salary_draw` instead of `secretary_advance`/`salary_payment`.
2. Run a data migration to convert existing rows:
   ```sql
   UPDATE expenses SET type = 'salary_draw'
   WHERE type IN ('secretary_advance', 'salary_payment');
   ```
3. Remove the old types from the enum (requires dropping/recreating the enum type — see downgrade in Section 1.2 for pattern).
4. Delete the old endpoints or mark them deprecated.
