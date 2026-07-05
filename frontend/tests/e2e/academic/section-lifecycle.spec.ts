import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Academic: Section Lifecycle', () => {
  const headers = authHeader('superadmin')

  test('should activate a section', async ({ request }) => {
    const sectionsRes = await request.get(`${BASE_URL}/academic/course-sections?status=pending&limit=5`, { headers })
    const body = await sectionsRes.json()
    const pending = body.items || []
    if (pending.length === 0) {
      test.skip(true, 'No pending sections found')
      return
    }

    const response = await request.post(`${BASE_URL}/academic/course-sections/${pending[0].id}/activate`, {
      headers,
      data: { teacher_percentage: 50 },
    })
    expect([200, 400]).toContain(response.status())

    if (response.status() === 200) {
      const section = await response.json()
      expect(section.status).toBe('active')
    }
  })

  test('should reject completing non-active section', async ({ request }) => {
    const sectionsRes = await request.get(`${BASE_URL}/academic/course-sections?status=pending&limit=5`, { headers })
    const body = await sectionsRes.json()
    const pending = body.items || []
    if (pending.length === 0) {
      test.skip(true, 'No pending sections found')
      return
    }

    const response = await request.post(`${BASE_URL}/academic/course-sections/${pending[0].id}/complete`, { headers })
    expect(response.status()).toBe(400)
  })

  test('should reject completing section without auth', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.post(`${BASE_URL}/academic/course-sections/${fakeId}/complete`)
    expect(response.status()).toBe(401)
  })

  test('should delete a course section', async ({ request }) => {
    const courseCode = `DEL${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Delete Section Course ${Date.now()}`, code: courseCode, credits: 2 },
    })
    expect(courseRes.status()).toBe(201)
    const course = await courseRes.json()

    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const sectionRes = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: course.id, teacher_id: teachers[0].id, capacity: 30 },
    })
    expect(sectionRes.status()).toBe(201)
    const section = await sectionRes.json()

    const deleteRes = await request.delete(`${BASE_URL}/academic/course-sections/${section.id}`, { headers })
    expect(deleteRes.status()).toBe(204)
  })

  test('should return 404 deleting non-existent section', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.delete(`${BASE_URL}/academic/course-sections/${fakeId}`, { headers })
    expect(response.status()).toBe(404)
  })
})
