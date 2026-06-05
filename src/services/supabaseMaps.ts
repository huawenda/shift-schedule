import { emptySalaryInputs, type SalaryInputValues } from '../utils/salary'
import type { CloudDayRecord } from './cloudRecordMaps'
import { isLeaveDuration, isShiftType } from './cloudRecordMaps'
import { type SalaryInputRecords } from './salaryInputs'

export interface SupabaseDayRecordRow {
  id?: number | string
  person_name: string
  record_date: string
  shift_override: string | null
  overtime_hours: number | string | null
  is_legal_overtime: boolean | null
  leave_duration: string | null
  created_at_ms?: number | string | null
  created_at_text?: string | null
  updated_at_ms?: number | string | null
  updated_at_text?: string | null
}

export interface SupabaseShiftOverrideRow {
  id?: number | string
  person_name: string
  record_date: string
  shift_override: string | null
  created_at_ms?: number | string | null
  created_at_text?: string | null
  updated_at_ms?: number | string | null
  updated_at_text?: string | null
}

export interface SupabasePrivateDayRecordRow {
  id?: number | string
  person_name: string
  record_date: string
  overtime_hours: number | string | null
  is_legal_overtime: boolean | null
  leave_duration: string | null
  updated_at_ms?: number | string | null
  updated_at_text?: string | null
}

export interface SupabaseSalaryInputRow {
  person_name: string
  month: string
  base_salary: string | null
  performance_allowance: string | null
  position_allowance: string | null
  other_deductions: string | null
}

export function getCurrentUserAccountFilter(authUserId: string): { column: 'auth_user_id'; value: string } {
  if (!authUserId) throw new Error('Missing Supabase auth user id')

  return {
    column: 'auth_user_id',
    value: authUserId
  }
}

export function webUsernameToSupabaseEmail(username: string): string {
  const normalizedUsername = username.trim().toLowerCase()
  const asciiUsername = Array.from(normalizedUsername)
    .map(char => /^[a-z0-9]$/.test(char) ? char : `-${(char.codePointAt(0) || 0).toString(16)}`)
    .join('')
    .replace(/^-+/, 'u-')

  return `${asciiUsername}@shift-schedule.local`
}

export function supabaseDayRecordToCloudRecord(row: SupabaseDayRecordRow): CloudDayRecord {
  const shiftOverride = isShiftType(row.shift_override) ? row.shift_override : undefined
  const leaveDuration = isLeaveDuration(row.leave_duration) ? row.leave_duration : undefined

  return {
    ...(row.id === undefined ? {} : { _id: String(row.id) }),
    personName: row.person_name,
    date: row.record_date,
    ...(shiftOverride ? { shiftOverride } : {}),
    overtimeHours: Number(row.overtime_hours || 0),
    ...(row.is_legal_overtime === true ? { isLegalOvertime: true } : {}),
    ...(leaveDuration ? { leaveDuration } : {}),
    ...(row.created_at_ms == null ? {} : { createdAt: Number(row.created_at_ms) }),
    ...(row.created_at_text ? { createdAtText: row.created_at_text } : {}),
    ...(row.updated_at_ms == null ? {} : { updatedAt: Number(row.updated_at_ms) }),
    ...(row.updated_at_text ? { updatedAtText: row.updated_at_text } : {})
  }
}

export function cloudDayRecordToSupabaseRow(record: CloudDayRecord): SupabaseDayRecordRow {
  return {
    person_name: record.personName,
    record_date: record.date,
    shift_override: isShiftType(record.shiftOverride) ? record.shiftOverride : null,
    overtime_hours: Number(record.overtimeHours || 0),
    is_legal_overtime: record.isLegalOvertime === true,
    leave_duration: record.shiftOverride === '事假' && isLeaveDuration(record.leaveDuration)
      ? record.leaveDuration
      : null
  }
}

