import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

test.describe('Mobile Responsiveness (Authenticated)', () => {
  let dashboard: DashboardPage

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page)
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await dashboard.goto('en')
    await dashboard.waitForDashboardReady()
    await dashboard.waitForContentToLoad()
  })

  test('should show mobile menu button on small screens', async ({ page }) => {
    // Sidebar should be hidden on mobile
    const desktopSidebar = page.locator('aside.hidden.md\\:flex')
    await expect(desktopSidebar).not.toBeVisible()

    // Mobile menu button should be visible
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await expect(mobileMenu).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'test-results/artifacts/mobile-dashboard.png' })
  })

  test('should open mobile drawer and show navigation links', async ({ page }) => {
    // Open mobile menu
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await mobileMenu.click()
    await page.waitForTimeout(500)

    // Drawer should be visible with navigation links
    const drawerLinks = page.locator('nav button span')
    const linkCount = await drawerLinks.count()
    expect(linkCount).toBeGreaterThan(0)

    // Should have Dashboard link
    const links = await drawerLinks.allTextContents()
    expect(links.join(' ')).toContain('Dashboard')

    await page.screenshot({ path: 'test-results/artifacts/mobile-drawer-open.png' })
  })

  test('should close mobile drawer via close button', async ({ page }) => {
    // Open drawer
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await mobileMenu.click()
    await page.waitForTimeout(500)

    // Close button should be visible
    const closeButton = page.locator('button:has(svg.lucide-x)')
    await expect(closeButton).toBeVisible()

    // Close drawer
    await closeButton.click()
    await page.waitForTimeout(500)

    // Drawer should not be visible anymore
    await expect(closeButton).not.toBeVisible()
  })

  test('should navigate from mobile drawer to courses page', async ({ page }) => {
    // Open mobile menu
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await mobileMenu.click()
    await page.waitForTimeout(500)

    // Click on Courses link in drawer
    const coursesLink = page.locator('nav button:has-text("Courses")').first()
    await coursesLink.click()
    await page.waitForLoadState('networkidle')

    // Should navigate to courses page
    expect(page.url()).toContain('/dashboard/courses')
  })

  test('should navigate from mobile drawer to students page', async ({ page }) => {
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await mobileMenu.click()
    await page.waitForTimeout(500)

    const studentsLink = page.locator('nav button:has-text("Students")').first()
    await studentsLink.click()
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/dashboard/students')
  })

  test('should navigate from mobile drawer back to dashboard', async ({ page }) => {
    // Open drawer and go to courses
    const mobileMenu = page.locator('button:has(svg.lucide-menu)').first()
    await mobileMenu.click()
    await page.waitForTimeout(500)

    const coursesLink = page.locator('nav button:has-text("Courses")').first()
    await coursesLink.click()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard/courses')

    // Go back to dashboard
    await mobileMenu.click()
    await page.waitForTimeout(500)

    const dashboardLink = page.locator('nav button:has-text("Dashboard")').first()
    await dashboardLink.click()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/en/dashboard')
  })

  test('should render login page on mobile', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/en/login`)
    await page.waitForLoadState('networkidle')

    // Login form should be visible on mobile
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    await page.screenshot({ path: 'test-results/artifacts/mobile-login.png' })
  })
})
