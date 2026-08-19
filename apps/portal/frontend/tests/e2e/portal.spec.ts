import { test, expect, type Page } from '@playwright/test'

// Portal E2E — status page → SSO ticket exchange → dashboard → grades → attendance → fees → settings.
//
// Runs against the portal frontend (:3001) with the BFF API mocked at the
// network layer (route interception) so it needs no live backend/database.
// When PORTAL_API_URL is set (full-stack run), interception is skipped and
// the real BFF answers.

const API = process.env.PORTAL_API_URL || '/api'

// ── Mocks (in-memory SSO store, auth cookies, linked student data) ────────

const SSO_TICKET = 'sso-ticket-123'
let accessTokenIssued = false

const mePayload = {
  actor_id: '11111111-1111-1111-1111-111111111111',
  linked_students: [
    {
      student_id: '22222222-2222-2222-2222-222222222222',
      full_name: 'Student One',
      student_code: 'STU001',
    },
  ],
}

const gradesPayload = [
  {
    section_id: '33333333-3333-3333-3333-333333333333',
    course_name: 'Mathematics',
    final_score: 92.5,
    graded_at: '2026-07-01T00:00:00+00:00',
  },
  {
    section_id: '44444444-4444-4444-4444-444444444444',
    course_name: 'Physics',
    final_score: 87,
    graded_at: '2026-07-02T00:00:00+00:00',
  },
]

const attendancePayload = [
  { date: '2026-07-01', status: 'present', course_name: 'Mathematics' },
  { date: '2026-07-02', status: 'late', course_name: 'Physics' },
]

const paymentsPayload = [
  {
    id: '55555555-5555-5555-5555-555555555555',
    amount: 12000,
    date: '2026-06-15',
    receipt_number: 'RCP-2026-0001',
    payment_method: 'bank_transfer',
    course_name: 'Mathematics',
  },
]

async function mockPortalApi(page: Page) {
  if (process.env.PORTAL_API_URL) return // real backend — no interception

  // Playwright route globs match against the FULL URL, so '/api/**' would not
  // match 'http://localhost:3001/api/...'. Use '**/api/**'.
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

    // Auth — SSO ticket exchange
    if (path.endsWith('/auth/sso') && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}')
      if (body.ticket === SSO_TICKET) {
        accessTokenIssued = true
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'u1', full_name: 'Parent One', locale_pref: 'ar' }),
          headers: {
            // Playwright route.fulfill only applies the FIRST set-cookie header
            // from an array — so set just the access token here; the login
            // helper adds the refresh cookie via context.addCookies.
            'set-cookie': 'portal_access_token=test-access; Path=/; HttpOnly; SameSite=Lax',
          },
        })
      }
      return route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Invalid ticket' }) })
    }
    if (path.endsWith('/auth/me') && req.method() === 'GET') {
      if (!accessTokenIssued) {
        return route.fulfill({ status: 401, body: JSON.stringify({ detail: 'No auth' }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', full_name: 'Parent One', locale_pref: 'ar', phone: '+966500000000', is_active: true }),
      })
    }

    // Read endpoints
    if (path.endsWith('/me') && req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mePayload),
        headers: { 'x-cache': 'HIT', 'x-data-as-of': new Date().toISOString() },
      })
    }
    if (path.endsWith('/me/grades')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gradesPayload),
        headers: { 'x-cache': 'HIT', 'x-data-as-of': new Date().toISOString() },
      })
    }
    if (path.endsWith('/me/attendance')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(attendancePayload),
        headers: { 'x-cache': 'HIT', 'x-data-as-of': new Date().toISOString() },
      })
    }
    if (path.endsWith('/me/payments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paymentsPayload),
        headers: { 'x-cache': 'HIT', 'x-data-as-of': new Date().toISOString() },
      })
    }
    if (path.endsWith('/me/profile') && req.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: true }) })
    }

    return route.fulfill({ status: 404, body: JSON.stringify({ detail: `No mock for ${path}` }) })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function ssoLogin(page: Page) {
  // Simulate the unified ERP login handoff: land on the SSO exchange page
  // with a ticket, then let the refresh cookie pass the middleware.
  await page.goto(`/ar/login?ticket=${SSO_TICKET}`)
  await page.context().addCookies([
    {
      name: 'portal_refresh_token',
      value: 'test-refresh',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.waitForURL(/\/ar\/dashboard/)
}

// ── Specs ─────────────────────────────────────────────────────────────────

test.describe('Portal flow (mocked BFF)', () => {
  test.beforeEach(async ({ page }) => {
    accessTokenIssued = false // fresh auth state per test
    await mockPortalApi(page)
  })

  test('portal root shows the status page (no login form)', async ({ page }) => {
    await page.goto('/ar')
    await expect(page.getByText('بوابة الطلاب تعمل')).toBeVisible()
    await expect(page.getByText('تسجيل الدخول')).toBeVisible()
    // No login form on the root — the unified login lives on the main site.
    await expect(page.getByPlaceholder('05xxxxxxxx')).toHaveCount(0)
  })

  test('SSO ticket exchange reaches the dashboard', async ({ page }) => {
    await ssoLogin(page)
    await expect(page.getByText('Student One')).toBeVisible()
  })

  test('grades page shows course scores', async ({ page }) => {
    await ssoLogin(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الدرجات' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/grades/)
    await expect(page.getByText('Mathematics')).toBeVisible()
    await expect(page.getByText('Physics')).toBeVisible()
    await expect(page.getByText('92.5')).toBeVisible()
  })

  test('attendance page shows status badges', async ({ page }) => {
    await ssoLogin(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الحضور' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/attendance/)
    await expect(page.getByText('Mathematics')).toBeVisible()
    await expect(page.getByText('حاضر')).toBeVisible()
  })

  test('fees page shows payments', async ({ page }) => {
    await ssoLogin(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الرسوم الدراسية' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/fees/)
    await expect(page.getByText('RCP-2026-0001')).toBeVisible()
    await expect(page.getByText('Mathematics')).toBeVisible()
  })

  test('settings page loads and shows profile', async ({ page }) => {
    await ssoLogin(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الإعدادات' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/settings/)
    await expect(page.getByText('تفضيلات البوابة')).toBeVisible()
    await expect(page.getByText('Parent One')).toBeVisible() // from the SSO response user
  })

  test('language toggle switches to English', async ({ page }) => {
    await ssoLogin(page)
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page).toHaveURL(/\/en\/dashboard/)
    await expect(page.getByRole('main').getByText('Overview')).toBeVisible()
  })
})
