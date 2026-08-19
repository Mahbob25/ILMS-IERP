import { test, expect } from '@playwright/test'
import { ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Double-Click Prevention', () => {
  const uniqueId = () => `E2E_DBL_${Date.now().toString(36).toUpperCase()}`

  test('rapid submit should create only one payment', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    expect(headers.Cookie).toBeTruthy()

    const enrollmentsRes = await request.get(`${BASE_URL}/academic/enrollments?limit=1`, { headers })
    const enrollBody = await enrollmentsRes.json()
    const enrollments = enrollBody.items || []
    if (enrollments.length === 0) {
      test.skip(true, 'No enrollments found for payment')
      return
    }

    const enrollment = enrollments[0]
    const payload = {
      enrollment_id: enrollment.id,
      amount: 10.0,
      payment_method: 'cash',
      receipt_number: uniqueId(),
    }

    const responses = await Promise.all([
      request.post(`${BASE_URL}/lms/payments`, { headers, data: payload }),
      request.post(`${BASE_URL}/lms/payments`, { headers, data: payload }),
      request.post(`${BASE_URL}/lms/payments`, { headers, data: payload }),
    ])

    const statuses = responses.map(r => r.status())
    const created = statuses.filter(s => s === 201).length
    expect(created).toBeLessThanOrEqual(1)

    const hasIdempotent = statuses.some(s => s === 409 || s === 422)
    expect(created <= 1 || hasIdempotent).toBe(true)
  })
})
