import { test, expect, type Page } from '@playwright/test'

// Portal E2E — OTP login → dashboard → grades → attendance → fees → settings.
//
// Runs against the portal frontend (:3001) with the BFF API mocked at the
// network layer (route interception) so it needs no live backend/database.
// When PORTAL_API_URL is set (full-stack run), interception is skipped and
// the real BFF answers.

const API = process.env.PORTAL_API_URL || '/api'

// ── Mocks (in-memory OTP store, auth cookies, linked student data) ────────

const OTP = '123456'
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

    // Auth
    if (path.endsWith('/auth/request-otp') && req.method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'OTP sent', ttl_seconds: 300 }),
      })
    }
    if (path.endsWith('/auth/verify-otp') && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}')
      if (body.code === OTP) {
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
      return route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Invalid OTP' }) })
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

async function login(page: Page) {
  await page.goto('/ar/login')
  await page.getByPlaceholder('05xxxxxxxx').fill('+966500000000')
  await page.getByRole('button', { name: 'إرسال الرمز' }).click()
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click() // verify step revealed
  await page.getByPlaceholder('••••••').fill(OTP)
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click()
  // The verify mock only sets the access token via set-cookie (Playwright
  // drops subsequent set-cookie headers). Add the refresh cookie so the
  // middleware lets the dashboard render.
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
}

// ── Specs ─────────────────────────────────────────────────────────────────

test.describe('Portal flow (mocked BFF)', () => {
  test.beforeEach(async ({ page }) => {
    accessTokenIssued = false // fresh auth state per test
    await mockPortalApi(page)
  })

  test('OTP login reaches the dashboard', async ({ page }) => {
    await page.goto('/ar/login')
    await page.getByPlaceholder('05xxxxxxxx').fill('+966500000000')
    await page.getByRole('button', { name: 'إرسال الرمز' }).click()

    // Second step appears
    await expect(page.getByPlaceholder('••••••')).toBeVisible()
    await page.getByPlaceholder('••••••').fill(OTP)
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click()

    // Refresh cookie lets the middleware reach the dashboard.
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

    // Lands on dashboard
    await expect(page).toHaveURL(/\/ar\/dashboard/)
    await expect(page.getByText('Student One')).toBeVisible()
  })

  test('grades page shows course scores', async ({ page }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الدرجات' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/grades/)
    await expect(page.getByText('Mathematics')).toBeVisible()
    await expect(page.getByText('Physics')).toBeVisible()
    await expect(page.getByText('92.5')).toBeVisible()
  })

  test('attendance page shows status badges', async ({ page }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الحضور' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/attendance/)
    await expect(page.getByText('Mathematics')).toBeVisible()
    await expect(page.getByText('حاضر')).toBeVisible()
  })

  test('fees page shows payments', async ({ page }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الرسوم الدراسية' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/fees/)
    await expect(page.getByText('RCP-2026-0001')).toBeVisible()
    await expect(page.getByText('Mathematics')).toBeVisible()
  })

  test('settings page loads and shows profile', async ({ page }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('button', { name: 'الإعدادات' }).click()
    await expect(page).toHaveURL(/\/ar\/dashboard\/settings/)
    await expect(page.getByText('تفضيلات البوابة')).toBeVisible()
    await expect(page.getByText('Parent One')).toBeVisible() // from the login response user
  })

  test('language toggle switches to English', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page).toHaveURL(/\/en\/dashboard/)
    await expect(page.getByRole('main').getByText('Overview')).toBeVisible()
  })
})
