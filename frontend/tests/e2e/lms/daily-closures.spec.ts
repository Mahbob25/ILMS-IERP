import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Daily Closures', () => {
  const headers = authHeader('superadmin')

  test('should list daily closures', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/daily-closures`, { headers })
    expect(response.status()).toBe(200)

    const closures = await response.json()
    expect(Array.isArray(closures)).toBe(true)
  })

  test('should filter closures by date range', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]
    const response = await request.get(`${BASE_URL}/lms/daily-closures?date_from=${today}&date_to=${today}`, { headers })
    expect(response.status()).toBe(200)

    const closures = await response.json()
    expect(Array.isArray(closures)).toBe(true)
  })

  test('should get daily ledger for a date', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]
    const response = await request.get(`${BASE_URL}/lms/daily-closures/${today}/ledger`, { headers })
    expect(response.status()).toBe(200)

    const ledger = await response.json()
    expect(ledger).toHaveProperty('date')
    expect(ledger).toHaveProperty('total_payments_in')
    expect(ledger).toHaveProperty('total_expenses_out')
    expect(ledger).toHaveProperty('payments')
    expect(Array.isArray(ledger.payments)).toBe(true)
  })

  test('should reject closing day without auth', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]
    const response = await request.post(`${BASE_URL}/lms/daily-closures/${today}/close`)
    expect(response.status()).toBe(401)
  })

  test('should reject secretary from closing day', async ({ request }) => {
    const secHeaders = await ensureAuthHeader('secretary')
    const today = new Date().toISOString().split('T')[0]
    const response = await request.post(`${BASE_URL}/lms/daily-closures/${today}/close`, { headers: secHeaders })
    expect(response.status()).toBe(403)
  })
})
