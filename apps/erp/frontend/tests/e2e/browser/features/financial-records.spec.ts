import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'
import { DataTablePage } from '../../pages/DataTablePage'

test.describe('Financial Records Page UI (Authenticated)', () => {
  let dashboard: DashboardPage
  let dataTable: DataTablePage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    dataTable = new DataTablePage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should navigate to financial records page and display title', async ({ page }) => {
    await dashboard.clickSidebarLink('Financial Records')
    await dataTable.waitForPageReady()

    await dataTable.expectPageTitle('Financial Records')
    await dataTable.expectPageSubtitle('Central archive of receipts and vouchers')
    await dataTable.takeScreenshot('financial-records-page')
  })

  test('should render filters bar with document type, date range and searches', async ({ page }) => {
    await dashboard.clickSidebarLink('Financial Records')
    await dataTable.waitForPageReady()

    // Document type select showing "All"
    await expect(page.locator('button:has-text("All")').first()).toBeVisible()
    // Date range inputs
    await expect(page.locator('input[type="date"]').first()).toBeVisible()
    await expect(page.locator('input[type="date"]').nth(1)).toBeVisible()
    // Search inputs (number + name)
    await expect(page.locator('input[placeholder*="Search by" i]').first()).toBeVisible()
  })

  test('should render the unified records table with correct columns', async ({ page }) => {
    await dashboard.clickSidebarLink('Financial Records')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      await dataTable.expectTableVisible()
      const allHeaders = (await dataTable.getHeaderNames()).join(' ')
      expect(allHeaders).toContain('Type')
      expect(allHeaders).toContain('Number')
      expect(allHeaders).toContain('Date')
      expect(allHeaders).toContain('Amount')
      expect(allHeaders).toContain('Counterparty')
    } else {
      await dataTable.expectEmptyState()
    }
  })

  test('should render pagination footer when records exist', async ({ page }) => {
    await dashboard.clickSidebarLink('Financial Records')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      await expect(page.locator('text=/Showing|عرض/').first()).toBeVisible()
    }
  })

  test('should open the existing preview modal from a row action', async ({ page }) => {
    await dashboard.clickSidebarLink('Financial Records')
    await dataTable.waitForPageReady()

    const rowCount = await dataTable.getRowCount()
    if (rowCount > 0) {
      const firstRow = page.locator('table.data-table tbody tr').first()
      await firstRow.locator('button:has(svg.lucide-eye)').click()

      // ReceiptModal renders #receipt-content; RefundReceipt renders in a Modal with a disbursement title
      const receiptModal = page.locator('#receipt-content')
      const refundModal = page.locator('text=Disbursement Receipt')
      await expect(receiptModal.or(refundModal).first()).toBeVisible({ timeout: 10000 })
    } else {
      await dataTable.expectEmptyState()
    }
  })
})