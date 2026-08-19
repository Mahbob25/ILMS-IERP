import { test, expect } from '@playwright/test'
import { authHeader, ensureAuthHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('User CRUD Operations', () => {
  const headers = authHeader('superadmin')

  test('should create a new user', async ({ request }) => {
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    const teacherRole = roles.find((r: any) => r.name === 'teacher')
    if (!teacherRole) {
      test.skip(true, 'No teacher role found')
      return
    }

    const employeesRes = await request.get(`${BASE_URL}/employees?employee_type=teacher`, { headers })
    const employees = await employeesRes.json()
    if (employees.length === 0) {
      test.skip(true, 'No teacher employees found')
      return
    }

    const uniqueEmail = `e2e-create-${Date.now()}@test.com`
    const response = await request.post(`${BASE_URL}/users`, {
      headers,
      data: {
        email: uniqueEmail,
        password: 'TestPass123!',
        role_id: teacherRole.id,
        employee_id: employees[0].id,
      },
    })
    expect(response.status()).toBe(201)

    const user = await response.json()
    expect(user).toHaveProperty('id')
    expect(user.email).toBe(uniqueEmail)
    expect(user.is_active).toBe(true)
  })

  test('should reject creating user with duplicate email', async ({ request }) => {
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    const teacherRole = roles.find((r: any) => r.name === 'teacher')
    if (!teacherRole) {
      test.skip(true, 'No teacher role found')
      return
    }

    const employeesRes = await request.get(`${BASE_URL}/employees?employee_type=teacher`, { headers })
    const employees = await employeesRes.json()
    if (employees.length === 0) {
      test.skip(true, 'No teacher employees found')
      return
    }

    const email = `e2e-dup-${Date.now()}@test.com`
    const firstRes = await request.post(`${BASE_URL}/users`, {
      headers,
      data: { email, password: 'TestPass123!', role_id: teacherRole.id, employee_id: employees[0].id },
    })
    expect(firstRes.status()).toBe(201)

    const dupRes = await request.post(`${BASE_URL}/users`, {
      headers,
      data: { email, password: 'TestPass123!', role_id: teacherRole.id, employee_id: employees[0].id },
    })
    expect(dupRes.status()).toBe(400)
  })

  test('should reject creating user without employee_id', async ({ request }) => {
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    const teacherRole = roles.find((r: any) => r.name === 'teacher')
    if (!teacherRole) {
      test.skip(true, 'No teacher role found')
      return
    }

    const response = await request.post(`${BASE_URL}/users`, {
      headers,
      data: { email: `e2e-noemp-${Date.now()}@test.com`, password: 'TestPass123!', role_id: teacherRole.id },
    })
    expect(response.status()).toBe(400)
  })

  test('should update a user', async ({ request }) => {
    const usersRes = await request.get(`${BASE_URL}/users`, { headers })
    const users = await usersRes.json()
    if (users.length === 0) {
      test.skip(true, 'No users found')
      return
    }

    const response = await request.put(`${BASE_URL}/users/${users[0].id}`, {
      headers,
      data: { locale_pref: 'en' },
    })
    expect(response.status()).toBe(200)

    const updated = await response.json()
    expect(updated.locale_pref).toBe('en')
  })

  test('should reject manager creating superadmin user', async ({ request }) => {
    const mgrHeaders = await ensureAuthHeader('manager')
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    const superadminRole = roles.find((r: any) => r.name === 'superadmin')
    if (!superadminRole) {
      test.skip(true, 'No superadmin role found')
      return
    }

    const response = await request.post(`${BASE_URL}/users`, {
      headers: mgrHeaders,
      data: {
        email: `e2e-fail-${Date.now()}@test.com`,
        password: 'TestPass123!',
        role_id: superadminRole.id,
        employee_id: '00000000-0000-0000-0000-000000000000',
      },
    })
    expect(response.status()).toBe(403)
  })
})
