import {
  getOvertimeChartItems,
  getOverrideKey,
  scheduleData,
  type ShiftType
} from '@shift-schedule/core'
import type { CloudDayRecord, CloudOverrides } from './services/cloudRecords'
import type { ShiftEditorState } from './appTypes'

export function getShiftClass(shift: ShiftType): string {
  return {
    白班: 's-day',
    夜班: 's-night',
    休息: 's-rest',
    白特: 's-dayx',
    夜特: 's-nightx',
    事假: 's-leave'
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

export function applyRecordToOverrides(overrides: CloudOverrides, record: CloudDayRecord, baseShift: ShiftType): CloudOverrides {
  const key = getOverrideKey(record.personName, record.date)
  const nextOverrides: CloudOverrides = {
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

export function deleteRecordFromOverrides(overrides: CloudOverrides, personName: string, date: string): CloudOverrides {
  const key = getOverrideKey(personName, date)
  const nextOverrides: CloudOverrides = {
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
