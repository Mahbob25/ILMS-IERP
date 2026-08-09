import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit/integration test runner for pure logic + component behavior.
// E2E stays in Playwright (see playwright.config.browser.ts).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
})
