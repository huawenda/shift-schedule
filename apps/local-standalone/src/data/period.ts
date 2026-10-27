import { addDays, formatDateKey, parseDateKey } from './dateUtils'

/**
 * 结算月：**上月 20 日 ~ 本月 19 日**（固定，不提供配置）。
 *
 * 关键改动：不再像旧版那样把 2026-04-19 ~ 2026-12-19 全量展开成数组，
 * 而是给定一个月键，现算这 31 天。月份因此可以无限前后翻。
 */

export interface MonthKey {
  year: number
  /** 1-12，表示「结算月」而不是自然月 */
  month: number
}

export interface Period {
  key: string
  year: number
  month: number
  /** 上月 20 日 */
  startDate: string
  /** 本月 19 日 */
  endDate: string
  /** startDate ~ endDate，含首尾，通常 31 天 */
  dates: string[]
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.year === 'number' && Number.isInteger(record.year) && record.year >= 1970 && record.year <= 2200 &&
    typeof record.month === 'number' && Number.isInteger(record.month) && record.month >= 1 && record.month <= 12
  )
}

/** '2026-10' */
export function monthKeyToString(key: MonthKey): string {
  return `${key.year}-${String(key.month).padStart(2, '0')}`
}

export function parseMonthKey(text: string): MonthKey | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec(text.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const candidate = { year, month }
  return isMonthKey(candidate) ? candidate : null
}

export function getPeriod(key: MonthKey): Period {
  // month 是 1-12；上一月是 month-2（0 基），跨年由 Date 自己进位
  const start = new Date(key.year, key.month - 2, 20)
  const end = new Date(key.year, key.month - 1, 19)
  const startDate = formatDateKey(start)
  const endDate = formatDateKey(end)

  const dates: string[] = []
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    dates.push(formatDateKey(cursor))
  }

  return { key: monthKeyToString(key), year: key.year, month: key.month, startDate, endDate, dates }
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const index = key.year * 12 + (key.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function compareMonth(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month
}

/**
 * 今天属于哪个结算月：20 日及以后算下个月，否则算本月。
 * 例：2026-10-19 → 10 月；2026-10-20 → 11 月。
 */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (now.getDate() >= 20) {
    return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  }
  return { year, month }
}

/** '2026 年 10 月' */
export function formatMonthTitle(key: MonthKey): string {
  return `${key.year} 年 ${key.month} 月`
}

/** '9月20日 — 10月19日' */
export function formatPeriodRange(period: Period): string {
  const start = parseDateKey(period.startDate)
  const end = parseDateKey(period.endDate)
  return `${start.getMonth() + 1}月${start.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`
}
