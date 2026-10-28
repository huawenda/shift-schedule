import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEAVE_DURATION,
  isLeaveDuration,
  leaveHoursOf,
  sanitizeLeave
} from './leave'

describe('事假时长折算', () => {
  it('半天 4 小时、一天 8 小时', () => {
    expect(leaveHoursOf('半天')).toBe(4)
    expect(leaveHoursOf('一天')).toBe(8)
  })

  it('没记时长时按一天算（与 web 的 `?? 一天` 一致）', () => {
    expect(leaveHoursOf(undefined)).toBe(8)
    expect(DEFAULT_LEAVE_DURATION).toBe('一天')
  })

  it('只认半天 / 一天这两个值', () => {
    expect(isLeaveDuration('半天')).toBe(true)
    expect(isLeaveDuration('一天')).toBe(true)
    expect(isLeaveDuration('两天')).toBe(false)
    expect(isLeaveDuration(4)).toBe(false)
    expect(isLeaveDuration(undefined)).toBe(false)
  })
})

describe('事假时长的净化', () => {
  it('事假没填时长 → 补默认值一天', () => {
    expect(sanitizeLeave('事假', undefined)).toBe('一天')
  })

  it('事假填了非法值 → 也收敛成一天', () => {
    expect(sanitizeLeave('事假', '两周')).toBe('一天')
  })

  it('事假填了合法值 → 原样保留', () => {
    expect(sanitizeLeave('事假', '半天')).toBe('半天')
    expect(sanitizeLeave('事假', '一天')).toBe('一天')
  })

  it('非事假一律清空 —— 不留「白班 + 半天事假」这种脏数据', () => {
    expect(sanitizeLeave('白班', '半天')).toBe(undefined)
    expect(sanitizeLeave('休息', '一天')).toBe(undefined)
    expect(sanitizeLeave('夜特', '半天')).toBe(undefined)
  })
})
