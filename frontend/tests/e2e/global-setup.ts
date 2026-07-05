/**
 * Global setup: Authenticate all roles upfront to share tokens across tests.
 * This avoids rate limiting (3 req/min) during test execution.
 */
import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'
const TOKEN_FILE = path.join(__dirname, '.auth-tokens.json')

const ROLES = [
  { role: 'superadmin', email: 'superadmin@institute.dev', password: 'admin123' },
  { role: 'manager', email: 'manager@institute.dev', password: 'manager123' },
  { role: 'secretary', email: 'secretary@institute.dev', password: 'secretary123' },
  { role: 'teacher', email: 'teacher@institute.dev', password: 'teacher123' },
]

async function loginAs(email: string, password: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (response.status === 429) {
        const wait = 10 + attempt * 5
        console.log(`  Rate limited, waiting ${wait}s...`)
        await new Promise(r => setTimeout(r, wait * 1000))
        continue
      }

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`)
      }

      const cookies = response.headers.get('set-cookie') || ''
      const token = cookies.match(/access_token=([^;]+)/)?.[1] || ''
      if (!token) throw new Error('No access token')
      return token
    } catch (err) {
      if (attempt === 4) throw err
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  throw new Error('Failed to login')
}

async function globalSetup() {
  console.log('\n=== Global E2E Setup ===')

  const tokens: Record<string, string> = {}

  for (const { role, email, password } of ROLES) {
    console.log(`  Authenticating ${role}...`)
    try {
      tokens[role] = await loginAs(email, password)
      console.log(`  ✓ ${role} authenticated`)
      // Wait 22s between logins to stay under 3 req/min rate limit
      if (role !== 'teacher') {
        await new Promise(r => setTimeout(r, 22000))
      }
    } catch (err) {
      console.warn(`  ✗ ${role} auth failed (will login on-demand): ${err}`)
    }
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens))
  console.log('=== Setup complete ===\n')
}

export default globalSetup
