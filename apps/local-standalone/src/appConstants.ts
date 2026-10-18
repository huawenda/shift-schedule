import type { LeaveDuration, ScheduleMonth, ShiftType } from '@local/core'

export const defaultCurrentUserName = '华文达'

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
export const leaveDurationOptions: LeaveDuration[] = ['半天', '一天']

export const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 班次时段假设：早班 08:00 起 12 小时，夜班 20:00 起 12 小时。
 * 数据层只有「班次」没有时刻，需要调整只改这里。
 */
export const shiftWindows: Partial<Record<ShiftType, { startHour: number; hours: number }>> = {
  白班: { startHour: 8, hours: 12 },
  夜班: { startHour: 20, hours: 12 },
  白特: { startHour: 8, hours: 12 },
  夜特: { startHour: 20, hours: 12 }
}

/** 日历与图例里的班次简称 */
export const shiftInitial: Record<ShiftType, string> = {
  白班: '白',
  夜班: '夜',
  休息: '休',
  白特: '白特',
  夜特: '夜特',
  事假: '事假'
}

export const formatDateForDisplay = (date: string) => date.split('-').join('/')

/** '2026-10-20' → '10/20' */
export const formatShortDate = (date: string) => date.slice(5).replace('-', '/')
