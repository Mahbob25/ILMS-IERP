import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Academic: Course Sections', () => {
  const headers = authHeader('superadmin')

  test('should list course sections', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/course-sections?limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()

    // API returns { items: [...], total: N }
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('should create a course section', async ({ request }) => {
    // Create course first
    const courseCode = `SEC${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Section Course ${Date.now()}`, code: courseCode, credits: 2 },
    })
    expect(courseRes.status()).toBe(201)
    const course = await courseRes.json()

    // Get teacher
    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const response = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: course.id, teacher_id: teachers[0].id, capacity: 30 },
    })
    expect(response.status()).toBe(201)

    const section = await response.json()
    expect(section).toHaveProperty('id')
    expect(section.course_id).toBe(course.id)
    // CourseSectionResponse.status = "pending" by default
    expect(section).toHaveProperty('status')
    expect(section).toHaveProperty('capacity')
  })

  test('should reject creating section without valid course', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = (await teachersRes.json()) || []
    const teacherId = teachers.length > 0 ? teachers[0].id : fakeId

    const response = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: fakeId, teacher_id: teacherId, capacity: 10 },
    })
    expect(response.status()).toBe(404)
  })

  test('should update a course section', async ({ request }) => {
    const courseCode = `SECU${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Section Update ${Date.now()}`, code: courseCode, credits: 2 },
    })
    expect(courseRes.status()).toBe(201)
    const course = await courseRes.json()

    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const createRes = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: course.id, teacher_id: teachers[0].id, capacity: 20 },
    })
    expect(createRes.status()).toBe(201)
    const section = await createRes.json()

    const response = await request.put(`${BASE_URL}/academic/course-sections/${section.id}`, {
      headers,
      data: { capacity: 25 },
    })
    expect(response.status()).toBe(200)
    expect((await response.json()).capacity).toBe(25)
  })

  test('should allow teacher to list their sections', async ({ request }) => {
    const teacherHeaders = await ensureAuthHeader('teacher')
    expect(teacherHeaders.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/academic/course-sections`, { headers: teacherHeaders })
    expect(response.status()).toBe(200)
  })
})
