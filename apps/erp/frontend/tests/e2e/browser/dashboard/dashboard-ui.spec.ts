import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('Dashboard UI (Authenticated)', () => {
  test('should display superadmin dashboard with system stats', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Verify role badge shows superadmin
    const roleText = await dashboard.getRoleBadgeText()
    expect(roleText.toLowerCase()).toContain('super admin')

    // Verify navigation sidebar has management links
    const linkNames = await dashboard.getSidebarLinkNames()
    expect(linkNames.length).toBeGreaterThan(5)

    // Verify key management links exist
    const allText = linkNames.join(' ')
    expect(allText).toContain('Dashboard')
    expect(allText).toContain('Users')
    expect(allText).toContain('Courses')
    expect(allText).toContain('Settings')
    expect(allText).toContain('System Health')
    expect(allText).toContain('Database Backups')

    // Dashboard should have stat cards
    const statCards = dashboard.page.locator('.card')
    const cardCount = await statCards.count()
    expect(cardCount).toBeGreaterThanOrEqual(2)

    await page.screenshot({ path: 'test-results/artifacts/superadmin-dashboard.png' })
  })

  test('should navigate to courses page via sidebar', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    await dashboard.clickSidebarLink('Courses')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard/courses')
  })

  test('should navigate to payments page via sidebar', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    await dashboard.clickSidebarLink('Payments')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard/payments')
  })

  test('should navigate to students page via sidebar', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    await dashboard.clickSidebarLink('Students')
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard/students')
  })

  test('should toggle dashboard language between Arabic and English', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Toggle to Arabic
    await dashboard.toggleLanguage()
    await page.waitForURL(/\/ar\/dashboard/)
    await page.waitForLoadState('networkidle')
    await dashboard.waitForDashboardReady()

    // Should have Arabic sidebar text
    const arabicLinks = await dashboard.getSidebarLinkNames()
    expect(arabicLinks.length).toBeGreaterThan(0)
  })
})
