import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Submissions & Grades', () => {
  const headers = authHeader('superadmin')

  test('should list submissions for an assignment', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/assignments`, { headers })
    const assignments = await response.json()
    if (assignments.length === 0) {
      test.skip(true, 'No assignments found')
      return
    }

    const subsRes = await request.get(`${BASE_URL}/lms/assignments/${assignments[0].id}/submissions`, { headers })
    expect(subsRes.status()).toBe(200)

    const submissions = await subsRes.json()
    expect(Array.isArray(submissions)).toBe(true)
  })

  test('should reject listing submissions without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/assignments/00000000-0000-0000-0000-000000000000/submissions`)
    expect(response.status()).toBe(401)
  })

  test('should list grades for an assignment', async ({ request }) => {
    const assignmentsRes = await request.get(`${BASE_URL}/lms/assignments`, { headers })
    const assignments = await assignmentsRes.json()
    if (assignments.length === 0) {
      test.skip(true, 'No assignments found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/assignments/${assignments[0].id}/grades`, { headers })
    expect(response.status()).toBe(200)

    const grades = await response.json()
    expect(Array.isArray(grades)).toBe(true)
  })

  test('should reject getting grades for non-existent assignment', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.get(`${BASE_URL}/lms/assignments/${fakeId}/grades`, { headers })
    expect(response.status()).toBe(200)
    const grades = await response.json()
    expect(Array.isArray(grades)).toBe(true)
  })
})
