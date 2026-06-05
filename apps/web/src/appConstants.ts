import type { LeaveDuration, ScheduleMonth, ShiftType } from '@shift-schedule/core'

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

export const formatDateForDisplay = (date: string) => date.split('-').join('/')
