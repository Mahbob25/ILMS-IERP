import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

const { getMock, authMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  authMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ apiClient: { get: getMock } }))
vi.mock('@/components/AuthContext', () => ({ useAuth: () => authMock() }))

import { useClosureStatus } from '@/hooks/useClosureStatus'

const TODAY = '2026-09-10'

const userWith = (role: string, is_superadmin = false) => ({
  user: { id: 'u1', role: { id: 'r1', name: role }, is_superadmin },
})

describe('useClosureStatus role gating', () => {
  beforeEach(() => {
    authMock.mockReturnValue(userWith('manager'))
    getMock.mockResolvedValue({ data: [] })
  })

  afterEach(() => cleanup())

  test('does not request closures for a teacher', () => {
    authMock.mockReturnValue(userWith('teacher'))

    const { result } = renderHook(() => useClosureStatus(TODAY))

    expect(getMock).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  test('does not request closures while the user is not loaded', () => {
    authMock.mockReturnValue({ user: null })

    renderHook(() => useClosureStatus(TODAY))

    expect(getMock).not.toHaveBeenCalled()
  })

  test('requests closures for a manager and returns the matching status', async () => {
    getMock.mockResolvedValue({
      data: [{ date: TODAY, status: 'closed' }],
    })

    const { result } = renderHook(() => useClosureStatus(TODAY))

    await waitFor(() => expect(result.current).toBe('closed'))
    expect(getMock).toHaveBeenCalledWith('/lms/daily-closures', {
      params: { date_from: TODAY, date_to: TODAY },
    })
  })

  test('requests closures for a superadmin', async () => {
    authMock.mockReturnValue(userWith('superadmin', true))

    const { result } = renderHook(() => useClosureStatus(TODAY))

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
  })

  test('does not request closures when no date is selected', () => {
    renderHook(() => useClosureStatus(null))

    expect(getMock).not.toHaveBeenCalled()
  })

  test('starts requesting once a teacher session becomes an allowed role', async () => {
    authMock.mockReturnValue(userWith('teacher'))

    const { rerender } = renderHook(() => useClosureStatus(TODAY))
    expect(getMock).not.toHaveBeenCalled()

    authMock.mockReturnValue(userWith('manager'))
    rerender()

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))
  })
})
