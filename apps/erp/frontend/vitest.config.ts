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
    // Force the React *development* build: React's CJS entrypoint picks
    // react.development.js vs react.production.min.js off NODE_ENV at require
    // time, and @testing-library/react's act() throws in the production build.
    // Without this, an inherited NODE_ENV=production silently breaks every
    // component test.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
})
