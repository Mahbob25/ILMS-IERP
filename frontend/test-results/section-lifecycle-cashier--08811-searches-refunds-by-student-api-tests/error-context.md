# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: section-lifecycle\cashier-dashboard.spec.ts >> Cashier Dashboard - Section Lifecycle >> cashier_searches_refunds_by_student
- Location: tests\e2e\section-lifecycle\cashier-dashboard.spec.ts:21:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { authHeader, ensureAuthHeader } from '../fixtures/tokens'
  3  | 
  4  | const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/api/v1'
  5  | 
  6  | test.describe('Cashier Dashboard - Section Lifecycle', () => {
  7  |   const headers = authHeader('superadmin')
  8  | 
  9  |   test('cashier_views_pending_refunds', async ({ request }) => {
  10 |     const response = await request.get(`${BASE_URL}/lms/cashier/pending-refunds`, { headers })
  11 |     expect(response.status()).toBe(200)
  12 | 
  13 |     const body = await response.json()
  14 |     expect(body).toHaveProperty('data')
  15 |     expect(body).toHaveProperty('meta')
  16 |     expect(body.meta).toHaveProperty('total')
  17 |     expect(body.meta).toHaveProperty('page')
  18 |     expect(body.meta).toHaveProperty('per_page')
  19 |   })
  20 | 
  21 |   test('cashier_searches_refunds_by_student', async ({ request }) => {
  22 |     const response = await request.get(`${BASE_URL}/lms/cashier/pending-refunds?search=Test`, { headers })
> 23 |     expect(response.status()).toBe(200)
     |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  24 | 
  25 |     const body = await response.json()
  26 |     expect(body).toHaveProperty('data')
  27 |     expect(Array.isArray(body.data)).toBe(true)
  28 |   })
  29 | 
  30 |   test('cashier_disburses_refund', async ({ request }) => {
  31 |     const pendingRes = await request.get(`${BASE_URL}/lms/cashier/pending-refunds?status=UNCLAIMED&per_page=1`, { headers })
  32 |     if (pendingRes.status() !== 200) {
  33 |       test.skip(true, 'Could not fetch pending refunds')
  34 |       return
  35 |     }
  36 | 
  37 |     const pendingBody = await pendingRes.json()
  38 |     if (!pendingBody.data || pendingBody.data.length === 0) {
  39 |       test.skip(true, 'No pending refunds available to disburse')
  40 |       return
  41 |     }
  42 | 
  43 |     const pendingRefund = pendingBody.data[0]
  44 | 
  45 |     const disburseRes = await request.post(
  46 |       `${BASE_URL}/lms/cashier/pending-refunds/${pendingRefund.id}/disburse`,
  47 |       { headers, data: { notes: 'E2E test disbursement' } },
  48 |     )
  49 |     expect([200, 201, 400, 409]).toContain(disburseRes.status())
  50 | 
  51 |     if (disburseRes.status() === 201 || disburseRes.status() === 200) {
  52 |       const refund = await disburseRes.json()
  53 |       expect(refund).toHaveProperty('receipt_number')
  54 |       expect(refund.receipt_number).toMatch(/^RFD-\d{8}-\d{4}$/)
  55 |       expect(refund).toHaveProperty('amount')
  56 |     }
  57 |   })
  58 | 
  59 |   test('cashier_prints_receipt', async ({ request }) => {
  60 |     const historyRes = await request.get(`${BASE_URL}/lms/cashier/refunds?per_page=1`, { headers })
  61 |     if (historyRes.status() !== 200) {
  62 |       test.skip(true, 'Could not fetch refund history')
  63 |       return
  64 |     }
  65 | 
  66 |     const historyBody = await historyRes.json()
  67 |     if (!historyBody.data || historyBody.data.length === 0) {
  68 |       test.skip(true, 'No refund history available for receipt check')
  69 |       return
  70 |     }
  71 | 
  72 |     const refund = historyBody.data[0]
  73 |     expect(refund).toHaveProperty('receipt_number')
  74 |     expect(refund).toHaveProperty('amount')
  75 |     expect(refund).toHaveProperty('disbursed_at')
  76 |     expect(refund).toHaveProperty('pending_refund')
  77 |   })
  78 | 
  79 |   test('cashier_views_history', async ({ request }) => {
  80 |     const response = await request.get(`${BASE_URL}/lms/cashier/refunds`, { headers })
  81 |     expect(response.status()).toBe(200)
  82 | 
  83 |     const body = await response.json()
  84 |     expect(body).toHaveProperty('data')
  85 |     expect(body).toHaveProperty('meta')
  86 |     expect(Array.isArray(body.data)).toBe(true)
  87 |   })
  88 | })
  89 | 
```