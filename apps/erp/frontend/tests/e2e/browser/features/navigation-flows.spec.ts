import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

test.describe('End-to-End Navigation Flows (Authenticated)', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should navigate through all superadmin sidebar links', async ({ page }) => {
    const sidebarLinks = await dashboard.getSidebarLinkNames()
    const expectedLinks = [
      'Dashboard', 'Users', 'Employees', 'Roles',
      'Courses', 'Course Sections', 'Certificates',
      'Students', 'Enrollments', 'Attendance',
      'Gradebook', 'Payments', 'Expenses',
      'Revenue', 'Teacher Wallet', 'Daily Closures',
      'Point of Sale', 'Curriculum Ingestion',
      'System Health', 'Database Backups', 'Settings'
    ]

    // Verify all expected links exist
    const allText = sidebarLinks.join(' ')
    for (const link of expectedLinks) {
      expect(allText).toContain(link)
    }
  })

  test('should navigate to Users page and show manage users heading', async ({ page }) => {
    await dashboard.clickSidebarLink('User Management')
    await page.waitForLoadState('networkidle')
    await page.locator('svg.lucide-loader-2').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard/users')
    // Should show title on users page
    const heading = page.locator('h2')
    await expect(heading).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'test-results/artifacts/users-page.png' })
  })

  test('should navigate to Settings page', async ({ page }) => {
    await dashboard.clickSidebarLink('Settings')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/settings')
    await page.screenshot({ path: 'test-results/artifacts/settings-page.png' })
  })

  test('should navigate to System Health page', async ({ page }) => {
    await dashboard.clickSidebarLink('System Health')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/health')
    await page.screenshot({ path: 'test-results/artifacts/health-page.png' })
  })

  test('should navigate to Attendance page', async ({ page }) => {
    await dashboard.clickSidebarLink('Attendance')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/attendance')
    await page.screenshot({ path: 'test-results/artifacts/attendance-page.png' })
  })

  test('should navigate to Gradebook page', async ({ page }) => {
    await dashboard.clickSidebarLink('Gradebook')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/gradebook')
    await page.screenshot({ path: 'test-results/artifacts/gradebook-page.png' })
  })

  test('should navigate to Enrollments page', async ({ page }) => {
    await dashboard.clickSidebarLink('Enrollments')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/enrollments')
    await page.screenshot({ path: 'test-results/artifacts/enrollments-page.png' })
  })

  test('should navigate to Revenue page', async ({ page }) => {
    await dashboard.clickSidebarLink('Revenue')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/revenue')
    await page.screenshot({ path: 'test-results/artifacts/revenue-page.png' })
  })

  test('should navigate back to dashboard after visiting multiple pages', async ({ page }) => {
    // Visit several pages
    await dashboard.clickSidebarLink('Courses')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/courses')

    await dashboard.clickSidebarLink('Students')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/students')

    await dashboard.clickSidebarLink('Payments')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/payments')

    // Return to dashboard
    await dashboard.clickSidebarLink('Dashboard')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
    expect(page.url()).toContain('/en/dashboard')

    await page.screenshot({ path: 'test-results/artifacts/back-to-dashboard.png' })
  })
})
