import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Academic: Students & Enrollments', () => {
  const headers = authHeader('superadmin')

  test('should list students', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/students?limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()

    // API returns { items: [...], total: N }
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('should create a new student', async ({ request }) => {
    const studentCode = `E2E${Date.now().toString(36).toUpperCase()}`
    const response = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Test Student ${Date.now()}`, email: `${studentCode}@test.com` },
    })
    expect(response.status()).toBe(201)

    const student = await response.json()
    expect(student).toHaveProperty('id')
    expect(student.student_code).toBe(studentCode)
  })

  test('should reject creating student with duplicate code', async ({ request }) => {
    const studentCode = `DUP${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Original ${Date.now()}` },
    })
    expect(createRes.status()).toBe(201)

    const dupRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Duplicate ${Date.now()}` },
    })
    expect(dupRes.status()).toBe(409)
  })

  test('should update a student', async ({ request }) => {
    const studentCode = `UPD${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Update Student ${Date.now()}` },
    })
    expect(createRes.status()).toBe(201)
    const student = await createRes.json()

    const response = await request.put(`${BASE_URL}/academic/students/${student.id}`, {
      headers,
      data: { full_name: 'Updated Student Name' },
    })
    expect(response.status()).toBe(200)
    expect((await response.json()).full_name).toBe('Updated Student Name')
  })

  test('should search students', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/students?search=Student&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('should enroll a student in a section', async ({ request }) => {
    // Create course
    const courseCode = `ENR${Date.now().toString(36).toUpperCase()}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Enroll Course ${Date.now()}`, code: courseCode, credits: 2 },
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

    // Create section
    const sectionRes = await request.post(`${BASE_URL}/academic/course-sections`, {
      headers,
      data: { course_id: course.id, teacher_id: teachers[0].id, capacity: 30 },
    })
    expect(sectionRes.status()).toBe(201)
    const section = await sectionRes.json()

    // Create student
    const studentCode = `ENRS${Date.now().toString(36).toUpperCase()}`
    const studentRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Enroll Student ${Date.now()}` },
    })
    expect(studentRes.status()).toBe(201)
    const student = await studentRes.json()

    // Enroll
    const response = await request.post(`${BASE_URL}/academic/enrollments`, {
      headers,
      data: { student_id: student.id, section_id: section.id },
    })
    expect(response.status()).toBe(201)

    const enrollment = await response.json()
    expect(enrollment).toHaveProperty('id')
    expect(enrollment.student_id).toBe(student.id)
    expect(enrollment.section_id).toBe(section.id)
  })

  test('should list enrollments', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/enrollments?limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()

    // API returns { items: [...], total: N }
    expect(body).toHaveProperty('items')
    expect(body).toHaveProperty('total')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('should reject enrolling in non-existent section', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.post(`${BASE_URL}/academic/enrollments`, {
      headers,
      data: { student_id: fakeId, section_id: fakeId },
    })
    expect([400, 404]).toContain(response.status())
  })
})
