import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Search Wildcard Handling', () => {
  const headers = authHeader('superadmin')

  test('search with % character should return literal match', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/students?search=%25&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('search with _ character should return literal match', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/students?search=_&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('search sections with % should return literal match', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/course-sections?search=%25&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('search sections with _ should return literal match', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/course-sections?search=_&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  test('combined SQL-like wildcards should not crash search', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/academic/students?search=%25_%25&limit=5`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('items')
  })
})
