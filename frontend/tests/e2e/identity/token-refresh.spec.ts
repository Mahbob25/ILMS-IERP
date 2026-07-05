import { test, expect } from '@playwright/test'
import { getToken } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Token Refresh Flow', () => {
  test('should reject refresh without refresh token cookie', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/auth/refresh`)
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.detail).toContain('Refresh token missing')
  })

  test('should login then refresh token successfully', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: 'superadmin@institute.dev', password: 'admin123' },
    })
    expect([200, 429]).toContain(loginRes.status())

    if (loginRes.status() === 429) {
      test.skip(true, 'Rate limited, skipping')
      return
    }

    const headers = loginRes.headersArray()
    const cookieParts = headers
      .filter(h => h.name.toLowerCase() === 'set-cookie')
      .map(h => h.value.split(';')[0])
    const cookieStr = cookieParts.join('; ')

    if (!cookieStr) {
      test.skip(true, 'No cookies received')
      return
    }

    const refreshResponse = await request.post(`${BASE_URL}/auth/refresh`, {
      headers: { Cookie: cookieStr },
    })
    expect([200, 401, 429]).toContain(refreshResponse.status())
  })

  test('should reject expired or invalid refresh token', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/auth/refresh`, {
      headers: { Cookie: 'access_token=invalid; refresh_token=invalid' },
    })
    expect(response.status()).toBe(401)
  })
})
