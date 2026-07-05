import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Dashboard Endpoints', () => {
  test('should return teacher dashboard for teacher role', async ({ request }) => {
    const headers = await ensureAuthHeader('teacher')

    const response = await request.get(`${BASE_URL}/dashboard/teacher`, { headers })
    expect(response.status()).toBe(200)

    const dashboard = await response.json()
    expect(dashboard).toHaveProperty('sections')
    expect(dashboard).toHaveProperty('sections_count')
    expect(dashboard).toHaveProperty('wallet_balance')
  })

  test('should return secretary dashboard for secretary role', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')

    const response = await request.get(`${BASE_URL}/dashboard/secretary`, { headers })
    expect(response.status()).toBe(200)

    const dashboard = await response.json()
    expect(dashboard).toHaveProperty('today_payments_total')
    expect(dashboard).toHaveProperty('today_expenses_total')
    expect(dashboard).toHaveProperty('daily_closure_status')
  })

  test('should return manager dashboard for manager role', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')

    const response = await request.get(`${BASE_URL}/dashboard/manager`, { headers })
    expect(response.status()).toBe(200)

    const dashboard = await response.json()
    expect(dashboard).toHaveProperty('total_students')
    expect(dashboard).toHaveProperty('total_teachers')
    expect(dashboard).toHaveProperty('monthly_revenue')
  })

  test('should return superadmin dashboard for superadmin role', async ({ request }) => {
    const headers = authHeader('superadmin')

    const response = await request.get(`${BASE_URL}/dashboard/superadmin`, { headers })
    expect(response.status()).toBe(200)

    const dashboard = await response.json()
    expect(dashboard).toHaveProperty('total_students')
    expect(dashboard).toHaveProperty('total_teachers')
  })

  test('should reject teacher accessing secretary dashboard', async ({ request }) => {
    const headers = await ensureAuthHeader('teacher')
    const response = await request.get(`${BASE_URL}/dashboard/secretary`, { headers })
    expect(response.status()).toBe(403)
  })

  test('should reject secretary accessing manager dashboard', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    const response = await request.get(`${BASE_URL}/dashboard/manager`, { headers })
    expect(response.status()).toBe(403)
  })

  test('should reject manager accessing superadmin dashboard', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(`${BASE_URL}/dashboard/superadmin`, { headers })
    expect(response.status()).toBe(403)
  })

  test('should reject unauthenticated access', async ({ request }) => {
    for (const d of ['teacher', 'secretary', 'manager', 'superadmin']) {
      const response = await request.get(`${BASE_URL}/dashboard/${d}`)
      expect(response.status()).toBe(401)
    }
  })
})
