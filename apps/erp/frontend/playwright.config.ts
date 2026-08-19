import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  reporter: [
    ['html', { outputFolder: '../../test-results/playwright-report' }],
    ['junit', { outputFile: '../../test-results/junit.xml' }],
    ['json', { outputFile: '../../test-results/results.json' }],
    ['list']
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8000/api/v1',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api-tests',
      testMatch: '**/*.spec.ts',
      dependencies: [],
    },
  ],
})
