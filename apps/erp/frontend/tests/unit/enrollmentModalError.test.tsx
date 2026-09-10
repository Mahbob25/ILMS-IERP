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

import EnrollmentsPage from '@/app/[locale]/(dashboard)/dashboard/enrollments/page'

// The exact message the backend returns for a section with no price
// (get_error_detail("section_no_price", "ar")).
const NO_PRICE_DETAIL = 'لا يمكن التسجيل - الشعبة ليس لها سعر محدد. يجب تعيين السعر أولاً'

const COURSE = { id: 'course-1', name: 'Mathematics', code: 'MATH1' }
const SECTION = { id: 'section-1', course_id: COURSE.id, status: 'pending' }
const STUDENT = { id: 'student-1', student_code: 'STU001', full_name: 'Test Student' }

const respond = (url: string) => {
  if (url.includes('/academic/students')) return { items: [STUDENT], total: 1 }
  if (url.includes('/academic/course-sections')) return { items: [SECTION], total: 1 }
  if (url.includes('/academic/courses')) return { items: [COURSE], total: 1 }
  return { items: [], total: 0 }
}

/** The modal overlay element. Modals render `null` when closed. */
const modalOverlay = () => document.querySelector('.fixed.inset-0.z-50') as HTMLElement | null

describe('enrollment errors render inside the modal', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { id: 'u1', role: { id: 'r1', name: 'manager' }, is_superadmin: false },
    })
    getMock.mockImplementation((url: string) => Promise.resolve({ data: respond(url) }))
    postMock.mockRejectedValue({ response: { data: { detail: NO_PRICE_DETAIL } } })
  })

  afterEach(() => cleanup())

  test('shows the section-no-price error inside the open modal, not behind it', async () => {
    render(<EnrollmentsPage />)

    // Wait for lookups to load, then open the enroll modal.
    fireEvent.click(await screen.findByRole('button', { name: /تسجيل طالب/ }))
    expect(modalOverlay()).not.toBeNull()

    // Pick a student from the search picker (focus reveals the list).
    const studentSearch = screen.getByPlaceholderText('ابحث عن طالب بالاسم أو الرقم...')
    fireEvent.focus(studentSearch)
    fireEvent.mouseDown(await screen.findByText(STUDENT.full_name))

    // Pick a section from the Select listbox (its accessible name is the
    // placeholder, so target it by role/aria instead).
    fireEvent.click(document.querySelector('button[aria-haspopup="listbox"]') as HTMLElement)
    fireEvent.click(await screen.findByRole('option'))

    // Submit; the backend rejects with the no-price detail.
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    const overlay = await waitFor(() => {
      const el = modalOverlay()
      expect(el).not.toBeNull()
      return el as HTMLElement
    })

    // The error must be inside the dialog. Before the fix it was written to the
    // page-level banner, which renders outside this overlay (and behind the
    // backdrop), so this lookup would fail.
    expect(within(overlay).getByText(NO_PRICE_DETAIL)).toBeInTheDocument()

    // The modal stays open so the user can fix the problem.
    expect(within(overlay).getByRole('button', { name: 'حفظ' })).toBeInTheDocument()
  })
})