export function cloudDayRecordToSupabaseRows(record: CloudDayRecord): {
  shiftRow: SupabaseShiftOverrideRow | null
  privateRow: SupabasePrivateDayRecordRow | null
} {
  const shiftOverride = isShiftType(record.shiftOverride) ? record.shiftOverride : null
  const overtimeHours = Number(record.overtimeHours || 0)
  const isLegalOvertime = record.isLegalOvertime === true
  const leaveDuration = shiftOverride === '事假' && isLeaveDuration(record.leaveDuration)
    ? record.leaveDuration
    : null

  return {
    shiftRow: shiftOverride
      ? {
        person_name: record.personName,
        record_date: record.date,
        shift_override: shiftOverride
      }
      : null,
    privateRow: overtimeHours > 0 || isLegalOvertime || leaveDuration
      ? {
        person_name: record.personName,
        record_date: record.date,
        overtime_hours: overtimeHours,
        is_legal_overtime: isLegalOvertime,
        leave_duration: leaveDuration
      }
      : null
  }
}

export function mergeSupabaseDayRecordRows(
  shiftRows: SupabaseShiftOverrideRow[],
  privateRows: SupabasePrivateDayRecordRow[]
): CloudDayRecord[] {
  const recordsByKey = new Map<string, CloudDayRecord>()

  const getKey = (personName: string, date: string) => `${personName}::${date}`
  const upsertBaseRecord = (personName: string, date: string): CloudDayRecord => {
    const key = getKey(personName, date)
    const existingRecord = recordsByKey.get(key)
    if (existingRecord) return existingRecord

    const nextRecord: CloudDayRecord = { personName, date }
    recordsByKey.set(key, nextRecord)
    return nextRecord
  }

  shiftRows.forEach(row => {
    const record = upsertBaseRecord(row.person_name, row.record_date)
    const shiftOverride = isShiftType(row.shift_override) ? row.shift_override : undefined
    if (shiftOverride) record.shiftOverride = shiftOverride
    if (row.id !== undefined) record._id = `shift:${row.id}`
    if (row.created_at_ms != null) record.createdAt = Number(row.created_at_ms)
    if (row.created_at_text) record.createdAtText = row.created_at_text
    if (row.updated_at_ms != null) record.updatedAt = Number(row.updated_at_ms)
    if (row.updated_at_text) record.updatedAtText = row.updated_at_text
  })

  privateRows.forEach(row => {
    const record = upsertBaseRecord(row.person_name, row.record_date)
    const overtimeHours = Number(row.overtime_hours || 0)
    const leaveDuration = isLeaveDuration(row.leave_duration) ? row.leave_duration : undefined
    record.overtimeHours = overtimeHours
    if (row.is_legal_overtime === true) record.isLegalOvertime = true
    if (leaveDuration) record.leaveDuration = leaveDuration
    if (!record._id && row.id !== undefined) record._id = `private:${row.id}`
    if (row.updated_at_ms != null && record.updatedAt == null) record.updatedAt = Number(row.updated_at_ms)
    if (row.updated_at_text && !record.updatedAtText) record.updatedAtText = row.updated_at_text
  })

  return Array.from(recordsByKey.values())
    .filter(record => isShiftType(record.shiftOverride) || Number(record.overtimeHours || 0) > 0 || record.isLegalOvertime === true || isLeaveDuration(record.leaveDuration))
    .sort((left, right) => (
      left.personName.localeCompare(right.personName, 'zh-Hans-CN') ||
      left.date.localeCompare(right.date)
    ))
}

export function supabaseSalaryRowsToRecords(rows: SupabaseSalaryInputRow[]): SalaryInputRecords {
  return Object.fromEntries(rows.map(row => [
    `${row.person_name}::${row.month}`,
    {
      baseSalary: row.base_salary ?? emptySalaryInputs.baseSalary,
      performanceAllowance: row.performance_allowance ?? emptySalaryInputs.performanceAllowance,
      positionAllowance: row.position_allowance ?? emptySalaryInputs.positionAllowance,
      otherDeductions: row.other_deductions ?? emptySalaryInputs.otherDeductions
    }
  ]))
}

export function salaryEntryToSupabaseRow(key: string, values: SalaryInputValues): SupabaseSalaryInputRow | null {
  const [personName, month, ...rest] = key.split('::')
  if (!personName || !month || rest.length > 0) return null

  return {
    person_name: personName,
    month,
    base_salary: values.baseSalary,
    performance_allowance: values.performanceAllowance,
    position_allowance: values.positionAllowance,
    other_deductions: values.otherDeductions
  }
}
