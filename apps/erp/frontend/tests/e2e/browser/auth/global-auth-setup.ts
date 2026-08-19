/**
 * Global setup for browser E2E tests.
 * Logs in as superadmin once and saves storage state
 * so all authenticated tests share the same session.
 * This avoids the 3/minute rate limit on the login endpoint.
 */
import { chromium, FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const STORAGE_PATH = path.join(__dirname, '..', '.browser-auth.json')

const CREDENTIALS: Record<string, { email: string; password: string }> = {
  superadmin: { email: 'superadmin@aldirasat.com', password: 'admin123' },
}

async function globalSetup(config: FullConfig) {
  console.log('\n=== Browser E2E Global Setup ===')

  // Skip if we already have a valid session file
  if (fs.existsSync(STORAGE_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'))
      const cookies = state.cookies || []
      const hasAccessToken = cookies.some((c: any) => c.name === 'access_token')
      if (hasAccessToken) {
        console.log('  ✓ Using existing auth session\n')
        return
      }
    } catch { /* ignore invalid state file */ }
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const creds = CREDENTIALS.superadmin

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      console.log(`  Login attempt ${attempt + 1} as ${creds.email}...`)

      await page.goto(`${FRONTEND_URL}/en/login`)
      await page.waitForLoadState('networkidle')

      await page.fill('input[type="email"]', creds.email)
      await page.fill('input[type="password"]', creds.password)
      await page.click('button[type="submit"]')

      // Wait for navigation to dashboard
      await page.waitForURL('**/en/dashboard', { timeout: 25000 })
      await page.waitForLoadState('networkidle')

      // Save storage state
      await context.storageState({ path: STORAGE_PATH })
      console.log('  ✓ Authenticated as superadmin')
      console.log('=== Setup complete ===\n')

      await browser.close()
      return
    } catch (error: any) {
      const message = error.message || String(error)
      console.warn(`  ✗ Attempt ${attempt + 1} failed: ${message.slice(0, 100)}`)

      // Check if rate-limited
      const currentUrl = page.url()
      if (currentUrl.includes('/login')) {
        const errorText = await page.locator('.bg-red-50.text-red-600').textContent().catch(() => '')
        console.warn(`  Error banner: ${errorText}`)
      }

      if (attempt < 9) {
        const waitTime = Math.min(60, 15 + attempt * 10)
        console.log(`  Waiting ${waitTime}s before retry...`)
        await new Promise(r => setTimeout(r, waitTime * 1000))
      }
    }
  }

  console.error('  ✗ Failed to authenticate after 10 attempts')
  console.log('=== Setup failed - tests requiring auth will fail ===\n')
  await browser.close()
}

export default globalSetup
