import type { ShiftType } from '../types/schedule'

export function hasShiftOverrideChanged(baseShift: ShiftType, overrideShift?: ShiftType): boolean {
  return Boolean(overrideShift) && overrideShift !== baseShift
}

export function getShiftClassName(shift: ShiftType): string {
  if (shift === '白班') return 'shift shift-day'
  if (shift === '夜班') return 'shift shift-night'
  if (shift === '白特') return 'shift shift-special-day'
  if (shift === '夜特') return 'shift shift-special-night'
  if (shift === '事假') return 'shift shift-leave'
  return 'shift shift-rest'
}
