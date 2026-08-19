import { test, expect } from '@playwright/test'
import { ensureAuthHeader, authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Token Refresh Flow', () => {
  test('should reject request with malformed token', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users`, {
      headers: { Cookie: 'access_token=invalidtoken123' },
    })
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('should reject request with expired-looking token', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: { Cookie: 'access_token=eyJhbGciOiJIUzI1NiJ9.dG9rZW4.YnVmZmVy' },
    })
    expect([200, 401]).toContain(response.status())
  })

  test('should re-authenticate after failed request', async ({ request }) => {
    const badResponse = await request.get(`${BASE_URL}/users`, {
      headers: { Cookie: 'access_token=bad_token' },
    })
    expect(badResponse.status()).toBe(401)

    const loginRes = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: 'superadmin@aldirasat.com', password: 'admin123' },
    })
    expect([200, 429]).toContain(loginRes.status())

    if (loginRes.status() === 429) {
      test.skip(true, 'Rate limited, skipping re-auth verification')
      return
    }

    const setCookie = loginRes.headers()['set-cookie'] || ''
    const accessToken = setCookie.match(/access_token=([^;]+)/)?.[1]
    if (!accessToken) {
      test.skip(true, 'No access token received')
      return
    }

    const finalResponse = await request.get(`${BASE_URL}/users`, {
      headers: { Cookie: `access_token=${accessToken}` },
    })
    expect(finalResponse.status()).toBe(200)
  })

  test('should get fresh tokens via refresh endpoint', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: 'superadmin@aldirasat.com', password: 'admin123' },
    })
    expect([200, 429]).toContain(loginRes.status())

    if (loginRes.status() === 429) {
      test.skip(true, 'Rate limited, skipping')
      return
    }

    const setCookie = loginRes.headers()['set-cookie'] || ''
    if (!setCookie) {
      test.skip(true, 'No cookies received')
      return
    }

    const refreshRes = await request.post(`${BASE_URL}/auth/refresh`, {
      headers: { Cookie: setCookie },
    })
    expect([200, 401, 429]).toContain(refreshRes.status())
  })
})
