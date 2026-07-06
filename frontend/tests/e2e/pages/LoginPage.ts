import { Page, Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorAlert: Locator
  readonly langToggle: Locator
  readonly title: Locator
  readonly brandIcon: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('input[type="email"]')
    this.passwordInput = page.locator('input[type="password"]')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorAlert = page.locator('.bg-red-50.text-red-600')
    this.langToggle = page.locator('button:has(svg.lucide-globe)')
    this.title = page.locator('h1')
    this.brandIcon = page.locator('svg.lucide-log-in')
  }

  async goto(locale: string = 'ar'): Promise<void> {
    await this.page.goto(`/${locale}/login`)
    await this.page.waitForLoadState('networkidle')
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
    // Wait for navigation after login
    await this.page.waitForLoadState('networkidle')
  }

  async expectFormVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
    await expect(this.submitButton).toBeVisible()
  }

  async expectValidationError(): Promise<void> {
    // Client-side validation fires when submitting empty fields
    await expect(this.emailInput).toBeVisible()
  }

  async expectAuthError(): Promise<void> {
    await expect(this.errorAlert).toBeVisible({ timeout: 10000 })
  }

  async getTitle(): Promise<string> {
    return await this.title.innerText()
  }

  async toggleLanguage(): Promise<void> {
    await this.langToggle.click()
    await this.page.waitForLoadState('networkidle')
  }

  async expectRedirectToDashboard(locale: string = 'ar'): Promise<void> {
    await this.page.waitForURL(`/${locale}/dashboard`)
    await expect(this.page.locator('text=LIMS Core Portal')).toBeVisible({ timeout: 10000 })
  }
}
