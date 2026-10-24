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

export type ShiftClassName =
  | 's-day'
  | 's-night'
  | 's-rest'
  | 's-dayx'
  | 's-nightx'
  | 's-leave'

const shiftClassMap: Record<ShiftType, ShiftClassName> = {
  白班: 's-day',
  夜班: 's-night',
  休息: 's-rest',
  白特: 's-dayx',
  夜特: 's-nightx',
  事假: 's-leave'
}

export function getShiftClass(shift: ShiftType): ShiftClassName {
  return shiftClassMap[shift] ?? 's-rest'
}

/** 浅底徽章类（m-*）：日历标记、矩阵标记、周条标记共用的「浅底 + 深字」呈现。
 *  实色（s-*）只用于色点 / 色条，不承载文字。 */
const markClassMap: Record<ShiftType, string> = {
  白班: 'm-day',
  夜班: 'm-night',
  休息: 'm-rest',
  白特: 'm-dayx',
  夜特: 'm-nightx',
  事假: 'm-leave'
}

export function getMarkClass(shift: ShiftType): string {
  return markClassMap[shift] ?? 'm-rest'
}

/** 值班牌「本月」小计的统计键（就是班次本身，Web 端不含「法定」）。 */
export type TallyKey = ShiftType

/** 值班牌「本月」小计的展示项（与 Web 端 ShiftPlaque.tsx 的 tallyOrder 逐项一致）。 */
export const tallyOrder: Array<{ key: TallyKey; label: string; shiftClass: ShiftClassName }> = [
  { key: '白班', label: '白班', shiftClass: 's-day' },
  { key: '夜班', label: '夜班', shiftClass: 's-night' },
  { key: '休息', label: '休', shiftClass: 's-rest' },
  { key: '白特', label: '白特', shiftClass: 's-dayx' },
  { key: '夜特', label: '夜特', shiftClass: 's-nightx' },
  { key: '事假', label: '事假', shiftClass: 's-leave' }
]