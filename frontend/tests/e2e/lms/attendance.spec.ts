import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Attendance', () => {
  const headers = authHeader('superadmin')

  test('should list attendance sessions', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/attendance/sessions`, { headers })
    expect(response.status()).toBe(200)

    const sessions = await response.json()
    expect(Array.isArray(sessions)).toBe(true)
  })

  test('should create attendance session', async ({ request }) => {
    // Create course + section first
    const courseCode = `ATT${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Attendance Course ${Date.now()}`, code: courseCode, credits: 1, min_students_required: 1 },
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

    // Activate section
    const activateRes = await request.post(`${BASE_URL}/academic/course-sections/${section.id}/activate`, { headers })
    expect(activateRes.status()).toBe(200)

    // Create session
    const today = new Date().toISOString().split('T')[0]
    const response = await request.post(`${BASE_URL}/lms/attendance/sessions`, {
      headers,
      data: { section_id: section.id, date: today },
    })
    expect(response.status()).toBe(201)

    const session = await response.json()
    expect(session).toHaveProperty('id')
    expect(session.section_id).toBe(section.id)
    expect(session.date).toBe(today)
  })

  test('should reject creating session for non-existent section', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.post(`${BASE_URL}/lms/attendance/sessions`, {
      headers,
      data: { section_id: fakeId, date: '2026-07-05' },
    })
    expect(response.status()).toBe(404)
  })
})
