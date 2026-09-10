import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'

const { getMock, postMock, authMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  authMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  apiClient: { get: getMock, post: postMock, delete: vi.fn(), put: vi.fn() },
}))
vi.mock('@/components/AuthContext', () => ({ useAuth: () => authMock() }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'ar' }),
  useRouter: () => ({ push: vi.fn() }),
}))

import StudentsPage from '@/app/[locale]/(dashboard)/dashboard/students/page'

// What the backend returns when the student_code is already taken.
const DUPLICATE_DETAIL = 'Student code already exists'

/** Resolve a field by its sibling <label> text. */
const fieldByLabel = (text: string) => {
  const label = screen.getByText(text)
  return label.parentElement?.querySelector('input') as HTMLInputElement
}

/** The modal overlay element. Modals render `null` when closed. */
const modalOverlay = () => document.querySelector('.fixed.inset-0.z-50') as HTMLElement | null

describe('add-student errors render inside the modal', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { id: 'u1', role: { id: 'r1', name: 'manager' }, is_superadmin: false },
    })
    getMock.mockResolvedValue({ data: { items: [], total: 0 } })
    postMock.mockRejectedValue({ response: { data: { detail: DUPLICATE_DETAIL } } })
  })

  afterEach(() => cleanup())

  test('shows the save error inside the open modal, not behind it', async () => {
    render(<StudentsPage />)

    // Open the add-student modal.
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة طالب' }))
    expect(modalOverlay()).not.toBeNull()

    // A valid Arabic name passes the client-side validateName gate.
    fireEvent.change(fieldByLabel('الاسم الكامل'), { target: { value: 'أحمد علي' } })
    fireEvent.change(fieldByLabel('رقم الطالب'), { target: { value: 'STU001' } })

    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    const overlay = await waitFor(() => {
      const el = modalOverlay()
      expect(el).not.toBeNull()
      return el as HTMLElement
    })

    // The error must be inside the dialog. Before the fix it went to the
    // page-level banner, which renders outside this overlay and behind the
    // backdrop, so this lookup would fail.
    expect(within(overlay).getByText(DUPLICATE_DETAIL)).toBeInTheDocument()
    expect(within(overlay).getByRole('button', { name: 'حفظ' })).toBeInTheDocument()
  })

  test('shows the invalid-name error inside the open modal', async () => {
    render(<StudentsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'إضافة طالب' }))
    // Latin characters are rejected under the Arabic locale.
    fireEvent.change(fieldByLabel('الاسم الكامل'), { target: { value: 'John Smith' } })

    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    const overlay = modalOverlay()
    expect(overlay).not.toBeNull()
    expect(within(overlay as HTMLElement).getByText('الاسم يحتوي على أحرف غير صالحة')).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalled()
  })
})
