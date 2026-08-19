# Student Detail Page — Refund Display

Show all refund states (unclaimed, claimed, forfeited) on the student detail page instead of only unclaimed ones.

## Current State

- `PendingRefundBadge` component shows only UNCLAIMED refunds
- Backend endpoint `GET /students/{student_id}/pending-refunds` filters to UNCLAIMED only, missing `section_name` and `cancelled_at` fields
- No claimed/forfeited refund history shown
- Badge has independent fetch — not wired to page's RefreshButton

## Implementation Phases

### Phase 1: Backend — New `get_student_refunds()` function

**File:** `apps/erp/backend/app/modules/academic/cancellation_service.py`

Replace `get_student_pending_refunds()` with a new function that returns all statuses with full details:

```python
async def get_student_refunds(
    db: AsyncSession, student_id: uuid.UUID
) -> list[dict]:
    result = await db.execute(
        select(PendingRefund)
        .options(
            joinedload(PendingRefund.enrollment).joinedload(Enrollment.section).joinedload(CourseSection.course),
            joinedload(PendingRefund.enrollment).joinedload(Enrollment.section).joinedload(CourseSection.course),
            joinedload(PendingRefund.section_cancellation),
            joinedload(PendingRefund.refund),
        )
        .where(
            PendingRefund.enrollment.has(Enrollment.student_id == student_id),
        )
        .order_by(PendingRefund.created_at.desc())
    )
    refunds = result.scalars().all()

    return [
        {
            "id": r.id,
            "enrollment_id": r.enrollment_id,
            "section_cancellation_id": r.section_cancellation_id,
            "unenrollment_record_id": r.unenrollment_record_id,
            "amount": float(r.amount),
            "status": r.status,
            "source": r.source,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
            "section_name": r.enrollment.section.course.name if r.enrollment and r.enrollment.section and r.enrollment.section.course else None,
            "cancelled_at": r.section_cancellation.cancelled_at.isoformat() if r.section_cancellation else None,
            "receipt_number": r.refund.receipt_number if r.refund else None,
            "disbursed_at": r.refund.disbursed_at.isoformat() if r.refund else None,
        }
        for r in refunds
    ]
```

### Phase 2: Backend — Update Router Endpoint

**File:** `apps/erp/backend/app/modules/lms/router.py`

Change line 1016 from `GET /students/{student_id}/pending-refunds` to `GET /students/{student_id}/refunds`:

- Remove the UNCLAIMED-only filter
- Call `get_student_refunds()` instead of `get_student_pending_refunds()`
- Include `section_name`, `cancelled_at`, `receipt_number`, `disbursed_at` in response
- Add `secretary` to allowed roles

### Phase 3: Frontend — Create `StudentRefundsCard` Component

**New file:** `apps/erp/frontend/components/students/StudentRefundsCard.tsx`

Replace the simple badge with a card that has three sections:

```
┌─────────────────────────────────────┐
│ 💰 Refunds                          │
│                                     │
│ ┌─ UNCLAIMED ────────────────────┐  │
│ │ 🟡 500.00 YER — Section Name   │  │
│ │    Cancelled: 12 Jan 2026      │  │
│ │    [▼ expand]                  │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌─ CLAIMED ──────────────────────┐  │
│ │ 🟢 300.00 YER — Section Name   │  │
│ │    Receipt: RFD-20260112-001   │  │
│ │    Disbursed: 15 Jan 2026      │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌─ FORFEITED ────────────────────┐  │
│ │ ⚪ 200.00 YER — Section Name   │  │
│ │    Expired: 12 Jul 2026        │  │
│ └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

- Show nothing (return null) when there are zero refunds of all statuses
- Collapse forfeited by default, show unclaimed/claimed expanded
- Use existing translation pattern (Arabic/English)

### Phase 4: Frontend — Wire into Student Detail Page

**File:** `apps/erp/frontend/app/[locale]/dashboard/students/[id]/page.tsx`

1. Add refund-related state:
   ```typescript
   const [refunds, setRefunds] = useState<any[]>([]);
   ```

2. Add refund fetch to `fetchStudent()` inside the `Promise.all()`:
   ```typescript
   const refundRes = await apiClient.get(`/lms/students/${studentId}/refunds`)
     .then(r => r.data)
     .catch(() => []);
   ```

3. Store in state:
   ```typescript
   setRefunds(refundRes);
   ```

4. Replace line 323:
   ```tsx
   <PendingRefundBadge studentId={studentId} isRtl={isRtl} locale={locale} />
   ```
   With:
   ```tsx
   {refunds.length > 0 && <StudentRefundsCard refunds={refunds} isRtl={isRtl} locale={locale} />}
   ```

5. Add translations (Arabic/English) for "Refunds", "Unclaimed", "Claimed", "Forfeited", "Receipt", "Disbursed At", "No refunds"

### Phase 5: Delete Old Component

Remove `apps/erp/frontend/components/students/PendingRefundBadge.tsx` once `StudentRefundsCard` replaces all usages.

## Verification

- [ ] Student with unclaimed refunds sees amber card with expandable details
- [ ] Student with claimed refunds sees green card with receipt number
- [ ] Student with forfeited refunds sees grey collapsed section
- [ ] Student with no refunds sees nothing (no empty card)
- [ ] Clicking Refresh button updates refund data
- [ ] Cashier disburses → navigating to student page shows CLAIMED
- [ ] All statuses display correctly in both Arabic and English
