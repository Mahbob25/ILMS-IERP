import { Page, Locator, expect } from '@playwright/test'

export class DashboardPage {
  readonly page: Page
  readonly sidebar: Locator
  readonly sidebarLinks: Locator
  readonly mainContent: Locator
  readonly userProfileName: Locator
  readonly userProfileEmail: Locator
  readonly roleBadge: Locator
  readonly logoutButton: Locator
  readonly mobileMenuButton: Locator
  readonly langToggle: Locator
  readonly brandHeader: Locator

  constructor(page: Page) {
    this.page = page
    this.sidebar = page.locator('aside')
    this.sidebarLinks = page.locator('aside nav button')
    this.mainContent = page.locator('main')
    this.userProfileName = page.locator('aside .text-sm.font-semibold').first()
    this.userProfileEmail = page.locator('aside .text-xs.text-slate-500').first()
    this.roleBadge = page.locator('header .bg-emerald-50.text-emerald-600')
    this.logoutButton = page.locator('button:has(svg.lucide-log-out)')
    this.mobileMenuButton = page.locator('button:has(svg.lucide-menu)').first()
    this.langToggle = page.locator('button:has(svg.lucide-globe)')
    this.brandHeader = page.locator('text=Al-Drasat ERP').first()
  }

  async goto(locale: string = 'ar'): Promise<void> {
    await this.page.goto(`/${locale}/dashboard`)
    await this.page.waitForLoadState('networkidle')
  }

  async waitForDashboardReady(): Promise<void> {
    await expect(this.sidebar).toBeVisible({ timeout: 15000 })
    await expect(this.mainContent).toBeVisible({ timeout: 15000 })
    // Wait for any loading spinners to disappear
    await this.page.waitForLoadState('networkidle')
  }

  async getSidebarLinkNames(): Promise<string[]> {
    return await this.sidebarLinks.allTextContents()
  }

  async clickSidebarLink(name: string): Promise<void> {
    await this.sidebarLinks.filter({ hasText: name }).click()
    await this.page.waitForLoadState('networkidle')
  }

  async getRoleBadgeText(): Promise<string> {
    return await this.roleBadge.textContent() || ''
  }

  async logout(): Promise<void> {
    await this.logoutButton.click()
    await this.page.waitForLoadState('networkidle')
  }

  async expectRedirectToLogin(locale: string = 'ar'): Promise<void> {
    await this.page.waitForURL(`/${locale}/login`)
  }

  async expectDashboardStatsVisible(): Promise<void> {
    // Dashboard stats cards have font-bold text-xl or text-2xl
    const statValues = this.page.locator('.card .text-xl.font-bold, .card .text-2xl.font-bold')
    await expect(statValues.first()).toBeVisible({ timeout: 10000 })
  }

  async getStatCardsCount(): Promise<number> {
    return await this.page.locator('.card').count()
  }

  async isLoadingSkeletonVisible(): Promise<boolean> {
    return await this.page.locator('.animate-pulse').first().isVisible()
  }

  async waitForContentToLoad(): Promise<void> {
    // Wait for loading skeletons to disappear
    await this.page.locator('.animate-pulse').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
    await this.page.waitForLoadState('networkidle')
  }

  async toggleLanguage(): Promise<void> {
    await this.langToggle.click()
    await this.page.waitForLoadState('networkidle')
  }

  async expectAccessDenied(): Promise<void> {
    await expect(this.page.locator('text=Access denied')).toBeVisible({ timeout: 10000 })
  }

  async getPageTitle(): Promise<string> {
    return await this.page.title()
  }
}
