import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'

test.describe('System Health', () => {
  test('should return health status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`)
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({
      status: 'ok',
      service: 'lims-api-server',
      version: '1.7',
    })
  })

  test('should reject invalid paths with 404', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/nonexistent`)
    expect(response.status()).toBe(404)
  })
})
