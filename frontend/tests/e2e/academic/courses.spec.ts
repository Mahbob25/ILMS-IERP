import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Academic: Courses', () => {
  const headers = authHeader('superadmin')

  test('should list courses with pagination', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/courses?limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()

    // API returns { items: [...], total: N }
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('should search courses by name', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/courses?search=Math&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    for (const course of body.items) {
      expect(course.name.toLowerCase()).toContain('math')
    }
  })

  test('should sort courses descending by name', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/courses?sort_by=name&sort_order=desc&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    if (body.items.length > 1) {
      for (let i = 1; i < body.items.length; i++) {
        expect(body.items[i - 1].name.localeCompare(body.items[i].name)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('should create a new course', async ({ request }) => {
    const uniqueCode = `E2E${Date.now().toString(36).toUpperCase()}`
    const response = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `E2E Course ${Date.now()}`, code: uniqueCode, credits: 3 },
    })
    expect(response.status()).toBe(201)

    const course = await response.json()
    expect(course).toHaveProperty('id')
    // Course may use snake_case: course_code vs code
    expect(course.code || course.course_code).toBe(uniqueCode)
  })

  test('should create course with default values', async ({ request }) => {
    const uniqueCode = `E2ED${Date.now().toString(36).toUpperCase()}`
    const response = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Default Course ${Date.now()}`, code: uniqueCode },
    })
    expect(response.status()).toBe(201)

    const course = await response.json()
    expect(course).toHaveProperty('id')
    expect(course.code || course.course_code).toBe(uniqueCode)
  })

  test('should reject duplicate course code', async ({ request }) => {
    const uniqueCode = `DUP${Date.now().toString(36).toUpperCase()}`
    // Create first
    const createRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Original ${Date.now()}`, code: uniqueCode, credits: 2 },
    })
    expect(createRes.status()).toBe(201)

    // Try duplicate
    const dupRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Duplicate ${Date.now()}`, code: uniqueCode, credits: 2 },
    })
    expect(dupRes.status()).toBe(409)
  })

  test('should update a course', async ({ request }) => {
    const uniqueCode = `UPD${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Update Test ${Date.now()}`, code: uniqueCode, credits: 2 },
    })
    expect(createRes.status()).toBe(201)
    const course = await createRes.json()

    const response = await request.put(`${BASE_URL}/academic/courses/${course.id}`, {
      headers,
      data: { credits: 5, name: 'Updated Course Name' },
    })
    expect(response.status()).toBe(200)

    const updated = await response.json()
    expect(updated.credits).toBe(5)
    expect(updated.name).toBe('Updated Course Name')
  })

  test('should reject creating course without name', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { code: 'BAD', credits: 3 },
    })
    expect([400, 422]).toContain(response.status())
  })

  test('should return 404 for non-existent course', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.put(`${BASE_URL}/academic/courses/${fakeId}`, {
      headers,
      data: { name: 'Fake' },
    })
    expect(response.status()).toBe(404)
  })
})
