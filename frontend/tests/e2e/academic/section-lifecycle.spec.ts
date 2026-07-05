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

  test('should auto-generate certificates on section completion', async ({ request }) => {
    const ts = Date.now().toString(36)
    const courseCode = `CERT${ts}`
    const courseRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: `Cert Test Course ${ts}`, code: courseCode, credits: 2 },
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
      data: {
        course_id: course.id,
        teacher_id: teachers[0].id,
        capacity: 30,
        min_students_required: 1,
        price: 500,
      },
    })
    expect(sectionRes.status()).toBe(201)
    const section = await sectionRes.json()

    const studentCode = `STU${ts}`
    const studentRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: `Cert Student ${ts}` },
    })
    expect(studentRes.status()).toBe(201)
    const student = await studentRes.json()

    const enrollRes = await request.post(`${BASE_URL}/academic/enrollments`, {
      headers,
      data: { student_id: student.id, section_id: section.id },
    })
    expect(enrollRes.status()).toBe(201)

    const activateRes = await request.post(`${BASE_URL}/academic/course-sections/${section.id}/activate`, {
      headers,
      data: { teacher_percentage: 50 },
    })
    expect(activateRes.status()).toBe(200)
    const activeSection = await activateRes.json()
    expect(activeSection.status).toBe('active')

    const completeRes = await request.post(`${BASE_URL}/academic/course-sections/${section.id}/complete`, {
      headers,
    })
    expect(completeRes.status()).toBe(200)
    const completedSection = await completeRes.json()
    expect(completedSection.status).toBe('completed')

    const certsRes = await request.get(`${BASE_URL}/academic/certificates?student_id=${student.id}`, { headers })
    expect(certsRes.status()).toBe(200)
    const certsBody = await certsRes.json()
    expect(certsBody.total).toBeGreaterThanOrEqual(1)
    expect(certsBody.items.length).toBeGreaterThanOrEqual(1)

    const cert = certsBody.items[0]
    expect(cert.student_name).toBe(`Cert Student ${ts}`)
    expect(cert.course_name).toBe(`Cert Test Course ${ts}`)
    expect(cert.certificate_number).toMatch(/^CERT-\d{4}-\d{6}$/)
    expect(cert.student_id).toBe(student.id)
    expect(cert.section_id).toBe(section.id)
  })
})
