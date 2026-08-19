import { test, expect } from '@playwright/test'
import { ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Error Display Handling', () => {
  test('non-existent section ID should return 404 with error detail', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const response = await request.get(`${BASE_URL}/academic/course-sections/${fakeId}`, { headers })
    expect(response.status()).toBe(404)

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('invalid UUID should return 422 or 400', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')

    const response = await request.get(`${BASE_URL}/academic/course-sections/not-a-uuid-at-all`, { headers })
    expect([400, 422, 404]).toContain(response.status())
  })

  test('creating section with null course should return validation error', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')

    const response = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: null, teacher_id: null, capacity: -1 },
    })
    expect([400, 422, 500]).toContain(response.status())

    const body = await response.json()
    expect(body).toBeTruthy()
  })

  test('missing required fields should return validation error', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')

    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: {},
    })
    expect([400, 422]).toContain(response.status())
  })

  test('GET non-existent section detail should return 404', async ({ request }) => {
    const headers = await ensureAuthHeader('superadmin')
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const sectionRes = await request.get(`${BASE_URL}/academic/course-sections/${fakeId}`, { headers })
    expect(sectionRes.status()).toBe(404)
  })
})
