import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'
const TOKEN_FILE = path.join(__dirname, '..', '.auth-tokens.json')

const CREDENTIALS: Record<string, { email: string; password: string }> = {
  superadmin: { email: 'superadmin@aldrasat.com', password: 'admin123' },
  manager: { email: 'manager@aldrasat.com', password: 'manager123' },
  secretary: { email: 'secretary@aldrasat.com', password: 'secretary123' },
  teacher: { email: 'teacher@aldrasat.com', password: 'teacher123' },
}

const tokenCache: Record<string, { token: string; expiry: number }> = {}

function loadAllTokens(): Record<string, string> {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

async function loginOnDemand(role: string): Promise<string> {
  const creds = CREDENTIALS[role]
  if (!creds) throw new Error(`Unknown role: ${role}`)

  console.log(`  [auth] Logging in as ${role}...`)

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })

      if (response.status === 429) {
        const wait = 22
        console.log(`  [auth] Rate limited (${role}), waiting ${wait}s...`)
        await new Promise(r => setTimeout(r, wait * 1000))
        continue
      }

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`)
      }

      const cookies = response.headers.get('set-cookie') || ''
      const token = cookies.match(/access_token=([^;]+)/)?.[1] || ''
      if (!token) throw new Error('No access token')

      tokenCache[role] = { token, expiry: Date.now() + 10 * 60 * 1000 }
      console.log(`  [auth] ✓ ${role} authenticated`)
      return token
    } catch (err) {
      if (attempt === 9) throw err
      console.log(`  [auth] Retry ${attempt + 1} for ${role}: ${err}`)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  throw new Error(`Failed to authenticate ${role}`)
}

export function getToken(role: string): string {
  const cached = tokenCache[role]
  if (cached && cached.expiry > Date.now()) {
    return cached.token
  }

  const allTokens = loadAllTokens()
  const token = allTokens[role]
  if (token) {
    tokenCache[role] = { token, expiry: Date.now() + 10 * 60 * 1000 }
    return token
  }

  return ''
}

export function authHeader(role: string): Record<string, string> {
  const token = getToken(role)
  if (!token) return {}
  return { Cookie: `access_token=${token}` }
}

export async function ensureAuthHeader(role: string): Promise<Record<string, string>> {
  const existing = getToken(role)
  if (existing) return { Cookie: `access_token=${existing}` }

  const token = await loginOnDemand(role)
  return { Cookie: `access_token=${token}` }
}

export { loginOnDemand }
