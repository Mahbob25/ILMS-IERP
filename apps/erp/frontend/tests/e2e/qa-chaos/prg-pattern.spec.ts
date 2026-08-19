import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('POST-REDIRECT-GET Pattern', () => {
  const headers = authHeader('superadmin')

  test('POST then GET same resource should not create duplicates', async ({ request }) => {
    const courseCode = `PRG${Date.now().toString(36).toUpperCase()}`
    const courseName = `PRG Course ${Date.now()}`

    const postRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: courseName, code: courseCode, credits: 3 },
    })
    expect(postRes.status()).toBe(201)

    const course = await postRes.json()
    expect(course).toHaveProperty('id')

    const getRes = await request.get(`${BASE_URL}/academic/courses/${course.id}`, { headers })
    expect(getRes.status()).toBe(200)

    const fetched = await getRes.json()
    expect(fetched.name).toBe(courseName)
    expect(fetched.code).toBe(courseCode)
  })

  test('POST then GET list should show created resource exactly once', async ({ request }) => {
    const uniqueCode = `PRGL${Date.now().toString(36).toUpperCase()}`
    const uniqueName = `PRG List Test ${Date.now()}`

    const createRes = await request.post(`${BASE_URL}/academic/courses`, {
      headers,
      data: { name: uniqueName, code: uniqueCode, credits: 1 },
    })
    expect(createRes.status()).toBe(201)
    const created = await createRes.json()

    const listRes = await request.get(`${BASE_URL}/academic/courses?code=${uniqueCode}`, { headers })
    expect(listRes.status()).toBe(200)

    const listBody = await listRes.json()
    const items = listBody.items || (Array.isArray(listBody) ? listBody : [listBody])
    const matches = items.filter((c: any) => c.id === created.id)
    expect(matches.length).toBe(1)
  })

  test('POST student then GET should not duplicate on re-fetch', async ({ request }) => {
    const studentCode = `PRGS${Date.now().toString(36).toUpperCase()}`
    const studentName = `PRG Student ${Date.now()}`

    const postRes = await request.post(`${BASE_URL}/academic/students`, {
      headers,
      data: { student_code: studentCode, full_name: studentName },
    })
    expect(postRes.status()).toBe(201)
    const student = await postRes.json()

    const getRes1 = await request.get(`${BASE_URL}/academic/students/${student.id}`, { headers })
    const getRes2 = await request.get(`${BASE_URL}/academic/students/${student.id}`, { headers })

    expect(getRes1.status()).toBe(200)
    expect(getRes2.status()).toBe(200)

    const data1 = await getRes1.json()
    const data2 = await getRes2.json()
    expect(data1.id).toBe(data2.id)
  })
})
