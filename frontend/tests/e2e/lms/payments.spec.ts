import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Payments & Expenses', () => {
  const headers = authHeader('superadmin')

  test('should list payments', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/payments`, { headers })
    expect(response.status()).toBe(200)

    const payments = await response.json()
    expect(Array.isArray(payments)).toBe(true)
  })

  test('should list expenses', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/expenses`, { headers })
    expect(response.status()).toBe(200)

    const expenses = await response.json()
    expect(Array.isArray(expenses)).toBe(true)
  })

  test('should create a general expense', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/lms/expenses`, {
      headers,
      data: { amount: 150.0, description: 'E2E: Office supplies', recipient_name: 'Test Vendor', type: 'general_expense' },
    })
    expect(response.status()).toBe(201)

    const expense = await response.json()
    expect(expense).toHaveProperty('id')
    expect(expense.amount).toBe(150.0)
    expect(expense.type).toBe('general_expense')
  })

  test('should create a secretary advance', async ({ request }) => {
    const secHeaders = await ensureAuthHeader('secretary')
    // Get secretary employee to use as recipient
    const employeesRes = await request.get(`${BASE_URL}/employees?employee_type=secretary`, { headers: authHeader('superadmin') })
    const employees = await employeesRes.json()
    if (employees.length === 0) {
      test.skip(true, 'No secretary employees found')
      return
    }

    const response = await request.post(`${BASE_URL}/lms/expenses`, {
      headers: secHeaders,
      data: {
        amount: 50.0,
        description: 'E2E: Petty cash',
        recipient_name: employees[0].full_name,
        recipient_id: employees[0].id,
        type: 'secretary_advance',
      },
    })
    // May fail if secretary has insufficient remaining stipend
    expect([201, 400]).toContain(response.status())

    if (response.status() === 201) {
      const expense = await response.json()
      expect(expense).toHaveProperty('id')
      expect(expense.amount).toBe(50.0)
    }
  })

  test('should filter expenses by type', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/expenses?type=general_expense`, { headers })
    expect(response.status()).toBe(200)

    const expenses = await response.json()
    for (const expense of expenses) {
      expect(expense.type).toBe('general_expense')
    }
  })

  test('should filter expenses by date range', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]
    const response = await request.get(`${BASE_URL}/lms/expenses?date_from=${today}&date_to=${today}`, { headers })
    expect(response.status()).toBe(200)

    const expenses = await response.json()
    expect(Array.isArray(expenses)).toBe(true)
  })

  test('should get eligible recipients', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/expenses/eligible-recipients?type=teacher_withdrawal`, { headers })
    expect(response.status()).toBe(200)

    const recipients = await response.json()
    expect(Array.isArray(recipients)).toBe(true)
  })

  test('should get teacher wallet', async ({ request }) => {
    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/teacher-wallets/${teachers[0].id}`, { headers })
    // Wallet may not exist if no sections activated for this teacher
    expect([200, 404]).toContain(response.status())

    if (response.status() === 200) {
      const wallet = await response.json()
      expect(wallet).toHaveProperty('balance')
      expect(wallet).toHaveProperty('employee_id')
    }
  })

  test('should get revenue overview', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/revenue`, { headers })
    expect(response.status()).toBe(200)

    const revenue = await response.json()
    expect(revenue).toHaveProperty('total_revenue')
    expect(revenue).toHaveProperty('total_expenses')
    expect(revenue).toHaveProperty('net_revenue')
  })

  test('should get daily closures list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/daily-closures`, { headers })
    expect(response.status()).toBe(200)

    const closures = await response.json()
    expect(Array.isArray(closures)).toBe(true)
  })

  test('should reject expense creation without auth', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/lms/expenses`, {
      data: { amount: 10.0, recipient_name: 'Test', type: 'general_expense' },
    })
    expect(response.status()).toBe(401)
  })

  test('should reject payment creation without auth', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/lms/payments`, {
      data: { enrollment_id: '00000000-0000-0000-0000-000000000000', amount: 100.0 },
    })
    expect(response.status()).toBe(401)
  })
})
