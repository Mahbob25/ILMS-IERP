import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('LMS: Final Grades', () => {
  const headers = authHeader('superadmin')

  test('should set final grades for a section', async ({ request }) => {
    const teacherHeaders = await ensureAuthHeader('teacher')

    const sectionsRes = await request.get(`${BASE_URL}/academic/course-sections?status=active&limit=5`, { headers })
    const body = await sectionsRes.json()
    const sections = body.items || []
    if (sections.length === 0) {
      test.skip(true, 'No active sections found')
      return
    }
    const sectionId = sections[0].id

    const enrollRes = await request.get(`${BASE_URL}/academic/enrollments?section_id=${sectionId}&limit=5`, { headers })
    const enrollBody = await enrollRes.json()
    const enrollments = enrollBody.items || []
    if (enrollments.length === 0) {
      test.skip(true, 'No enrollments found for section')
      return
    }

    const grades = enrollments.map((e: any) => ({
      student_id: e.student_id,
      final_score: Math.round(Math.random() * 40 + 60),
    }))

    const response = await request.put(`${BASE_URL}/academic/sections/${sectionId}/final-grades`, {
      headers: teacherHeaders,
      data: { grades },
    })
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(grades.length)
  })

  test('should reject final grade > 100', async ({ request }) => {
    const teacherHeaders = await ensureAuthHeader('teacher')

    const sectionsRes = await request.get(`${BASE_URL}/academic/course-sections?status=active&limit=5`, { headers })
    const body = await sectionsRes.json()
    const sections = body.items || []
    if (sections.length === 0) {
      test.skip(true, 'No active sections found')
      return
    }

    const response = await request.put(`${BASE_URL}/academic/sections/${sections[0].id}/final-grades`, {
      headers: teacherHeaders,
      data: {
        grades: [{ student_id: '00000000-0000-0000-0000-000000000000', final_score: 150 }],
      },
    })
    expect(response.status()).toBe(422)
  })

  test('should list final grades for a section', async ({ request }) => {
    const sectionsRes = await request.get(`${BASE_URL}/academic/course-sections?status=active&limit=5`, { headers })
    const body = await sectionsRes.json()
    const sections = body.items || []
    if (sections.length === 0) {
      test.skip(true, 'No active sections found')
      return
    }

    const response = await request.get(`${BASE_URL}/academic/sections/${sections[0].id}/final-grades`, { headers })
    expect(response.status()).toBe(200)
    const grades = await response.json()
    expect(Array.isArray(grades)).toBe(true)
  })

  test('should reject listing final grades without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/sections/00000000-0000-0000-0000-000000000000/final-grades`)
    expect(response.status()).toBe(401)
  })

  test('should reject setting final grades without auth', async ({ request }) => {
    const response = await request.put(`${BASE_URL}/academic/sections/00000000-0000-0000-0000-000000000000/final-grades`, {
      data: { grades: [{ student_id: '00000000-0000-0000-0000-000000000000', final_score: 85 }] },
    })
    expect(response.status()).toBe(401)
  })
})
