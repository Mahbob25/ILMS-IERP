import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Input Sanitization', () => {
  const headers = authHeader('superadmin')

  test('should trim trailing spaces from student name on creation', async ({ request }) => {
    const studentCode = `TRIM${Date.now().toString(36).toUpperCase()}`
    const spacedName = '  Student With Spaces  '

    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: spacedName },
    })
    expect(response.status()).toBe(201)

    const student = await response.json()
    expect(student.full_name).toBe(spacedName.trim())
    expect(student.full_name).not.toContain('  ')
  })

  test('should trim trailing spaces from student name on update', async ({ request }) => {
    const studentCode = `TRIMU${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Trim Update ${Date.now()}` },
    })
    expect(createRes.status()).toBe(201)
    const student = await createRes.json()

    const spacedUpdate = '  Updated Name With Padding  '
    const updateRes = await request.put(`${BASE_URL}/academic/students/${student.id}`, {
      headers,
      data: { full_name: spacedUpdate },
    })
    expect(updateRes.status()).toBe(200)

    const updated = await updateRes.json()
    expect(updated.full_name).toBe(spacedUpdate.trim())
  })
})
