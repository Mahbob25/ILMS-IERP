import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Visual: API Error States', () => {
  test('network error simulation - invalid endpoint', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/nonexistent-route-xyz`)
    expect(response.status()).toBe(404)

    const body = await response.json()
    expect(body).toBeTruthy()
    expect(response.ok()).toBe(false)
  })

  test('server error - invalid payload on sections create', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')

    const response = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: null, teacher_id: null, capacity: 'invalid' },
    })
    expect([400, 422, 500]).toContain(response.status())

    const body = await response.json()
    expect(body).toBeTruthy()
    expect(response.ok()).toBe(false)
  })

  test('permission denied error response', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')

    const response = await request.get(`${BASE_URL}/users`, { headers })
    expect(response.status()).toBe(403)

    const body = await response.json()
    expect(body).toBeTruthy()
    expect(response.ok()).toBe(false)
  })

  test('empty data response - filtered payments', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')

    const response = await request.get(`${BASE_URL}/lms/payments?date_from=2099-01-01&date_to=2099-12-31`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(0)
    expect(response.ok()).toBe(true)
  })

  test('authentication error response', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users`, {
      headers: { Cookie: 'access_token=expired_fake_token' },
    })
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body).toBeTruthy()
    expect(response.ok()).toBe(false)
  })
})
