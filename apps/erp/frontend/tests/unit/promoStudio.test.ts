import { describe, test, expect } from 'vitest'
import {
  LIMITS, blankPayload, countChars, defaultPayloadForProgram,
  overLimit, validatePayload,
} from '@/lib/promo'

describe('promo char counting', () => {
  test('counts unicode chars not utf16 units', () => {
    expect(countChars('ت'.repeat(24))).toBe(24)
    expect(countChars('👨‍👩‍👧')).toBeLessThanOrEqual(5)
  })

  test('overLimit boundary', () => {
    expect(overLimit('x'.repeat(LIMITS.heroL1), LIMITS.heroL1)).toBe(false)
    expect(overLimit('x'.repeat(LIMITS.heroL1 + 1), LIMITS.heroL1)).toBe(true)
  })
})

describe('validatePayload', () => {
  test('accepts a valid payload', () => {
    const p = blankPayload('ar')
    expect(validatePayload(p)).toEqual({})
  })

  test('rejects empty hero lines and cta', () => {
    const p = { ...blankPayload('en'), heroL1: '', cta: '  ' }
    const errors = validatePayload(p)
    expect(errors.heroL1).toBe('required')
    expect(errors.cta).toBe('required')
  })

  test('rejects over-max hero and cta', () => {
    const p = {
      ...blankPayload('en'),
      heroL1: 'x'.repeat(LIMITS.heroL1 + 1),
      cta: 'y'.repeat(LIMITS.cta + 1),
    }
    const errors = validatePayload(p)
    expect(errors.heroL1).toContain('max')
    expect(errors.cta).toContain('max')
  })

  test('caps rows/cards/stats arrays', () => {
    const base = blankPayload('en')
    const manyRows = { ...base, rows: [base.rows[0], base.rows[0], base.rows[0], base.rows[0]] }
    expect(validatePayload(manyRows).rows).toContain('max 3')
    const manyCards = { ...base, cards: [base.cards[0], base.cards[0], base.cards[0], base.cards[0], base.cards[0]] }
    expect(validatePayload(manyCards).cards).toContain('max 4')
  })

  test('flags long row titles and card names', () => {
    const base = blankPayload('en')
    const bad = {
      ...base,
      rows: [{ time: '08', title: 't'.repeat(LIMITS.rowTitle + 1), meta: '' }],
      cards: [{ tag: 'T', name: 'n'.repeat(LIMITS.cardName + 1), badge: '', desc: 'd'.repeat(LIMITS.cardDesc + 1), seats: '' }],
    }
    const errors = validatePayload(bad)
    expect(errors['rows.0.title']).toContain('max')
    expect(errors['cards.0.name']).toContain('max')
    expect(errors['cards.0.desc']).toContain('max')
  })
})

describe('defaultPayloadForProgram', () => {
  test('prefills hero from program and locale', () => {
    const ar = defaultPayloadForProgram({ id: 'computing', k: 'الحوسبة', meta: '12 مساقًا', seats: '5' }, 'ar')
    expect(ar.heroL1.length).toBeGreaterThan(0)
    expect(ar.program_slug).toBe('computing')
    expect(ar.custom_course).toBe(false)
    const en = defaultPayloadForProgram({ id: 'x', k: 'K' }, 'en')
    expect(en.heroL1).toBe('Learn it')
  })

  test('truncates long CMS strings to template geometry', () => {
    const p = defaultPayloadForProgram({ id: 'x', k: 'K'.repeat(100), d: 'D'.repeat(200) }, 'en')
    expect(p.cards[0].name.length).toBeLessThanOrEqual(LIMITS.cardName)
    expect(p.cards[0].desc.length).toBeLessThanOrEqual(LIMITS.cardDesc)
  })
})
