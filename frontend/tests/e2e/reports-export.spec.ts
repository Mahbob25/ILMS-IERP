import { test, expect } from '@playwright/test'
import { ensureAuthHeader } from './fixtures/tokens'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('Reports Export/Print Endpoints', () => {
  test('catalog lists all twelve report codes', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(`${BASE_URL}/reports/catalog`, { headers })
    expect(response.status()).toBe(200)

    const body = await response.json()
    const codes = (body.reports as Array<{ code: string }>).map((r) => r.code)
    for (const expected of [
      'pnl_summary',
      'daily_ledger',
      'closures_register',
      'daily_reconciliation',
      'student_register',
      'enrollment_summary',
      'section_occupancy',
      'attendance_summary',
      'teacher_wallets',
      'teacher_payouts',
      'staff_payroll',
      'grade_summary',
    ]) {
      expect(codes).toContain(expected)
    }
  })

  test('manager downloads pnl_summary CSV with headers', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(
      `${BASE_URL}/reports/pnl_summary/export.csv?locale=en&start_date=2026-01-01&end_date=2026-12-31`,
      { headers },
    )
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')

    const text = await response.text()
    expect(text).toContain('Period Summary')
    expect(text).toContain('Daily Breakdown')
  })

  test('secretary is forbidden from pnl_csv', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    const response = await request.get(`${BASE_URL}/reports/pnl_summary/export.csv`, { headers })
    expect(response.status()).toBe(403)
  })

  test('manager is allowed on student_register csv', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(`${BASE_URL}/reports/student_register/export.csv`, { headers })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
  })

  test('unknown report code returns 404', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(`${BASE_URL}/reports/not_a_report/export.csv`, { headers })
    expect(response.status()).toBe(404)
  })

  test('manager print endpoint returns styled HTML', async ({ request }) => {
    const headers = await ensureAuthHeader('manager')
    const response = await request.get(`${BASE_URL}/reports/teacher_wallets/print?locale=ar`, {
      headers,
    })
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('@media print')
  })

  test('secretary is forbidden from teacher_wallets print', async ({ request }) => {
    const headers = await ensureAuthHeader('secretary')
    const response = await request.get(`${BASE_URL}/reports/teacher_wallets/print`, { headers })
    expect(response.status()).toBe(403)
  })
})
