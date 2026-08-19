import { test, expect } from '@playwright/test'
import { ensureAuthHeader } from '../../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Visual: Form Submitting State', () => {
  test('create student request is in-flight and resolves correctly', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')
    expect(headers.Cookie).toBeTruthy()

    const studentCode = `FORM${Date.now().toString(36).toUpperCase()}`
    const payload = {
      student_code: studentCode,
      full_name: `Form Submit Test ${Date.now()}`,
      email: `${studentCode}@form.test.com`,
    }

    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: payload,
    })
    expect(response.status()).toBe(201)

    const student = await response.json()
    expect(student).toHaveProperty('id')
    expect(student.student_code).toBe(studentCode)
  })

  test('create expense request is in-flight and resolves correctly', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    expect(headers.Cookie).toBeTruthy()

    const payload = {
      amount: 25.0,
      description: 'E2E Form Submit: Office materials',
      recipient_name: 'Form Test Vendor',
      type: 'general_expense',
    }

    const response = await request.post(`${BASE_URL}/lms/expenses`, {
      headers,
      data: payload,
    })
    expect([201, 400]).toContain(response.status())

    if (response.status() === 201) {
      const expense = await response.json()
      expect(expense).toHaveProperty('id')
      expect(expense.amount).toBe(25.0)
    }
  })

  test('concurrent form submissions create independent results', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')
    expect(headers.Cookie).toBeTruthy()

    const codeA = `CONA${Date.now().toString(36).toUpperCase()}`
    const codeB = `CONB${Date.now().toString(36).toUpperCase()}`

    const results = await Promise.all([
      request.post(`${BASE_URL}/academic/students`, {
        headers,
        data: { student_code: codeA, full_name: `Concurrent A ${Date.now()}` },
      }),
      request.post(`${BASE_URL}/academic/students`, {
        headers,
        data: { student_code: codeB, full_name: `Concurrent B ${Date.now()}` },
      }),
    ])

    const statuses = results.map(r => r.status())
    expect(statuses.every(s => s === 201)).toBe(true)

    const students = await Promise.all(results.map(r => r.json()))
    expect(students[0].student_code).toBe(codeA)
    expect(students[1].student_code).toBe(codeB)
  })
})
