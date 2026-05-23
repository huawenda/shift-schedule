import { describe, expect, it } from 'vitest'
import { getShiftClassName } from './shift'

describe('getShiftClassName', () => {
  it('maps day, night, and rest shifts to tag classes', () => {
    expect(getShiftClassName('白班')).toBe('shift shift-day')
    expect(getShiftClassName('夜班')).toBe('shift shift-night')
    expect(getShiftClassName('休息')).toBe('shift shift-rest')
  })
})
