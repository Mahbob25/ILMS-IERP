import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { DataTablePage } from '../../pages/DataTablePage'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

test.describe('Courses Page UI (Authenticated)', () => {
  let dashboard: DashboardPage
  let dataTable: DataTablePage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    dataTable = new DataTablePage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should navigate to courses page via sidebar and display page title', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Verify page loaded correctly
    await dataTable.expectPageTitle('Courses')
    await dataTable.expectPageSubtitle('Manage courses and subjects')

    await dataTable.takeScreenshot('courses-page')
  })

  test('should display courses table with correct columns', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Check if there are courses or empty state
    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      await dataTable.expectTableVisible()
      const headers = await dataTable.getHeaderNames()
      const allHeaders = headers.join(' ')
      expect(allHeaders).toContain('Name')
      expect(allHeaders).toContain('Code')
      expect(allHeaders).toContain('Credits')
    } else {
      await dataTable.expectEmptyState()
    }
  })

  test('should search courses by name or code', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Run a search
    await dataTable.searchFor('test')

    // Verify search results appear
    await page.waitForLoadState('networkidle')
    await dataTable.takeScreenshot('courses-search')

    // Page should have title even after search
    await dataTable.expectPageTitle('Courses')
  })

  test('should show Add Course button for superadmin', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Superadmin should have add button
    const addBtnVisible = await dataTable.isAddButtonVisible()
    expect(addBtnVisible).toBe(true)
  })

  test('should navigate back to dashboard from courses', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Navigate back via sidebar
    await dashboard.clickSidebarLink('Dashboard')
    await dashboard.waitForDashboardReady()

    // Verify we're back on dashboard
    await expect(page).toHaveURL(/\/en\/dashboard\/?$/)
  })

  test('should refresh courses list', async ({ page }) => {
    await dashboard.clickSidebarLink('Courses')
    await dataTable.waitForPageReady()

    // Click refresh
    await dataTable.clickRefresh()
    await page.waitForLoadState('networkidle')

    // Page should still be on courses
    await expect(page).toHaveURL(/\/en\/dashboard\/courses/)
    await dataTable.expectPageTitle('Courses')
  })
})
