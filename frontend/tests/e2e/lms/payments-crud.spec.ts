import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Payment Operations', () => {
  const headers = authHeader('superadmin')

  test('should get payment by ID', async ({ request }) => {
    const paymentsRes = await request.get(`${BASE_URL}/lms/payments`, { headers })
    const payments = await paymentsRes.json()
    if (payments.length === 0) {
      test.skip(true, 'No payments found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/payments/${payments[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const payment = await response.json()
    expect(payment).toHaveProperty('id')
    expect(payment).toHaveProperty('amount')
    expect(payment).toHaveProperty('receipt_number')
    expect(payment).toHaveProperty('payment_method')
    expect(['cash', 'online']).toContain(payment.payment_method)
    if (payment.payment_method === 'online') {
      expect(payment).toHaveProperty('transaction_number')
    }
  })

  test('should return 404 for non-existent payment', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.get(`${BASE_URL}/lms/payments/${fakeId}`, { headers })
    expect(response.status()).toBe(404)
  })

  test('should filter payments by enrollment', async ({ request }) => {
    const enrollmentsRes = await request.get(`${BASE_URL}/academic/enrollments?limit=1`, { headers })
    const enrollments = await enrollmentsRes.json()
    if (!enrollments.items || enrollments.items.length === 0) {
      test.skip(true, 'No enrollments found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/payments?enrollment_id=${enrollments.items[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const payments = await response.json()
    expect(Array.isArray(payments)).toBe(true)
  })

  test('should get expense by ID', async ({ request }) => {
    const expensesRes = await request.get(`${BASE_URL}/lms/expenses`, { headers })
    const expenses = await expensesRes.json()
    if (expenses.length === 0) {
      test.skip(true, 'No expenses found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/expenses/${expenses[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const expense = await response.json()
    expect(expense).toHaveProperty('id')
    expect(expense).toHaveProperty('amount')
  })

  test('should get teacher withdrawals', async ({ request }) => {
    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/teacher-wallets/${teachers[0].id}/withdrawals`, { headers })
    // 403 if teacher accessing other's withdrawals, 200 for superadmin
    expect([200, 404]).toContain(response.status())

    if (response.status() === 200) {
      const withdrawals = await response.json()
      expect(Array.isArray(withdrawals)).toBe(true)
    }
  })
})
