import type { ShiftType } from './types/schedule'

export const defaultCurrentUserName = '华文达'

export type ScheduleMonth = '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'

export const monthOptions: Array<{ label: string; value: ScheduleMonth }> = [
  { label: '5月', value: '05' },
  { label: '6月', value: '06' },
  { label: '7月', value: '07' },
  { label: '8月', value: '08' },
  { label: '9月', value: '09' },
  { label: '10月', value: '10' },
  { label: '11月', value: '11' },
  { label: '12月', value: '12' }
]

export const shiftLabels: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']

export const leaveDurationOptions = ['半天', '一天'] as const

export const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

export interface ShiftWindow {
  startHour: number
  hours: number
}

export const shiftWindows: Partial<Record<ShiftType, ShiftWindow>> = {
  白班: { startHour: 8, hours: 12 },
  夜班: { startHour: 20, hours: 12 },
  白特: { startHour: 8, hours: 12 },
  夜特: { startHour: 20, hours: 12 }
}

export const shiftInitial: Record<ShiftType, string> = {
  白班: '白',
  夜班: '夜',
  休息: '休',
  白特: '白特',
  夜特: '夜特',
  事假: '事假'
}

export function formatShortDate(date: string): string {
  return date.slice(5).replace('-', '/')
}

export function formatDateForDisplay(date: string): string {
  return date.replace(/-/g, '/')
}

/** 班次磁贴类（t-*）：白板设计里班次的唯一呈现——色块上直接放字。
 *  白班黄贴配墨字，其余配白字；色彩是数据不是装饰。 */
const markClassMap: Record<ShiftType, string> = {
  白班: 't-day',
  夜班: 't-night',
  休息: 't-rest',
  白特: 't-dayx',
  夜特: 't-nightx',
  事假: 't-leave'
}

export function getMarkClass(shift: ShiftType): string {
  return markClassMap[shift] ?? 't-rest'
}

/** 值班牌「本月」小计的统计键（就是班次本身，Web 端不含「法定」）。 */
export type TallyKey = ShiftType

/** 值班牌「本月」小计的展示项（与 Web 端 ShiftPlaque.tsx 的 tallyOrder 逐项一致）。 */
export const tallyOrder: Array<{ key: TallyKey; label: string; shiftClass: string }> = [
  { key: '白班', label: '白班', shiftClass: 't-day' },
  { key: '夜班', label: '夜班', shiftClass: 't-night' },
  { key: '休息', label: '休', shiftClass: 't-rest' },
  { key: '白特', label: '白特', shiftClass: 't-dayx' },
  { key: '夜特', label: '夜特', shiftClass: 't-nightx' },
  { key: '事假', label: '事假', shiftClass: 't-leave' }
]