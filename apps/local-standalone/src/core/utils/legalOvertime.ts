import type { ShiftType } from '../types/schedule'

export function canMarkLegalShift(shift: ShiftType): boolean {
  return shift !== '休息' && shift !== '事假'
}

export function normalizeLegalOverride(shift: ShiftType, isLegal: boolean): boolean {
  return canMarkLegalShift(shift) && isLegal
}
