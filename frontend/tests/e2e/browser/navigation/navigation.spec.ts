import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('Navigation & Access Control (Authenticated)', () => {
  test('superadmin should see all navigation links in sidebar', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()

    const links = await dashboard.getSidebarLinkNames()
    const allText = links.join(' ')

    // Superadmin should have full access
    expect(allText).toContain('Dashboard')
    expect(allText).toContain('Users')
    expect(allText).toContain('Roles')
    expect(allText).toContain('Courses')
    expect(allText).toContain('Students')
    expect(allText).toContain('Payments')
    expect(allText).toContain('System Health')
    expect(allText).toContain('Database Backups')
    expect(allText).toContain('Settings')
  })

  test('should logout and redirect to login page', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Click logout button
    await dashboard.logout()

    // Wait for redirect
    await page.waitForTimeout(1500)

    // Should be redirected to login
    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')

    // Should see the login form
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 10000 })
  })

  test('should open and close mobile sidebar drawer', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // Mobile menu button should be visible
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await expect(mobileMenu).toBeVisible({ timeout: 5000 })

    // Click mobile menu to open drawer
    await mobileMenu.click()
    await page.waitForTimeout(500)

    // Drawer should have close button
    const closeButton = page.locator('button:has(svg.lucide-x)')
    await expect(closeButton).toBeVisible()

    // Close the drawer
    await closeButton.click()
    await page.waitForTimeout(500)

    // Close button should disappear
    await expect(closeButton).not.toBeVisible()
  })
})
