import type { ShiftType } from '../types/schedule'

export function getEditableShiftOptionsForBase(baseShift: ShiftType): ShiftType[] {
  const options: ShiftType[] = (() => {
    if (baseShift === '休息') return ['白特', '夜特']
    if (baseShift === '白班' || baseShift === '夜班') return ['白班', '夜班', '事假']

    return [baseShift]
  })()

  return options.filter(shift => shift !== baseShift)
}

export function getOvertimePresetOptions(shift: ShiftType, isLegal: boolean): number[] {
  if (isLegal && (shift === '白班' || shift === '夜班' || shift === '白特' || shift === '夜特')) {
    return [10, 11, 11.5]
  }
  if (shift === '白特' || shift === '夜特') return [10, 11, 11.5]
  if (shift === '白班' || shift === '夜班') return [2, 3, 3.5]

  return []
}
