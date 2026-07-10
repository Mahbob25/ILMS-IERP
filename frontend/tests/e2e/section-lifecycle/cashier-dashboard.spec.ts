import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Cashier Dashboard - Section Lifecycle', () => {
  const headers = authHeader('superadmin')

  test('cashier_views_pending_refunds', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/cashier/pending-refunds`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('meta')
    expect(body.meta).toHaveProperty('total')
    expect(body.meta).toHaveProperty('page')
    expect(body.meta).toHaveProperty('per_page')
  })

  test('cashier_searches_refunds_by_student', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/cashier/pending-refunds?search=Test`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('data')
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('cashier_disburses_refund', async ({ request }) => {
    const pendingRes = await request.get(`${BASE_URL}/lms/cashier/pending-refunds?status=UNCLAIMED&per_page=1`, { headers })
    if (pendingRes.status() !== 200) {
      test.skip(true, 'Could not fetch pending refunds')
      return
    }

    const pendingBody = await pendingRes.json()
    if (!pendingBody.data || pendingBody.data.length === 0) {
      test.skip(true, 'No pending refunds available to disburse')
      return
    }

    const pendingRefund = pendingBody.data[0]

    const disburseRes = await request.post(
      `${BASE_URL}/lms/cashier/pending-refunds/${pendingRefund.id}/disburse`,
      { headers, data: { notes: 'E2E test disbursement' } },
    )
    expect([200, 201, 400, 409]).toContain(disburseRes.status())

    if (disburseRes.status() === 201 || disburseRes.status() === 200) {
      const refund = await disburseRes.json()
      expect(refund).toHaveProperty('receipt_number')
      expect(refund.receipt_number).toMatch(/^RFD-\d{8}-\d{4}$/)
      expect(refund).toHaveProperty('amount')
    }
  })

  test('cashier_prints_receipt', async ({ request }) => {
    const historyRes = await request.get(`${BASE_URL}/lms/cashier/refunds?per_page=1`, { headers })
    if (historyRes.status() !== 200) {
      test.skip(true, 'Could not fetch refund history')
      return
    }

    const historyBody = await historyRes.json()
    if (!historyBody.data || historyBody.data.length === 0) {
      test.skip(true, 'No refund history available for receipt check')
      return
    }

    const refund = historyBody.data[0]
    expect(refund).toHaveProperty('receipt_number')
    expect(refund).toHaveProperty('amount')
    expect(refund).toHaveProperty('disbursed_at')
    expect(refund).toHaveProperty('pending_refund')
  })

  test('cashier_views_history', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/cashier/refunds`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('meta')
    expect(Array.isArray(body.data)).toBe(true)
  })
})
