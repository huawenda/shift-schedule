import { getOverrideKey, type OvertimeOverrides, type ShiftOverrides } from '../services/cloudRecordMaps'
import type { ScheduleData, ShiftType } from '../types/schedule'
import { getPersonShiftSummary, normalizeOvertimeHours, type ShiftSummary } from './schedule'

export interface DailyAttendanceRecord {
  date: string
  shift: ShiftType
  overtimeHours: number
}

export interface PersonMonthlyStats {
  personName: string
  group: string
  shiftSummary: ShiftSummary
  overtimeTotal: number
  dailyRecords: DailyAttendanceRecord[]
}

export function getPersonMonthlyStats(
  scheduleData: ScheduleData,
  personName: string,
  overtimeOverrides: OvertimeOverrides,
  shiftOverrides: ShiftOverrides = {}
): PersonMonthlyStats | null {
  const person = scheduleData.people.find(item => item.name === personName)
  if (!person) return null

  const dailyRecords = scheduleData.dates.map((date, index) => {
    const key = getOverrideKey(person.name, date)
    return {
      date,
      shift: shiftOverrides[key] ?? person.shifts[index],
      overtimeHours: normalizeOvertimeHours(overtimeOverrides[key] ?? 0)
    }
  })
  const shifts = dailyRecords.map(record => record.shift)
  const overtimeHours = dailyRecords.map(record => record.overtimeHours)
  const overtimeTotal = overtimeHours.reduce((total, hours) => total + hours, 0)

  return {
    personName: person.name,
    group: person.group,
    shiftSummary: getPersonShiftSummary({ ...person, shifts }, overtimeHours),
    overtimeTotal,
    dailyRecords
  }
}
