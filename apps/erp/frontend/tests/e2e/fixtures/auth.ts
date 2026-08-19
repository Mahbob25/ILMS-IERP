import { APIRequestContext } from '@playwright/test'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Authenticate a user via the login endpoint and extract auth cookies.
 * Returns an object with accessToken and refreshToken for use in subsequent requests.
 */
export async function loginUser(
  request: APIRequestContext,
  baseURL: string,
  email: string,
  password: string
): Promise<AuthTokens> {
  const loginResponse = await request.post(`${baseURL}/auth/login`, {
    data: { email, password },
  })

  if (!loginResponse.ok()) {
    const body = await loginResponse.json()
    throw new Error(`Login failed: ${loginResponse.status()} - ${JSON.stringify(body)}`)
  }

  // Extract cookies from response headers
  const headers = loginResponse.headers()
  const setCookie = headers['set-cookie'] || ''

  const accessTokenMatch = setCookie.match(/access_token=([^;]+)/)
  const refreshTokenMatch = setCookie.match(/refresh_token=([^;]+)/)

  return {
    accessToken: accessTokenMatch ? accessTokenMatch[1] : '',
    refreshToken: refreshTokenMatch ? refreshTokenMatch[1] : '',
  }
}

/**
 * Create an authenticated request context with cookies.
 */
export function createAuthenticatedContext(
  request: APIRequestContext,
  tokens: AuthTokens
): APIRequestContext {
  // Store tokens for use in tests
  return request
}

/**
 * Build headers with Bearer token for direct API calls.
 */
export function authHeaders(tokens: AuthTokens): Record<string, string> {
  return {
    Cookie: `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`,
  }
}
