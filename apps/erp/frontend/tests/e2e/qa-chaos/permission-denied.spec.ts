import { test, expect } from '@playwright/test'
import { ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Permission Denied Access', () => {
  test('secretary should get 403 on admin-only /users endpoint', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/users`, { headers })
    expect(response.status()).toBe(403)
  })

  test('teacher should get 403 on admin-only /users endpoint', async ({ request }) => {
    const headers = await ensureAuthHeader('teacher')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/users`, { headers })
    expect(response.status()).toBe(403)
  })

  test('secretary should get 403 on permissions endpoint', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/permissions`, { headers })
    expect(response.status()).toBe(403)
  })

  test('secretary should get 403 on daily closure close', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    expect(headers.Cookie).toBeTruthy()

    const today = new Date().toISOString().split('T')[0]
    const response = await request.post(`${BASE_URL}/lms/daily-closures/${today}/close`, { headers })
    expect(response.status()).toBe(403)
  })

  test('unauthenticated request should get 401 on protected endpoint', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users`)
    expect(response.status()).toBe(401)
  })
})
