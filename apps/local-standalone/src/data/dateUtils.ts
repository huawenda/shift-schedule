/**
 * 日期工具：全部以本地时区的日历日为准，键格式固定 'YYYY-MM-DD'。
 *
 * 不用 `new Date('2026-10-20')` —— 那会按 UTC 解析，在东八区会偏一天。
 */

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(date.getDate() + days)
  return next
}

/** b - a，按日历日计算；跨夏令时时也稳定（本地东八区无夏令时） */
export function daysBetween(a: string, b: string): number {
  const start = parseDateKey(a)
  const end = parseDateKey(b)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

/** '2026-10-20' → '10/20' */
export function formatMonthDay(key: string): string {
  return `${key.slice(5, 7)}/${key.slice(8, 10)}`
}

/** '2026-10-20' → '20' */
export function formatDayNumber(key: string): string {
  return key.slice(8, 10)
}

/**
 * '2026-11-20' → '2026年11月20日'
 *
 * 月与日不补零（`11月20日` 而不是 `11月20`）：这句话是给人读的
 * 「今天不在本期（2026年11月20日 - 2026年12月19日）范围内」，带「日」才念得通。
 */
export function formatChineseDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export function weekdayIndex(key: string): number {
  return parseDateKey(key).getDay()
}

export function weekdayLabel(key: string): string {
  return WEEKDAY_LABELS[weekdayIndex(key)]
}

/** 0 = 周日；是否周末（周六/周日） */
export function isWeekend(key: string): boolean {
  const day = weekdayIndex(key)
  return day === 0 || day === 6
}

export function todayKey(now: Date = new Date()): string {
  return formatDateKey(now)
}

export function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}
