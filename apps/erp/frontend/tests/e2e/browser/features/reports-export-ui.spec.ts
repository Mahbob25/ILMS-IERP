import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('Reports Export Toolbar (Authenticated)', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('renders Print, PDF and CSV export buttons on the reports page', async ({ page }) => {
    await dashboard.clickSidebarLink('Reports')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('button:has-text("Print")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("PDF")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("CSV")')).toBeVisible({ timeout: 10000 })
  })

  test('CSV button downloads a .csv file for the current report', async ({ page }) => {
    await dashboard.clickSidebarLink('Reports')
    await page.waitForLoadState('networkidle')

    const csvButton = page.locator('button:has-text("CSV")')
    await expect(csvButton).toBeVisible({ timeout: 10000 })

    const downloadPromise = page.waitForEvent('download')
    await csvButton.click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.csv')
  })

  test('Print button opens a new tab with the print HTML', async ({ page, context }) => {
    await dashboard.clickSidebarLink('Reports')
    await page.waitForLoadState('networkidle')

    const printButton = page.locator('button:has-text("Print")')
    await expect(printButton).toBeVisible({ timeout: 10000 })

    const popupPromise = context.waitForEvent('page')
    await printButton.click()

    const printPage = await popupPromise
    await printPage.waitForLoadState('domcontentloaded')
    expect(printPage.url()).toContain('/print')

    // Print endpoint serves the styled report HTML document
    await expect(printPage.locator('h1, .doc-title').first()).toBeAttached({ timeout: 10000 })
  })

  test('PDF export produces a .pdf file download', async ({ page }) => {
    await dashboard.clickSidebarLink('Reports')
    await page.waitForLoadState('networkidle')

    const pdfButton = page.locator('button:has-text("PDF")')
    await expect(pdfButton).toBeVisible({ timeout: 10000 })

    const downloadPromise = page.waitForEvent('download')
    await pdfButton.click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.pdf')
  })
})