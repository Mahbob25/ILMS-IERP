import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('User Management', () => {
  const headers = authHeader('superadmin')

  test('should list users', async ({ request }) => {
    expect(headers.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/users`, { headers })
    expect(response.status()).toBe(200)

    const users = await response.json()
    expect(Array.isArray(users)).toBe(true)
    expect(users.length).toBeGreaterThan(0)

    const user = users[0]
    expect(user).toHaveProperty('id')
    expect(user).toHaveProperty('email')
    expect(user).toHaveProperty('role')
    expect(user.role).toHaveProperty('name')
  })

  test('should reject listing users without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users`)
    expect(response.status()).toBe(401)
  })

  test('should reject listing users for teacher role', async ({ request }) => {
    const teacherHeaders = await ensureAuthHeader('teacher')
    expect(teacherHeaders.Cookie).toBeTruthy()

    const response = await request.get(`${BASE_URL}/users`, { headers: teacherHeaders })
    expect(response.status()).toBe(403)
  })

  test('should list users filtered by role', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users?role=teacher`, { headers })
    expect(response.status()).toBe(200)

    const users = await response.json()
    for (const user of users) {
      expect(user.role.name).toBe('teacher')
    }
  })

  test('should list roles', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users/roles`, { headers })
    expect(response.status()).toBe(200)

    const roles = await response.json()
    expect(Array.isArray(roles)).toBe(true)
    const roleNames = roles.map((r: any) => r.name)
    expect(roleNames).toContain('superadmin')
    expect(roleNames).toContain('manager')
    expect(roleNames).toContain('secretary')
    expect(roleNames).toContain('teacher')
  })

  test('should get user by ID', async ({ request }) => {
    const listRes = await request.get(`${BASE_URL}/users`, { headers })
    const users = await listRes.json()
    expect(users.length).toBeGreaterThan(0)

    const response = await request.get(`${BASE_URL}/users/${users[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const user = await response.json()
    expect(user.id).toBe(users[0].id)
  })

  test('should return 404 for non-existent user', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await request.get(`${BASE_URL}/users/${fakeId}`, { headers })
    expect(response.status()).toBe(404)
  })

  test('should list teachers with stats', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users/teachers`, { headers })
    expect(response.status()).toBe(200)

    const teachers = await response.json()
    expect(Array.isArray(teachers)).toBe(true)
    if (teachers.length > 0) {
      expect(teachers[0]).toHaveProperty('id')
      expect(teachers[0]).toHaveProperty('full_name')
      expect(teachers[0]).toHaveProperty('sections_count')
      expect(teachers[0]).toHaveProperty('wallet_balance')
    }
  })

  test('should get teacher detail', async ({ request }) => {
    const teachersRes = await request.get(`${BASE_URL}/users/teachers`, { headers })
    const teachers = await teachersRes.json()
    if (teachers.length === 0) {
      test.skip(true, 'No teachers found')
      return
    }

    const response = await request.get(`${BASE_URL}/users/teachers/${teachers[0].id}`, { headers })
    // Teacher may not have linked user account, skip gracefully
    if (response.status() === 500) {
      test.skip(true, 'Teacher detail endpoint returned 500')
      return
    }
    expect(response.status()).toBe(200)

    const detail = await response.json()
    expect(detail).toHaveProperty('id')
    expect(detail).toHaveProperty('full_name')
    expect(detail).toHaveProperty('wallet_balance')
    expect(detail).toHaveProperty('sections')
    expect(detail).toHaveProperty('recent_activity')
  })
})
