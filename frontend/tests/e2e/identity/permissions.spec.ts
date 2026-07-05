import { test, expect } from '@playwright/test'
import { authHeader } from '../fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Permissions Management', () => {
  const headers = authHeader('superadmin')

  test('should list all permissions', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/permissions`, { headers })
    expect(response.status()).toBe(200)

    const permissions = await response.json()
    expect(Array.isArray(permissions)).toBe(true)
    if (permissions.length > 0) {
      expect(permissions[0]).toHaveProperty('id')
      expect(permissions[0]).toHaveProperty('codename')
    }
  })

  test('should list roles', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/users/roles`, { headers })
    expect(response.status()).toBe(200)

    const roles = await response.json()
    expect(roles.length).toBeGreaterThanOrEqual(4)
    const roleNames = roles.map((r: any) => r.name)
    expect(roleNames).toContain('superadmin')
    expect(roleNames).toContain('manager')
    expect(roleNames).toContain('secretary')
    expect(roleNames).toContain('teacher')
  })

  test('should get permissions for a role', async ({ request }) => {
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    if (roles.length === 0) {
      test.skip(true, 'No roles found')
      return
    }

    const response = await request.get(`${BASE_URL}/permissions/roles/${roles[0].id}`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('role_id')
    expect(body).toHaveProperty('permission_codenames')
    expect(Array.isArray(body.permission_codenames)).toBe(true)
  })

  test('should update permissions for a role', async ({ request }) => {
    const rolesRes = await request.get(`${BASE_URL}/users/roles`, { headers })
    const roles = await rolesRes.json()
    const teacherRole = roles.find((r: any) => r.name === 'teacher')
    if (!teacherRole) {
      test.skip(true, 'No teacher role found')
      return
    }

    const currentPermsRes = await request.get(`${BASE_URL}/permissions/roles/${teacherRole.id}`, { headers })
    const currentPerms = await currentPermsRes.json()

    const response = await request.put(`${BASE_URL}/permissions/roles/${teacherRole.id}`, {
      headers,
      data: { permission_codenames: currentPerms.permission_codenames },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.role_id).toBe(teacherRole.id)
  })

  test('should reject updating permissions without auth', async ({ request }) => {
    const response = await request.put(`${BASE_URL}/permissions/roles/00000000-0000-0000-0000-000000000000`, {
      data: { permission_codenames: [] },
    })
    expect(response.status()).toBe(401)
  })
})
