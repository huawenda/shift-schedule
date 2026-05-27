import type { ShiftType } from '../types/schedule'

export function getEditableShiftOptionsForBase(baseShift: ShiftType): ShiftType[] {
  if (baseShift === '休息') return ['白特', '夜特']
  if (baseShift === '白班' || baseShift === '夜班') return ['白班', '夜班', '事假']

  return [baseShift]
}
