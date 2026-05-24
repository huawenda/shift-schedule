import { describe, expect, it } from 'vitest'
import { getShiftClassName } from './shift'

describe('getShiftClassName', () => {
  it('maps regular and special shifts to tag classes', () => {
    expect(getShiftClassName('白班')).toBe('shift shift-day')
    expect(getShiftClassName('夜班')).toBe('shift shift-night')
    expect(getShiftClassName('休息')).toBe('shift shift-rest')
    expect(getShiftClassName('白特')).toBe('shift shift-special-day')
    expect(getShiftClassName('夜特')).toBe('shift shift-special-night')
  })
})
