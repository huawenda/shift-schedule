import type { ShiftType } from '../types/schedule'

export function getShiftClassName(shift: ShiftType): string {
  if (shift === '白班') return 'shift shift-day'
  if (shift === '夜班') return 'shift shift-night'
  return 'shift shift-rest'
}
