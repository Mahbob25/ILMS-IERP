import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Empty Report Handling', () => {
  const headers = authHeader('superadmin')

  test('revenue report for future date range should return empty or zero data', async ({ request }) => {
    const futureDate = '2099-12-31'
    const response = await request.get(`${BASE_URL}/lms/revenue?date_from=${futureDate}&date_to=${futureDate}`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('total_revenue')
    expect([0, '0', null]).toContain(body.total_revenue)
  })

  test('payments filtered by future date should return empty array', async ({ request }) => {
    const futureDate = '2099-12-31'
    const response = await request.get(`${BASE_URL}/lms/payments?date_from=${futureDate}&date_to=${futureDate}`, { headers })
    expect(response.status()).toBe(200)

    const payments = await response.json()
    expect(Array.isArray(payments)).toBe(true)
    expect(payments.length).toBe(0)
  })

  test('expenses filtered by future date should return empty array', async ({ request }) => {
    const futureDate = '2099-12-31'
    const response = await request.get(`${BASE_URL}/lms/expenses?date_from=${futureDate}&date_to=${futureDate}`, { headers })
    expect(response.status()).toBe(200)

    const expenses = await response.json()
    expect(Array.isArray(expenses)).toBe(true)
    expect(expenses.length).toBe(0)
  })

  test('daily closure for future date should return no data', async ({ request }) => {
    const futureDate = '2099-12-31'
    const response = await request.get(`${BASE_URL}/lms/daily-closures/${futureDate}/ledger`, { headers })
    expect([200, 404]).toContain(response.status())

    if (response.status() === 200) {
      const ledger = await response.json()
      expect(ledger.payments.length).toBe(0)
    }
  })
})
