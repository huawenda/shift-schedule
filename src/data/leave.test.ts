import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEAVE_DURATION,
  isLeaveDuration,
  leaveHoursOf,
  sanitizeLeave
} from './leave'

describe('事假时长折算', () => {
  it('4h 折算 4 小时、8h 折算 8 小时', () => {
    expect(leaveHoursOf('4h')).toBe(4)
    expect(leaveHoursOf('8h')).toBe(8)
  })

  it('没记时长时按一天算（8h，与 web 的 `?? 一天` 一致）', () => {
    expect(leaveHoursOf(undefined)).toBe(8)
    expect(DEFAULT_LEAVE_DURATION).toBe('8h')
  })

  it('只认 4h / 8h 这两个值', () => {
    expect(isLeaveDuration('4h')).toBe(true)
    expect(isLeaveDuration('8h')).toBe(true)
    expect(isLeaveDuration('6h')).toBe(false)
    expect(isLeaveDuration(4)).toBe(false)
    expect(isLeaveDuration(undefined)).toBe(false)
  })
})

describe('事假时长的净化', () => {
  it('事假没填时长 → 补默认值 8h', () => {
    expect(sanitizeLeave('事假', undefined)).toBe('8h')
  })

  it('事假填了非法值 → 也收敛成 8h', () => {
    expect(sanitizeLeave('事假', '两周')).toBe('8h')
  })

  it('事假填了合法值 → 原样保留', () => {
    expect(sanitizeLeave('事假', '4h')).toBe('4h')
    expect(sanitizeLeave('事假', '8h')).toBe('8h')
  })

  it('非事假一律清空 —— 不留「白班 + 4h 事假」这种脏数据', () => {
    expect(sanitizeLeave('白班', '4h')).toBe(undefined)
    expect(sanitizeLeave('休息', '8h')).toBe(undefined)
    expect(sanitizeLeave('夜特', '4h')).toBe(undefined)
  })
})
