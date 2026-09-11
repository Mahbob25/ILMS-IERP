import { describe, test, expect } from 'vitest'

import { hasPageAccess, PAGE_PERMISSION_MAP } from '@/lib/permissions'

const teacher = { role: { name: 'teacher' }, is_superadmin: false }
const manager = { role: { name: 'manager' }, is_superadmin: false }
const superadmin = { role: { name: 'superadmin' }, is_superadmin: true }

describe('hasPageAccess', () => {
  test('superadmin always has access', () => {
    expect(hasPageAccess(superadmin, [], true, 'page_backups')).toBe(true)
    expect(hasPageAccess(superadmin, [], false, 'page_nonexistent')).toBe(true)
  })

  test('grants access when the loaded permissions include the codename', () => {
    expect(hasPageAccess(teacher, ['page_certificates'], true, 'page_certificates')).toBe(true)
  })

  // The original bug: the role-name fallback short-circuited before the loaded
  // permissions were consulted, so revoking a permission had no effect.
  test('denies access when the codename was revoked, despite the role fallback', () => {
    expect(PAGE_PERMISSION_MAP.page_certificates).toContain('teacher')
    expect(hasPageAccess(teacher, ['page_dashboard'], true, 'page_certificates')).toBe(false)
  })

  test('an empty loaded permission list denies everything but superadmin', () => {
    expect(hasPageAccess(manager, [], true, 'page_certificates')).toBe(false)
    expect(hasPageAccess(manager, [], true, 'page_students')).toBe(false)
  })

  test('falls back to role names only before permissions have loaded', () => {
    expect(hasPageAccess(teacher, [], false, 'page_certificates')).toBe(true)
    expect(hasPageAccess(manager, [], false, 'page_certificates')).toBe(true)
    expect(hasPageAccess(teacher, [], false, 'page_students')).toBe(false)
  })

  test('a null user falls back to no access', () => {
    expect(hasPageAccess(null, [], false, 'page_certificates')).toBe(false)
    expect(hasPageAccess(undefined, [], true, 'page_certificates')).toBe(false)
  })
})
