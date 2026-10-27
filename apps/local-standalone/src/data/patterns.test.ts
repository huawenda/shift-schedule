import { describe, expect, it } from 'vitest'
import {
  getPattern,
  getPatternShift,
  isPatternId,
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  PATTERN_IDS,
  PATTERNS
} from './patterns'
import { SHIFT_TYPES } from './shifts'

describe('patterns', () => {
  it('13 条班序，每条 24 天，班次合法', () => {
    expect(PATTERNS).toHaveLength(13)
    expect(PATTERN_IDS).toEqual(['4F', '4G', '4H', '4I', '4J', '4K', '4R', '4S', '4T', '4U', '4V', '4W', '4X'])

    PATTERNS.forEach(pattern => {
      expect(pattern.shifts).toHaveLength(PATTERN_CYCLE_LENGTH)
      pattern.shifts.forEach(shift => expect(SHIFT_TYPES).toContain(shift))
    })
  })

  it('每条班序都是 8 白 + 8 夜 + 8 休，不含特勤与事假', () => {
    PATTERNS.forEach(pattern => {
      const counts = pattern.shifts.reduce<Record<string, number>>((acc, shift) => {
        acc[shift] = (acc[shift] ?? 0) + 1
        return acc
      }, {})

      expect(counts['白班']).toBe(8)
      expect(counts['夜班']).toBe(8)
      expect(counts['休息']).toBe(8)
      expect(counts['白特']).toBeUndefined()
      expect(counts['夜特']).toBeUndefined()
      expect(counts['事假']).toBeUndefined()
    })
  })

  it('锚点日取序列第一位，24 天后回到同一位', () => {
    PATTERNS.forEach(pattern => {
      expect(getPatternShift(pattern.id, PATTERN_ANCHOR_DATE)).toBe(pattern.shifts[0])
      expect(getPatternShift(pattern.id, '2026-07-01')).toBe(pattern.shifts[0])
    })
  })

  it('锚点之前取正模（向后推算不越界）', () => {
    const pattern = getPattern('4F')!
    expect(getPatternShift('4F', '2026-06-06')).toBe(pattern.shifts[23])
    expect(getPatternShift('4F', '2026-06-05')).toBe(pattern.shifts[22])
  })

  it('能推到远期年份，不依赖任何预生成区间', () => {
    expect(getPatternShift('4F', '2030-01-01')).not.toBeNull()
    expect(getPatternShift('4F', '2020-01-01')).not.toBeNull()
  })

  it('未知班序返回 null，不做猜测', () => {
    expect(getPatternShift('9Z', '2026-10-20')).toBeNull()
    expect(isPatternId('4F')).toBe(true)
    expect(isPatternId('9Z')).toBe(false)
  })

  it('不同班序在同一天给出不同班次 —— 否则挂错模板不会被发现', () => {
    expect(getPatternShift('4F', PATTERN_ANCHOR_DATE)).toBe('夜班')
    expect(getPatternShift('4G', PATTERN_ANCHOR_DATE)).toBe('休息')
    expect(getPatternShift('4J', PATTERN_ANCHOR_DATE)).toBe('白班')
  })
})
