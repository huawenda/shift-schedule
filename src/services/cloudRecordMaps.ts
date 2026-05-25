import type { ShiftType } from '../types/schedule'
import { normalizeOvertimeHours } from '../utils/schedule'

const editableShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特']

export type ShiftOverrides = Record<string, ShiftType>
export type OvertimeOverrides = Record<string, number>

export interface CloudDayRecord {
  _id?: string
  personName: string
  date: string
  shiftOverride?: ShiftType
  overtimeHours?: number
  updatedAt?: number
}

export function getOverrideKey(personName: string, date: string): string {
  return `${personName}::${date}`
}

function splitOverrideKey(key: string): { personName: string; date: string } | null {
  const [personName, date, ...rest] = key.split('::')
  if (!personName || !date || rest.length > 0) return null

  return { personName, date }
}

export function isShiftType(value: unknown): value is ShiftType {
  return editableShiftOptions.includes(value as ShiftType)
}

export function isCloudDayRecord(value: unknown): value is CloudDayRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  return typeof record.personName === 'string' && typeof record.date === 'string'
}

export function cloudRecordsToOverrides(records: unknown[]): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
} {
  return records.reduce<{
    shiftOverrides: ShiftOverrides
    overtimeOverrides: OvertimeOverrides
  }>(
    (result, record) => {
      if (!isCloudDayRecord(record)) return result

      const key = getOverrideKey(record.personName, record.date)
      if (isShiftType(record.shiftOverride)) {
        result.shiftOverrides[key] = record.shiftOverride
      }

      const overtimeHours = normalizeOvertimeHours(record.overtimeHours ?? 0)
      if (overtimeHours > 0) {
        result.overtimeOverrides[key] = overtimeHours
      }

      return result
    },
    { shiftOverrides: {}, overtimeOverrides: {} }
  )
}

export function buildCloudDayRecords(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides
): CloudDayRecord[] {
  const keys = Array.from(new Set([
    ...Object.keys(shiftOverrides),
    ...Object.keys(overtimeOverrides)
  ])).sort()

  return keys.reduce<CloudDayRecord[]>((records, key) => {
    const keyParts = splitOverrideKey(key)
    if (!keyParts) return records

    const shiftOverride = shiftOverrides[key]
    const overtimeHours = normalizeOvertimeHours(overtimeOverrides[key] ?? 0)
    if (!isShiftType(shiftOverride) && overtimeHours <= 0) return records

    records.push({
      ...keyParts,
      ...(isShiftType(shiftOverride) ? { shiftOverride } : {}),
      overtimeHours
    })
    return records
  }, [])
}
