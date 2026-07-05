import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Assignments', () => {
  const headers = authHeader('superadmin')

  test('should list assignments', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/lms/assignments`, { headers })
    expect(response.status()).toBe(200)

    const assignments = await response.json()
    expect(Array.isArray(assignments)).toBe(true)
  })

  test('should create an assignment', async ({ request }) => {
    // Create course + section first
    const courseCode = `ASG${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Assignment Course ${Date.now()}`, code: courseCode, credits: 2, min_students_required: 1 },
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

    // Create assignment
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const response = await request.post(`${BASE_URL}/lms/assignments`, {
      headers,
      data: {
        section_id: section.id,
        title: `E2E Assignment ${Date.now()}`,
        description: 'Created during E2E testing',
        due_date: dueDate,
        max_score: 100,
      },
    })
    expect(response.status()).toBe(201)

    const assignment = await response.json()
    expect(assignment).toHaveProperty('id')
    expect(assignment.section_id).toBe(section.id)
    expect(assignment.title).toContain('E2E Assignment')
    expect(assignment.max_score).toBe(100)
  })

  test('should update an assignment', async ({ request }) => {
    // Create course + section + assignment
    const courseCode = `ASGU${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Assignment Update ${Date.now()}`, code: courseCode, credits: 2, min_students_required: 1 },
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

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const createRes = await request.post(`${BASE_URL}/lms/assignments`, {
      headers,
      data: { section_id: section.id, title: 'Update Target', description: 'To be updated', due_date: dueDate, max_score: 100 },
    })
    expect(createRes.status()).toBe(201)
    const assignment = await createRes.json()

    // Update
    const response = await request.put(`${BASE_URL}/lms/assignments/${assignment.id}`, {
      headers,
      data: { title: 'Updated Assignment Title', max_score: 50 },
    })
    expect(response.status()).toBe(200)

    const updated = await response.json()
    expect(updated.title).toBe('Updated Assignment Title')
    expect(updated.max_score).toBe(50)
  })

  test('should reject creating assignment for non-existent section', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.post(`${BASE_URL}/lms/assignments`, {
      headers,
      data: { section_id: fakeId, title: 'Bad', description: 'Fail', due_date: '2026-12-31', max_score: 100 },
    })
    expect(response.status()).toBe(404)
  })
})
