import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { DataTablePage } from '../../pages/DataTablePage'

test.describe('Payments Page UI (Authenticated)', () => {
  let dashboard: DashboardPage
  let dataTable: DataTablePage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    dataTable = new DataTablePage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should navigate to payments page and display title', async ({ page }) => {
    await dashboard.clickSidebarLink('Payments')
    await dataTable.waitForPageReady()

    await dataTable.expectPageTitle('Payments')
    await dataTable.expectPageSubtitle('Manage payments and receipts')
    await dataTable.takeScreenshot('payments-page')
  })

  test('should display payments table with correct columns', async ({ page }) => {
    await dashboard.clickSidebarLink('Payments')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      await dataTable.expectTableVisible()
      const headers = await dataTable.getHeaderNames()
      const allHeaders = headers.join(' ')
      expect(allHeaders).toContain('Receipt')
      expect(allHeaders).toContain('Student')
      expect(allHeaders).toContain('Amount')
      expect(allHeaders).toContain('Date')
    } else {
      await dataTable.expectEmptyState()
    }
  })

  test('should show Record Payment button for superadmin', async ({ page }) => {
    await dashboard.clickSidebarLink('Payments')
    await dataTable.waitForPageReady()

    const addBtnVisible = await dataTable.isAddButtonVisible()
    expect(addBtnVisible).toBe(true)
  })

  test('should have refresh functionality on payments', async ({ page }) => {
    await dashboard.clickSidebarLink('Payments')
    await dataTable.waitForPageReady()

    await dataTable.clickRefresh()
    await page.waitForLoadState('networkidle')
    await dataTable.expectPageTitle('Payments')
  })
})
