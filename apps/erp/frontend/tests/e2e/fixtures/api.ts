/**
 * Shared API test utilities with token caching to avoid rate limiting.
 */

import { test as base, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

// Global token cache to avoid hitting rate limits
const tokenCache: Record<string, { token: string; expiry: number }> = {}

export const CREDENTIALS = {
  superadmin: { email: 'superadmin@aldrasat.com', password: 'admin123' },
  manager: { email: 'manager@aldrasat.com', password: 'manager123' },
  secretary: { email: 'secretary@aldrasat.com', password: 'secretary123' },
  teacher: { email: 'teacher@aldrasat.com', password: 'teacher123' },
} as const

export type Role = keyof typeof CREDENTIALS

/**
 * Login and get access token with caching.
 * Uses built-in fetch to avoid Playwright fixture dependency.
 */
async function loginAs(
  email: string,
  password: string
): Promise<string> {
  const cacheKey = `${email}:${password}`

  // Return cached token if still valid (tokens expire in 15 min)
  const cached = tokenCache[cacheKey]
  if (cached && cached.expiry > Date.now()) {
    return cached.token
  }

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (response.status === 429) {
    // Rate limited - wait and retry
    console.warn('Rate limited, waiting 3 seconds...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    return loginAs(email, password)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Login failed (${response.status}): ${body}`)
  }

  const cookies = response.headers.get('set-cookie') || ''
  const accessToken = cookies.match(/access_token=([^;]+)/)?.[1] || ''

  if (!accessToken) {
    throw new Error('No access token received')
  }

  // Cache for 10 minutes (tokens expire in 15 min)
  tokenCache[cacheKey] = {
    token: accessToken,
    expiry: Date.now() + 10 * 60 * 1000,
  }

  return accessToken
}

// Pre-authenticated credentials for tests
export const TEST_USERS = {
  superadmin: () => loginAs('superadmin@aldrasat.com', 'admin123'),
  manager: () => loginAs('manager@aldrasat.com', 'manager123'),
  secretary: () => loginAs('secretary@aldrasat.com', 'secretary123'),
  teacher: () => loginAs('teacher@aldrasat.com', 'teacher123'),
}

export const API_BASE = BASE_URL
export { loginAs }
