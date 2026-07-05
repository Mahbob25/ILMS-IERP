import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Authentication Flow', () => {
  test('should reject login with invalid credentials', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: 'wrong@email.com', password: 'WrongPass1!' },
    })
    // 429 when rate-limited, 401 for actual auth failure
    expect([401, 429]).toContain(response.status())

    if (response.status() === 401) {
      const body = await response.json()
      expect(body.detail).toContain('Invalid email or password')
    }
  })

  test('should reject login with missing fields (422 validation)', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: 'test@email.com' },
    })
    expect(response.status()).toBe(422)
  })

  test('should access /auth/me with valid session', async ({ request }) => {
    const headers = authHeader('superadmin')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/auth/me`, { headers })
    expect(response.status()).toBe(200)

    const me = await response.json()
    expect(me).toHaveProperty('id')
    expect(me).toHaveProperty('email')
    expect(me).toHaveProperty('role')
    expect(me.role).toBe('superadmin')
  })

  test('should reject /auth/me without authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/auth/me`)
    expect(response.status()).toBe(401)
  })

  test('should return user permissions for superadmin', async ({ request }) => {
    const headers = authHeader('superadmin')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/auth/me/permissions`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('permissions')
    expect(Array.isArray(body.permissions)).toBe(true)
  })

  test('should logout and revoke refresh token', async ({ request }) => {
    const headers = authHeader('superadmin')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.post(`${BASE_URL}/auth/logout`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('success')
  })
})
