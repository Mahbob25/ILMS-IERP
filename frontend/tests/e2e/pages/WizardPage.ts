import { Page, Locator, expect } from '@playwright/test'

export class WizardPage {
  readonly page: Page
  readonly header: Locator
  readonly stepper: Locator
  readonly nextButton: Locator
  readonly skipButton: Locator
  readonly receiptModal: Locator

  constructor(page: Page) {
    this.page = page
    this.header = page.locator('h2')
    this.stepper = page.locator('ol[role="list"]')
    // The wizard nav bar has Back/Next/Skip buttons
    this.nextButton = page.locator('main button').filter({ hasText: 'Next' }).first()
    this.skipButton = page.locator('main button').filter({ hasText: 'Skip' }).first()
    this.receiptModal = page.locator('text=Payment Receipt').first()
  }

  async goto(): Promise<void> {
    await this.page.goto('/en/dashboard/wizards/student-enrollment')
    await this.page.waitForLoadState('networkidle')
  }

  async expectWizardReady(): Promise<void> {
    await expect(this.header).toContainText('Quick Registration', { timeout: 15000 })
    await expect(this.stepper).toBeVisible()
    await expect(this.stepper).toContainText('Student Details')
    await expect(this.stepper).toContainText('Section & Course')
    await expect(this.stepper).toContainText('Payment')
    await expect(this.stepper).toContainText('Complete')
  }

  async searchStudent(query: string): Promise<void> {
    const searchInput = this.page.getByPlaceholder('Search student by name or code...')
    await searchInput.fill(query)
    await this.page.waitForTimeout(500)
  }

  async pickFirstStudentResult(): Promise<void> {
    // Searched results render as full-width buttons; click the first one
    const result = this.page.locator('main button.w-full').filter({ hasText: /[a-zA-Z0-9]/ }).first()
    await result.click()
  }

  async startCreateStudent(): Promise<void> {
    await this.page.getByText('+ Add new student').click()
    await expect(this.page.locator('text=Create New Student').first()).toBeVisible()
  }

  async fillStudentForm(code: string, name: string, email: string): Promise<void> {
    // In create mode only the student form renders: [code, name] are text inputs, email is email.
    const textInputs = this.page.locator('main input[type="text"]')
    await textInputs.nth(0).fill(code)
    await textInputs.nth(1).fill(name)
    await this.page.locator('main input[type="email"]').fill(email)
  }

  async saveStudent(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save Student' }).click()
  }

  async expectStudentLocked(): Promise<void> {
    await expect(this.page.locator('main .bg-emerald-50')).toBeVisible({ timeout: 15000 })
  }

  async goNext(): Promise<void> {
    await this.nextButton.click()
  }

  async expectEnrollmentStep(): Promise<void> {
    // Step 2 has a section dropdown (Select trigger)
    await expect(this.page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({
      timeout: 15000,
    })
  }

  async selectSection(sectionLabel: string): Promise<void> {
    const trigger = this.page.locator('button[aria-haspopup="listbox"]').first()
    await trigger.click()
    const option = this.page.locator('li[role="option"]', { hasText: sectionLabel }).first()
    await option.click()
  }

  async expectPaymentStep(): Promise<void> {
    await expect(this.skipButton).toBeVisible({ timeout: 15000 })
  }

  async skipPayment(): Promise<void> {
    await this.skipButton.click()
  }

  async expectCompletion(): Promise<void> {
    await expect(this.page.locator('text=Registration Complete').first()).toBeVisible({
      timeout: 15000,
    })
  }

  async expectReceiptModal(): Promise<void> {
    await expect(this.receiptModal).toBeVisible({ timeout: 15000 })
  }

  async closeReceipt(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close' }).click()
  }
}