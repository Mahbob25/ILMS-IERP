import { Page, Locator, expect } from '@playwright/test'

/**
 * Shared Page Object for dashboard pages that use data tables
 * (Courses, Students, Sections, Employees, etc.)
 */
export class DataTablePage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly pageSubtitle: Locator
  readonly searchInput: Locator
  readonly searchClearButton: Locator
  readonly addButton: Locator
  readonly refreshButton: Locator
  readonly dataTable: Locator
  readonly dataTableHeaders: Locator
  readonly dataTableRows: Locator
  readonly emptyState: Locator
  readonly loadingSpinner: Locator
  readonly paginationInfo: Locator
  readonly prevPageButton: Locator
  readonly nextPageButton: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.locator('h2')
    this.pageSubtitle = page.locator('h2 + p')
    this.searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="بحث" i]')
    this.searchClearButton = page.locator('button:has-text("Cancel"), button:has-text("إلغاء")')
    this.addButton = page.locator('button:has(svg.lucide-plus)')
    this.refreshButton = page.locator('button:has(svg.lucide-refresh-cw)')
    this.dataTable = page.locator('table.data-table, .card table')
    this.dataTableHeaders = page.locator('table.data-table th, .card table th')
    this.dataTableRows = page.locator('table.data-table tbody tr, .card table tbody tr')
    this.emptyState = page.locator('.card.p-8.text-center')
    this.loadingSpinner = page.locator('svg.lucide-loader-2')
    this.paginationInfo = page.locator('text=/Showing|عرض/')
    this.prevPageButton = page.locator('button:has-text("Previous"), button:has-text("السابق")')
    this.nextPageButton = page.locator('button:has-text("Next"), button:has-text("التالي")')
  }

  async navigateTo(path: string): Promise<void> {
    await this.page.goto(path)
    await this.page.waitForLoadState('networkidle')
  }

  async waitForPageReady(): Promise<void> {
    // Wait for loading spinner to disappear
    await this.page.waitForLoadState('networkidle')
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await this.page.waitForLoadState('networkidle')
  }

  async expectTableVisible(): Promise<void> {
    await expect(this.dataTable).toBeVisible({ timeout: 10000 })
  }

  async expectEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible({ timeout: 10000 })
  }

  async getRowCount(): Promise<number> {
    return await this.dataTableRows.count()
  }

  async getHeaderNames(): Promise<string[]> {
    return await this.dataTableHeaders.allTextContents()
  }

  async searchFor(term: string): Promise<void> {
    await this.searchInput.fill(term)
    // Wait for debounce (400ms) and network response
    await this.page.waitForTimeout(500)
    await this.page.waitForLoadState('networkidle')
  }

  async clickAddButton(): Promise<void> {
    await this.addButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  async clickRefresh(): Promise<void> {
    await this.refreshButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  async expectPageTitle(title: string): Promise<void> {
    await expect(this.pageTitle).toContainText(title, { timeout: 10000 })
  }

  async expectPageSubtitle(subtitle: string): Promise<void> {
    await expect(this.pageSubtitle).toContainText(subtitle, { timeout: 10000 })
  }

  async getFirstRowText(): Promise<string> {
    if (await this.dataTableRows.count() === 0) return ''
    return (await this.dataTableRows.first().innerText()).trim()
  }

  async isAddButtonVisible(): Promise<boolean> {
    return await this.addButton.isVisible().catch(() => false)
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/artifacts/${name}.png`,
      fullPage: false,
    })
  }
}
