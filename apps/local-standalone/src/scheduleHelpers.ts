import {
  getOvertimeChartItems,
  getOverrideKey,
  scheduleData,
  type ShiftType
} from '@local/core'
import type { CloudDayRecord, DayOverrides } from './services/dayRecords'
import type { ShiftEditorState } from './appTypes'

/** 班次 → 新视觉体系的类名（s-day / s-night / …），日历、矩阵、图例共用 */
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

/** 旧名保留，老代码继续可用 */
export const getShiftClassName = getShiftClass

export function getBaseShift(personName: string, date: string): ShiftType | null {
  const person = scheduleData.people.find(item => item.name === personName)
  const dateIndex = scheduleData.dates.indexOf(date)
  if (!person || dateIndex < 0) return null

  return person.shifts[dateIndex]
}

export function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/* 金额/日期一律走 Intl：原版用 toFixed(2) 硬编码，
   ¥12845.50 没有千分位，中文语境下也不好读。 */
const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatMoney(value: number): string {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatMoneyShort(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
