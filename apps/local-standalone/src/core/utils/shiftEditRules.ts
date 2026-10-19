import type { ShiftType } from '../types/schedule'

const ALL_SHIFT_TYPES: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']

/** 改班弹层「修改为」的可选班次 = 全部班次中排除默认班次本身。
    保留 ShiftType 全集顺序，让任意班次都能改到任意其他班次。 */
export function getEditableShiftOptionsForBase(baseShift: ShiftType): ShiftType[] {
  return ALL_SHIFT_TYPES.filter(shift => shift !== baseShift)
}

export function getOvertimePresetOptions(shift: ShiftType, isLegal: boolean): number[] {
  if (isLegal && (shift === '白班' || shift === '夜班' || shift === '白特' || shift === '夜特')) {
    return [10, 11, 11.5]
  }
  if (shift === '白特' || shift === '夜特') return [10, 11, 11.5]
  if (shift === '白班' || shift === '夜班') return [2, 3, 3.5]

  return []
}
