import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { getMock, putMock, authMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  authMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  apiClient: { get: getMock, post: vi.fn(), delete: vi.fn(), put: putMock },
}))
vi.mock('@/components/AuthContext', () => ({ useAuth: () => authMock() }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'ar' }),
  useRouter: () => ({ push: vi.fn() }),
}))

import StudentsPage from '@/app/[locale]/(dashboard)/dashboard/students/page'

// A student that already has a linked parent, as the API now returns it.
const STUDENT = {
  id: 's1',
  student_code: 'STU001',
  full_name: 'أحمد علي',
  email: 'ahmed@example.com',
  phone: '7700000000',
  parent_full_name: 'أب أحمد',
  parent_phone: '7711111111',
  parent_email: 'parent@example.com',
  parent_relationship: 'الأب',
}

/** Resolve a field by its sibling <label> text. */
const fieldByLabel = (text: string) => {
  const label = screen.getByText(text)
  return label.parentElement?.querySelector('input') as HTMLInputElement
}

describe('editing a student persists parent information', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { id: 'u1', role: { id: 'r1', name: 'manager' }, is_superadmin: false },
    })
    getMock.mockResolvedValue({ data: { items: [STUDENT], total: 1 } })
    putMock.mockResolvedValue({ data: STUDENT })
  })

  afterEach(() => cleanup())

  test('prefills the parent fields from the student row', async () => {
    render(<StudentsPage />)

    fireEvent.click(await screen.findByTitle('تعديل'))

    expect(fieldByLabel('اسم ولي الأمر').value).toBe('أب أحمد')
    expect(fieldByLabel('هاتف ولي الأمر').value).toBe('7711111111')
    expect(fieldByLabel('بريد ولي الأمر').value).toBe('parent@example.com')
    expect(fieldByLabel('صلة القرابة').value).toBe('الأب')
  })

  test('sends parent fields in the update payload', async () => {
    render(<StudentsPage />)

    fireEvent.click(await screen.findByTitle('تعديل'))

    // The reported flow: the secretary adds/edits parent details on the form.
    fireEvent.change(fieldByLabel('اسم ولي الأمر'), { target: { value: 'أب جديد' } })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }))

    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))

    const [url, payload] = putMock.mock.calls[0]
    expect(url).toBe('/academic/students/s1')
    expect(payload.parent_full_name).toBe('أب جديد')
    expect(payload.parent_phone).toBe('7711111111')
    expect(payload.parent_email).toBe('parent@example.com')
    expect(payload.parent_relationship).toBe('الأب')
  })
})
