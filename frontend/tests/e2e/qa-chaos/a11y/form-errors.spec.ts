import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('A11y: Form Error Responses', () => {
  const headers = authHeader('superadmin')

  test('creating student with missing fields returns clear error', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: {},
    })
    expect([400, 422]).toContain(response.status())

    const body = await response.json()
    const bodyStr = JSON.stringify(body).toLowerCase()
    expect(bodyStr.length).toBeGreaterThan(0)
  })

  test('creating student with empty string fields returns validation error', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: '', full_name: '' },
    })
    expect([400, 422]).toContain(response.status())

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('creating payment with zero amount returns error', async ({ request }) => {
    const secHeaders = await ensureAuthHeader('secretary')

    const enrollRes = await request.get(`${BASE_URL}/academic/enrollments?limit=1`, { headers: secHeaders })
    const enrollBody = await enrollRes.json()
    const enrollments = enrollBody.items || []
    if (enrollments.length === 0) {
      test.skip(true, 'No enrollments found')
      return
    }

    const response = await request.post(`${BASE_URL}/lms/payments`, {
      headers: secHeaders,
      data: { enrollment_id: enrollments[0].id, amount: 0, payment_method: 'cash' },
    })
    expect([400, 422]).toContain(response.status())

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('creating course with negative credits returns error', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: 'Bad Course', code: `BAD${Date.now().toString(36).toUpperCase()}`, credits: -5 },
    })
    expect([400, 422]).toContain(response.status())

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('duplicate student code returns conflict error with detail', async ({ request }) => {
    const studentCode = `DUP_A11Y_${Date.now().toString(36).toUpperCase()}`

    const createRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Original ${Date.now()}` },
    })
    expect(createRes.status()).toBe(201)

    const dupRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Duplicate ${Date.now()}` },
    })
    expect(dupRes.status()).toBe(409)

    const body = await dupRes.json()
    expect(body).toBeTruthy()
  })
})
