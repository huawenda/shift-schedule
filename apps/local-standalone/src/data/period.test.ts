import { describe, expect, it } from 'vitest'
import {
  compareMonth,
  currentMonthKey,
  formatPeriodRange,
  getPeriod,
  monthKeyToString,
  parseMonthKey,
  shiftMonth
} from './period'

describe('period', () => {
  it('结算月是上月 20 日到本月 19 日；长度 30 或 31 天，取决于月份', () => {
    const period = getPeriod({ year: 2026, month: 10 })
    expect(period.startDate).toBe('2026-09-20')
    expect(period.endDate).toBe('2026-10-19')
    // 9 月 20–30 共 11 天 + 10 月 1–19 共 19 天
    expect(period.dates).toHaveLength(30)
    expect(period.dates[0]).toBe('2026-09-20')
    expect(period.dates[29]).toBe('2026-10-19')
  })

  it('1 月要跨年回到上一年 12 月', () => {
    const period = getPeriod({ year: 2026, month: 1 })
    expect(period.startDate).toBe('2025-12-20')
    expect(period.endDate).toBe('2026-01-19')
    // 12 月 20–31 共 12 天 + 1 月 1–19 共 19 天
    expect(period.dates).toHaveLength(31)
  })

  it('2 月期间也不受自然月天数影响', () => {
    const period = getPeriod({ year: 2027, month: 2 })
    expect(period.startDate).toBe('2027-01-20')
    expect(period.endDate).toBe('2027-02-19')
    expect(period.dates).toHaveLength(31)
  })

  it('今天 19 日属于本月，20 日属于下个月', () => {
    expect(currentMonthKey(new Date(2026, 9, 19))).toEqual({ year: 2026, month: 10 })
    expect(currentMonthKey(new Date(2026, 9, 20))).toEqual({ year: 2026, month: 11 })
  })

  it('12 月 20 日进入次年 1 月', () => {
    expect(currentMonthKey(new Date(2026, 11, 20))).toEqual({ year: 2027, month: 1 })
  })

  it('月份可以无限前后翻，跨年正确', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10 })
    expect(shiftMonth({ year: 2026, month: 10 }, -21)).toEqual({ year: 2025, month: 1 })
  })

  it('月键与月份比较', () => {
    expect(monthKeyToString({ year: 2026, month: 5 })).toBe('2026-05')
    expect(parseMonthKey('2026-05')).toEqual({ year: 2026, month: 5 })
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('abc')).toBeNull()
    expect(compareMonth({ year: 2026, month: 10 }, { year: 2026, month: 9 })).toBe(1)
  })

  it('周期文案', () => {
    expect(formatPeriodRange(getPeriod({ year: 2026, month: 10 }))).toBe('9月20日 — 10月19日')
    expect(formatPeriodRange(getPeriod({ year: 2026, month: 1 }))).toBe('12月20日 — 1月19日')
  })
})
