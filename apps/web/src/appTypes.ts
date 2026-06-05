import type { LeaveDuration, SalaryInputValues, ShiftType } from '@shift-schedule/core'

export type AuthMode = 'login' | 'register'
export type StatsViewMode = 'personal' | 'team'
export type SalaryInputField = keyof SalaryInputValues
export type SalarySaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface ShiftEditorState {
  personName: string
  date: string
  baseShift: ShiftType
  selectedShift: ShiftType | 'default'
  overtimeInput: string
  isLegal: boolean
  leaveDuration: LeaveDuration
}
