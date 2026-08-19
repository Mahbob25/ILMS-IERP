import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

test.describe('Localization & Arabic UI (Authenticated)', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
  })

  test('should render dashboard in Arabic with Arabic sidebar links', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/ar/dashboard`)
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Verify role badge shows Arabic text
    const roleText = await dashboard.getRoleBadgeText()
    expect(roleText).toBeTruthy()

    // Verify sidebar navigation has Arabic links
    const links = await dashboard.getSidebarLinkNames()
    const allText = links.join(' ')

    // Arabic navigation items should be present
    expect(allText).toContain('لوحة التحكم')
    expect(allText).toContain('المستخدمين')

    // Language toggle should say "English"
    const langToggle = page.locator('button:has(svg.lucide-globe)')
    await expect(langToggle).toContainText('English')

    await page.screenshot({ path: 'test-results/artifacts/arabic-dashboard.png' })
  })

  test('should toggle from Arabic to English on dashboard', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/ar/dashboard`)
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Verify we're on Arabic
    await expect(page).toHaveURL(/\/ar\/dashboard/)
    let links = await dashboard.getSidebarLinkNames()
    expect(links.join(' ')).toContain('لوحة التحكم')

    // Toggle to English
    await dashboard.toggleLanguage()
    await page.waitForURL(/\/en\/dashboard/)
    await dashboard.waitForDashboardReady()

    // Verify English links
    links = await dashboard.getSidebarLinkNames()
    expect(links.join(' ')).toContain('Dashboard')
    expect(links.join(' ')).not.toContain('لوحة التحكم')
  })

  test('should render courses page in Arabic', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/ar/dashboard/courses`)
    await page.waitForLoadState('networkidle')
    // Wait for any loading state
    await page.locator('svg.lucide-loader-2').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForLoadState('networkidle')

    // Verify Arabic page title
    await expect(page.locator('h2')).toContainText('المقررات الدراسية')
    await expect(page.locator('h2 + p')).toContainText('إدارة المقررات والمواد التعليمية')

    await page.screenshot({ path: 'test-results/artifacts/arabic-courses.png' })
  })

  test('should render students page in Arabic', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/ar/dashboard/students`)
    await page.waitForLoadState('networkidle')
    await page.locator('svg.lucide-loader-2').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h2')).toContainText('الطلاب')
    await expect(page.locator('h2 + p')).toContainText('إدارة سجل الطلاب')

    await page.screenshot({ path: 'test-results/artifacts/arabic-students.png' })
  })
})
