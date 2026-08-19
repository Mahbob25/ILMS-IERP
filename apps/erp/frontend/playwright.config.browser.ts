import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1,
  globalSetup: require.resolve('./tests/e2e/browser/auth/global-auth-setup'),
  reporter: [
    ['html', { outputFolder: '../../test-results/playwright-report-browser' }],
    ['junit', { outputFile: '../../test-results/junit-browser.xml' }],
    ['json', { outputFile: '../../test-results/results-browser.json' }],
    ['list']
  ],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },

  expect: {
    timeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Authenticated tests will use this state
        storageState: './tests/e2e/browser/.browser-auth.json',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        storageState: './tests/e2e/browser/.browser-auth.json',
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: './tests/e2e/browser/.browser-auth.json',
      },
    },
  ],
})
