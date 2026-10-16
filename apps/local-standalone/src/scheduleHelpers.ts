import {
  getOvertimeChartItems,
  getOverrideKey,
  scheduleData,
  type ShiftType
} from '@local/core'
import type { CloudDayRecord, DayOverrides } from './services/dayRecords'
import type { ShiftEditorState } from './appTypes'

export function getShiftClassName(shift: ShiftType): string {
  return {
    白班: 'shift-day',
    夜班: 'shift-night',
    休息: 'shift-rest',
    白特: 'shift-special-day',
    夜特: 'shift-special-night',
    事假: 'shift-leave'
  }[shift]
}

export function getBaseShift(personName: string, date: string): ShiftType | null {
  const person = scheduleData.people.find(item => item.name === personName)
  const dateIndex = scheduleData.dates.indexOf(date)
  if (!person || dateIndex < 0) return null

  return person.shifts[dateIndex]
}

export function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

export function canRecordOvertime(shift: ShiftType): boolean {
  return shift !== '休息' && shift !== '事假'
}

export function getOvertimeHoursByType(items: ReturnType<typeof getOvertimeChartItems>, type: '平日' | '特勤' | '法定'): number {
  return items.find(item => item.type === type)?.hours ?? 0
}

export function getEditorEffectiveShift(editor: ShiftEditorState): ShiftType {
  return editor.selectedShift === 'default' ? editor.baseShift : editor.selectedShift
}

export function applyRecordToOverrides(overrides: DayOverrides, record: CloudDayRecord, baseShift: ShiftType): DayOverrides {
  const key = getOverrideKey(record.personName, record.date)
  const nextOverrides: DayOverrides = {
    shiftOverrides: { ...overrides.shiftOverrides },
    overtimeOverrides: { ...overrides.overtimeOverrides },
    legalOverrides: { ...overrides.legalOverrides },
    leaveDurationOverrides: { ...overrides.leaveDurationOverrides }
  }

  if (record.shiftOverride && record.shiftOverride !== baseShift) {
    nextOverrides.shiftOverrides[key] = record.shiftOverride
  } else {
    delete nextOverrides.shiftOverrides[key]
  }

  if ((record.overtimeHours ?? 0) > 0) {
    nextOverrides.overtimeOverrides[key] = record.overtimeHours ?? 0
  } else {
    delete nextOverrides.overtimeOverrides[key]
  }

  if (record.isLegalOvertime === true) {
    nextOverrides.legalOverrides[key] = true
  } else {
    delete nextOverrides.legalOverrides[key]
  }

  if (record.shiftOverride === '事假' && record.leaveDuration) {
    nextOverrides.leaveDurationOverrides[key] = record.leaveDuration
  } else {
    delete nextOverrides.leaveDurationOverrides[key]
  }

  return nextOverrides
}

export function deleteRecordFromOverrides(overrides: DayOverrides, personName: string, date: string): DayOverrides {
  const key = getOverrideKey(personName, date)
  const nextOverrides: DayOverrides = {
    shiftOverrides: { ...overrides.shiftOverrides },
    overtimeOverrides: { ...overrides.overtimeOverrides },
    legalOverrides: { ...overrides.legalOverrides },
    leaveDurationOverrides: { ...overrides.leaveDurationOverrides }
  }

  delete nextOverrides.shiftOverrides[key]
  delete nextOverrides.overtimeOverrides[key]
  delete nextOverrides.legalOverrides[key]
  delete nextOverrides.leaveDurationOverrides[key]
  return nextOverrides
}
