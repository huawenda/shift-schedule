import { describe, expect, it } from 'vitest'
import { canMarkLegalShift, normalizeLegalOverride } from './legalOvertime'

describe('legal overtime shift rules', () => {
  it('allows legal marking only when the effective shift is not rest', () => {
    expect(canMarkLegalShift('白班')).toBe(true)
    expect(canMarkLegalShift('夜班')).toBe(true)
    expect(canMarkLegalShift('白特')).toBe(true)
    expect(canMarkLegalShift('夜特')).toBe(true)
    expect(canMarkLegalShift('休息')).toBe(false)
    expect(canMarkLegalShift('事假')).toBe(false)
  })

  it('clears legal marking when the effective shift is rest or leave', () => {
    expect(normalizeLegalOverride('白班', true)).toBe(true)
    expect(normalizeLegalOverride('休息', true)).toBe(false)
    expect(normalizeLegalOverride('事假', true)).toBe(false)
    expect(normalizeLegalOverride('夜班', false)).toBe(false)
  })
})
