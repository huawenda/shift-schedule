import { describe, expect, it } from 'vitest'
import {
  buildCalendarGrid,
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
    expect(formatPeriodRange(getPeriod({ year: 2026, month: 10 }))).toBe('9月20日 - 10月19日')
    expect(formatPeriodRange(getPeriod({ year: 2026, month: 1 }))).toBe('12月20日 - 1月19日')
  })
})

describe('月历网格（周期外的日期补齐）', () => {
  it('2026 年 11 月期（10/20–11/19）：前导补 10/18–19，补尾补 11/20–21，共 35 格', () => {
    const cells = buildCalendarGrid(getPeriod({ year: 2026, month: 11 }))

    expect(cells).toHaveLength(35)
    // 2026-10-20 是周二，所以前面两格是周日 10/18、周一 10/19
    expect(cells.slice(0, 2)).toEqual([
      { key: 'lead-2', date: '2026-10-18', inPeriod: false },
      { key: 'lead-1', date: '2026-10-19', inPeriod: false }
    ])
    expect(cells[2]).toEqual({ key: '2026-10-20', date: '2026-10-20', inPeriod: true })
    expect(cells.slice(-2)).toEqual([
      { key: 'tail-1', date: '2026-11-20', inPeriod: false },
      { key: 'tail-2', date: '2026-11-21', inPeriod: false }
    ])
  })

  it('每期都铺成整 7 列，周期内的格子数与本期天数一致', () => {
    // 连查两年，覆盖所有「起始日落在星期几」的组合
    for (let month = 1; month <= 12; month += 1) {
      for (const year of [2026, 2027]) {
        const period = getPeriod({ year, month })
        const cells = buildCalendarGrid(period)
        expect(cells.length % 7).toBe(0)
        expect(cells.filter(cell => cell.inPeriod)).toHaveLength(period.dates.length)
        // 所有格子连起来是连续的一串日期，中间不缺天
        cells.slice(1).forEach((cell, index) => {
          const prev = new Date(cells[index].date)
          const next = new Date(cell.date)
          expect(Math.round((next.getTime() - prev.getTime()) / 86_400_000)).toBe(1)
        })
      }
    }
  })

  it('起始日正好是周日时没有前导格', () => {
    // 找一期 startDate 落在周日的，验证前导为空（不能凭月份假设）
    let found: ReturnType<typeof getPeriod> | null = null
    for (let month = 1; month <= 12 && !found; month += 1) {
      const period = getPeriod({ year: 2026, month })
      if (new Date(period.startDate).getDay() === 0) found = period
    }
    if (!found) throw new Error('2026 年应当有一期的起始日落在周日')
    const cells = buildCalendarGrid(found)
    expect(cells[0].inPeriod).toBe(true)
    expect(cells[0].date).toBe(found.startDate)
  })

  it('跨年期（12/20–1/19）的补尾会正确跨到下一年', () => {
    const cells = buildCalendarGrid(getPeriod({ year: 2027, month: 1 }))
    const last = cells[cells.length - 1]
    expect(last.inPeriod).toBe(false)
    expect(last.date.startsWith('2027-01')).toBe(true)
  })

  it('周期外的 key 不会和真实日期撞车', () => {
    const cells = buildCalendarGrid(getPeriod({ year: 2026, month: 10 }))
    const keys = cells.map(cell => cell.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
