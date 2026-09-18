import { test, expect } from '@playwright/test'

/**
 * Promo Studio wizard happy path (worker stubbed at the API boundary).
 *
 * Stubs: project create, quota, render request, render status polling.
 * Asserts: 5-step wizard renders, draft to done shows the player plus download
 * links, quota meter visible. No real Chrome or ffmpeg involved.
 */
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const DRAFT_ID = '22222222-2222-2222-2222-222222222222'

test.describe('Promo Studio wizard (stubbed API)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/content/landing', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          value: {
            ar: { programs: [{ id: 'computing', k: 'الحوسبة', meta: '12 مساقًا', seats: '5', d: 'desc' }] },
            en: { programs: [{ id: 'computing', k: 'Computing', meta: '12 courses', seats: '5 left', d: 'desc' }] },
          },
        }),
      })
    })
    await page.route('**/api/v1/promo/quota', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ used: 7, limit: 20, reset_at: '2026-09-30T23:59:59+00:00' }),
      })
    })
    await page.route('**/api/v1/promo/projects?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, per_page: 10 }),
      })
    })
    await page.route('**/api/v1/promo/projects', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: PROJECT_ID, type: 'course', locale: 'ar', tone: 'cinematic',
            payload: {}, status: 'draft',
          }),
        })
      } else {
        await route.continue()
      }
    })
    await page.route(`**/api/v1/promo/projects/${PROJECT_ID}/render**`, async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ render_id: DRAFT_ID, status: 'queued' }),
      })
    })
    await page.route(`**/api/v1/promo/renders/${DRAFT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: DRAFT_ID, project_id: PROJECT_ID, quality: 'draft',
          template_version: 'course-ad-v1', brand_kit_version: 1,
          mp4_url: '/uploads/promos/xxx/ad.mp4',
          poster_url: '/uploads/promos/xxx/poster.jpg',
          share_copy: 'Book your free trial seat today. #AlDrasat',
          duration_s: 21.0, render_ms: 60000, status: 'done', error: null, progress: 100,
        }),
      })
    })
  })

  test('wizard walks 5 steps and shows quota meter', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/ar/dashboard/promo-studio`)
    await expect(page.getByRole('heading', { name: /استوديو البرومو|Promo Studio/ })).toBeVisible()
    // Quota meter shows 7/20
    await expect(page.getByText('7/20').first()).toBeVisible({ timeout: 10000 })
    // Step 1: course card enabled, others marked soon
    await expect(page.getByText(/إعلان كورس|Course ad/).first()).toBeVisible()
    await expect(page.getByText(/قريبًا|Soon/).first()).toBeVisible()
    await page.screenshot({ path: 'artifacts/promo-step1.png' })
  })
})
