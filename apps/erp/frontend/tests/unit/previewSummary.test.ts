import { describe, test, expect } from 'vitest'
import { computePreviewSummary } from '@/components/wizards/student-enrollment/previewSummary'

describe('computePreviewSummary', () => {
  test('uses the section price when there is no override or discount', () => {
    const summary = computePreviewSummary({
      sectionPrice: 1000,
      discount: '',
      priceOverride: '',
    })
    expect(summary).toEqual({
      total_paid: 0,
      agreed_price: 1000,
      admin_discount: null,
      net_price: 1000,
      balance_remaining: 1000,
    })
  })

  test('applies the admin discount percentage on top of the base', () => {
    const summary = computePreviewSummary({
      sectionPrice: 1000,
      discount: '10',
      priceOverride: '',
    })
    expect(summary?.agreed_price).toBe(1000)
    expect(summary?.admin_discount).toBe(10)
    expect(summary?.net_price).toBe(900)
    expect(summary?.balance_remaining).toBe(900)
  })

  test('keeps a price override that is below the section price', () => {
    const summary = computePreviewSummary({
      sectionPrice: 1000,
      discount: '',
      priceOverride: '600',
    })
    expect(summary?.agreed_price).toBe(600)
    expect(summary?.net_price).toBe(600)
  })

  test('caps a price override at the section price (may only lower)', () => {
    const summary = computePreviewSummary({
      sectionPrice: 1000,
      discount: '',
      priceOverride: '1500',
    })
    expect(summary?.agreed_price).toBe(1000)
  })

  test('uses the override when the section has no price', () => {
    const summary = computePreviewSummary({
      sectionPrice: null,
      discount: '',
      priceOverride: '750',
    })
    expect(summary?.agreed_price).toBe(750)
  })

  test('returns null when there is no section price and no override', () => {
    expect(
      computePreviewSummary({ sectionPrice: null, discount: '', priceOverride: '' }),
    ).toBeNull()
    expect(
      computePreviewSummary({ sectionPrice: undefined, discount: '10', priceOverride: '' }),
    ).toBeNull()
  })

  test('combines a below-price override with a discount', () => {
    const summary = computePreviewSummary({
      sectionPrice: 1000,
      discount: '50',
      priceOverride: '800',
    })
    expect(summary?.agreed_price).toBe(800)
    expect(summary?.net_price).toBe(400)
  })
})
