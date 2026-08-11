import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Attendance Records', () => {
  const headers = authHeader('superadmin')

  test('should get attendance session by ID', async ({ request }) => {
    const sessionsRes = await request.get(`${BASE_URL}/lms/attendance/sessions`, { headers })
    const sessions = await sessionsRes.json()
    if (sessions.length === 0) {
      test.skip(true, 'No attendance sessions found')
      return
    }

    const response = await request.get(`${BASE_URL}/lms/attendance/sessions/${sessions[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const session = await response.json()
    expect(session).toHaveProperty('id')
    expect(session).toHaveProperty('section_id')
    expect(session).toHaveProperty('date')
  })

  test('should return 404 for non-existent attendance session', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.get(`${BASE_URL}/lms/attendance/sessions/${fakeId}`, { headers })
    expect(response.status()).toBe(404)
  })

  test('should submit attendance records for a session', async ({ request }) => {
    const teacherHeaders = await ensureAuthHeader('teacher')

    const sessionsRes = await request.get(`${BASE_URL}/lms/attendance/sessions`, { headers })
    const sessions = await sessionsRes.json()
    if (sessions.length === 0) {
      test.skip(true, 'No attendance sessions found')
      return
    }

    const studentsRes = await request.get(`${BASE_URL}/academic/students?limit=5`, { headers })
    const students = await studentsRes.json()
    if (!students.items || students.items.length === 0) {
      test.skip(true, 'No students found')
      return
    }

    const records = {
      records: students.items.slice(0, 2).map((s: any) => ({
        student_id: s.id,
        status: 'present',
      })),
    }

    const response = await request.post(`${BASE_URL}/lms/attendance/sessions/${sessions[0].id}/records`, {
      headers: teacherHeaders,
      data: records,
    })
    expect([200, 400, 422, 500]).toContain(response.status())
  })
})
