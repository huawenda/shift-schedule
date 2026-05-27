import type { LeaveDuration, ShiftType } from '../types/schedule'
import { normalizeOvertimeHours } from '../utils/schedule'

const editableShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']
const leaveDurationOptions: LeaveDuration[] = ['半天', '一天']
const chinaTimezoneOffsetMs = 8 * 60 * 60 * 1000

export type ShiftOverrides = Record<string, ShiftType>
export type OvertimeOverrides = Record<string, number>
export type LegalOverrides = Record<string, boolean>
export type LeaveDurationOverrides = Record<string, LeaveDuration>

export interface CloudDayRecord {
  _id?: string
  personName: string
  date: string
  shiftOverride?: ShiftType
  overtimeHours?: number
  isLegalOvertime?: boolean
  leaveDuration?: LeaveDuration
  createdAt?: number
  createdAtText?: string
  updatedAt?: number
  updatedAtText?: string
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

export function isLeaveDuration(value: unknown): value is LeaveDuration {
  return leaveDurationOptions.includes(value as LeaveDuration)
}

export function isCloudDayRecord(value: unknown): value is CloudDayRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  return typeof record.personName === 'string' && typeof record.date === 'string'
}

function padTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatCloudTimestamp(timestamp: number): string {
  const date = new Date(timestamp + chinaTimezoneOffsetMs)
  return [
    date.getUTCFullYear(),
    padTimePart(date.getUTCMonth() + 1),
    padTimePart(date.getUTCDate())
  ].join('-') + ' ' + [
    padTimePart(date.getUTCHours()),
    padTimePart(date.getUTCMinutes()),
    padTimePart(date.getUTCSeconds())
  ].join(':')
}

export function hasCloudDayRecordChanged(
  existingRecord: CloudDayRecord,
  nextRecord: CloudDayRecord
): boolean {
  return (
    existingRecord.personName !== nextRecord.personName ||
    existingRecord.date !== nextRecord.date ||
    (isShiftType(existingRecord.shiftOverride) ? existingRecord.shiftOverride : null) !==
      (isShiftType(nextRecord.shiftOverride) ? nextRecord.shiftOverride : null) ||
    normalizeOvertimeHours(existingRecord.overtimeHours ?? 0) !== normalizeOvertimeHours(nextRecord.overtimeHours ?? 0) ||
    Boolean(existingRecord.isLegalOvertime) !== Boolean(nextRecord.isLegalOvertime) ||
    (isLeaveDuration(existingRecord.leaveDuration) ? existingRecord.leaveDuration : null) !==
      (isLeaveDuration(nextRecord.leaveDuration) ? nextRecord.leaveDuration : null)
  )
}

export function getDeletedCloudRecordKeys(
  existingRecords: CloudDayRecord[],
  nextRecords: CloudDayRecord[],
  deletedKeys: string[]
): string[] {
  const nextKeys = new Set(nextRecords.map(record => getOverrideKey(record.personName, record.date)))
  return existingRecords
    .map(record => getOverrideKey(record.personName, record.date))
    .filter(key => deletedKeys.includes(key) && !nextKeys.has(key))
}

export function cloudRecordsToOverrides(records: unknown[]): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
  leaveDurationOverrides: LeaveDurationOverrides
} {
  return records.reduce<{
    shiftOverrides: ShiftOverrides
    overtimeOverrides: OvertimeOverrides
    legalOverrides: LegalOverrides
    leaveDurationOverrides: LeaveDurationOverrides
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
      if (record.isLegalOvertime === true) {
        result.legalOverrides[key] = true
      }
      if (record.shiftOverride === '事假' && isLeaveDuration(record.leaveDuration)) {
        result.leaveDurationOverrides[key] = record.leaveDuration
      }

      return result
    },
    { shiftOverrides: {}, overtimeOverrides: {}, legalOverrides: {}, leaveDurationOverrides: {} }
  )
}

export function buildCloudDayRecords(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  legalOverrides: LegalOverrides = {},
  leaveDurationOverrides: LeaveDurationOverrides = {}
): CloudDayRecord[] {
  const keys = Array.from(new Set([
    ...Object.keys(shiftOverrides),
    ...Object.keys(overtimeOverrides),
    ...Object.keys(legalOverrides),
    ...Object.keys(leaveDurationOverrides)
  ])).sort()

  return keys.reduce<CloudDayRecord[]>((records, key) => {
    const keyParts = splitOverrideKey(key)
    if (!keyParts) return records

    const shiftOverride = shiftOverrides[key]
    const overtimeHours = normalizeOvertimeHours(overtimeOverrides[key] ?? 0)
    const isLegalOvertime = legalOverrides[key] === true
    const leaveDuration = shiftOverride === '事假' && isLeaveDuration(leaveDurationOverrides[key])
      ? leaveDurationOverrides[key]
      : null
    if (!isShiftType(shiftOverride) && overtimeHours <= 0 && !isLegalOvertime && !leaveDuration) return records

    records.push({
      ...keyParts,
      ...(isShiftType(shiftOverride) ? { shiftOverride } : {}),
      overtimeHours,
      ...(isLegalOvertime ? { isLegalOvertime } : {}),
      ...(leaveDuration ? { leaveDuration } : {})
    })
    return records
  }, [])
}
