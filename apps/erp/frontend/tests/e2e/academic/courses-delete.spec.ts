import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Academic: Course Delete', () => {
  const headers = authHeader('superadmin')

  test('should delete a course', async ({ request }) => {
    const uniqueCode = `DEL${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Delete Course ${Date.now()}`, code: uniqueCode, credits: 2 },
    })
    expect(createRes.status()).toBe(201)
    const course = await createRes.json()

    const response = await request.delete(`${BASE_URL}/academic/courses/${course.id}`, { headers })
    expect(response.status()).toBe(204)
  })

  test('should return 404 for deleting non-existent course', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.delete(`${BASE_URL}/academic/courses/${fakeId}`, { headers })
    expect(response.status()).toBe(404)
  })

  test('should reject deleting student without superadmin', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.delete(`${BASE_URL}/academic/students/${fakeId}`)
    expect(response.status()).toBe(401)
  })

  test('should get course sections filtered by status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/course-sections?status=pending&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    for (const section of body.items) {
      expect(section.status).toBe('pending')
    }
  })
})
