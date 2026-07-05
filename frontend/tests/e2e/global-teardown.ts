/**
 * Global teardown: Clean up auth tokens file.
 */
import fs from 'fs'
import path from 'path'

async function globalTeardown() {
  const tokenFile = path.join(__dirname, '.auth-tokens.json')
  try {
    if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile)
      console.log('✓ Auth tokens cleaned up')
    }
  } catch (err) {
    console.warn('Failed to clean up auth tokens:', err)
  }
}

export default globalTeardown
