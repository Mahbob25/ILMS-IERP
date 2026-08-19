import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { DataTablePage } from '../../pages/DataTablePage'

test.describe('Students Page UI (Authenticated)', () => {
  let dashboard: DashboardPage
  let dataTable: DataTablePage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    dataTable = new DataTablePage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should navigate to students page and display title', async ({ page }) => {
    await dashboard.clickSidebarLink('Students')
    await dataTable.waitForPageReady()

    await dataTable.expectPageTitle('Students')
    await dataTable.expectPageSubtitle('Manage student records')
    await dataTable.takeScreenshot('students-page')
  })

  test('should display students table with correct columns', async ({ page }) => {
    await dashboard.clickSidebarLink('Students')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      await dataTable.expectTableVisible()
      const headers = await dataTable.getHeaderNames()
      const allHeaders = headers.join(' ')
      expect(allHeaders).toContain('Student Code')
      expect(allHeaders).toContain('Full Name')
    } else {
      await dataTable.expectEmptyState()
    }
  })

  test('should search students by name or code', async ({ page }) => {
    await dashboard.clickSidebarLink('Students')
    await dataTable.waitForPageReady()

    await dataTable.searchFor('test')
    await page.waitForLoadState('networkidle')
    await dataTable.takeScreenshot('students-search')

    await dataTable.expectPageTitle('Students')
  })

  test('should have Add Student button for superadmin', async ({ page }) => {
    await dashboard.clickSidebarLink('Students')
    await dataTable.waitForPageReady()

    const addBtnVisible = await dataTable.isAddButtonVisible()
    expect(addBtnVisible).toBe(true)
  })

  test('should navigate to student details page', async ({ page }) => {
    await dashboard.clickSidebarLink('Students')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      // Click on first student name link
      const studentLink = page.locator('table tbody tr').first().locator('a, button.text-brand-600')
      if (await studentLink.isVisible().catch(() => false)) {
        await studentLink.click()
        await page.waitForLoadState('networkidle')
        // Should be on student detail page
        expect(page.url()).toContain('/dashboard/students/')
        await dataTable.takeScreenshot('student-detail')
      }
    }
  })
})
