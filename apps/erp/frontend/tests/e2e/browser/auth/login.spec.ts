import { test, expect } from '@playwright/test'
import { LoginPage } from '../../pages/LoginPage'

// This test file tests the login flow itself - no pre-authenticated state needed
test.use({ storageState: undefined })

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

test.describe('Login Page UI', () => {
  test('should render login page in Arabic with correct elements', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto('ar')

    await loginPage.expectFormVisible()
    await expect(page.locator('h1')).toContainText('Al-Drasat ERP')
    await expect(page.locator('button[type="submit"]')).toContainText('تسجيل الدخول')
  })

  test('should render login page in English with correct elements', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto('en')

    await loginPage.expectFormVisible()
    await expect(page.locator('h1')).toContainText('Al-Drasat ERP')
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In')
  })

  test('should toggle language between Arabic and English', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto('ar')

    await expect(loginPage.title).toContainText('Al-Drasat ERP')

    await loginPage.toggleLanguage()
    await expect(loginPage.title).toContainText('Al-Drasat ERP')
    await expect(page).toHaveURL(/\/en\/login/)

    await loginPage.toggleLanguage()
    await expect(loginPage.title).toContainText('Al-Drasat ERP')
    await expect(page).toHaveURL(/\/ar\/login/)
  })

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto('en')
    await loginPage.login('wrong@email.com', 'WrongPass123!')

    // Check for error banner
    const errorVisible = await page.locator('.bg-red-50.text-red-600').isVisible().catch(() => false)
    expect(errorVisible).toBe(true)

    // Should remain on login page
    await expect(page).toHaveURL(/\/en\/login/)
  })
})

test.describe('Protected Routes', () => {
  test('should redirect unauthenticated user to login when accessing dashboard', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/en/dashboard`)
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/en\/login/)
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should redirect unauthenticated user from any protected route', async ({ page }) => {
    const protectedRoutes = ['/en/dashboard/courses', '/en/dashboard/users', '/en/dashboard/payments']

    for (const route of protectedRoutes) {
      await page.goto(`${FRONTEND_URL}${route}`)
      await page.waitForLoadState('networkidle')

      const currentUrl = page.url()
      expect(currentUrl).toContain('/login')
    }
  })
})
