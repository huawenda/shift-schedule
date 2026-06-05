import { getOverrideKey, type LeaveDurationOverrides, type LegalOverrides, type OvertimeOverrides, type ShiftOverrides } from '../services/cloudRecordMaps'
import type { LeaveDuration, ScheduleData, ShiftType } from '../types/schedule'
import { getPersonShiftSummary, normalizeOvertimeHours, type ShiftSummary } from './schedule'

export const overtimeChartTypeOrder = ['平日', '特勤', '法定'] as const
export type OvertimeChartType = typeof overtimeChartTypeOrder[number]

export interface DailyAttendanceRecord {
  date: string
  shift: ShiftType
  overtimeHours: number
  isLegal?: boolean
}

export interface OvertimeChartItem {
  type: OvertimeChartType
  hours: number
}

export interface PersonMonthlyStats {
  personName: string
  group: string
  shiftSummary: ShiftSummary
  leaveSummary: LeaveSummary
  overtimeTotal: number
  dailyRecords: DailyAttendanceRecord[]
}

export interface LeaveSummary {
  days: number
  hours: number
}

export interface PersonOvertimeStats {
  personName: string
  group: string
  weekdayHours: number
  specialHours: number
  legalHours: number
  totalHours: number
}

export interface RankedPersonOvertimeStats extends PersonOvertimeStats {
  rank: number
}

export interface AllPeopleMonthlyOvertimeStats {
  maxOvertime: number
  minOvertime: number
  averageOvertime: number
  people: PersonOvertimeStats[]
  ranking: RankedPersonOvertimeStats[]
}

export function getOvertimeChartItems(overtimeByShift: Partial<NonNullable<ShiftSummary['加班']>> = {}): OvertimeChartItem[] {
  return [
    {
      type: '平日',
      hours: normalizeOvertimeHours((overtimeByShift.白班 ?? 0) + (overtimeByShift.夜班 ?? 0))
    },
    {
      type: '特勤',
      hours: normalizeOvertimeHours((overtimeByShift.白特 ?? 0) + (overtimeByShift.夜特 ?? 0))
    },
    {
      type: '法定',
      hours: normalizeOvertimeHours(overtimeByShift.法定 ?? 0)
    }
  ]
}

export function getPersonMonthlyStats(
  scheduleData: ScheduleData,
  personName: string,
  overtimeOverrides: OvertimeOverrides,
  shiftOverrides: ShiftOverrides = {},
  legalOverrides?: LegalOverrides,
  leaveDurationOverrides: LeaveDurationOverrides = {}
): PersonMonthlyStats | null {
  const person = scheduleData.people.find(item => item.name === personName)
  if (!person) return null

  const dailyRecords = scheduleData.dates.map((date, index) => {
    const key = getOverrideKey(person.name, date)
    return {
      date,
      shift: shiftOverrides[key] ?? person.shifts[index],
      overtimeHours: normalizeOvertimeHours(overtimeOverrides[key] ?? 0),
      ...(legalOverrides ? { isLegal: legalOverrides[key] === true } : {})
    }
  })
  const shifts = dailyRecords.map(record => record.shift)
  const overtimeHours = dailyRecords.map(record => record.overtimeHours)
  const legalFlags = legalOverrides ? dailyRecords.map(record => record.isLegal === true) : undefined
  const overtimeTotal = overtimeHours.reduce((total, hours) => total + hours, 0)
  const leaveSummary = dailyRecords.reduce<LeaveSummary>((summary, record) => {
    if (record.shift !== '事假') return summary

    const key = getOverrideKey(person.name, record.date)
    const duration = leaveDurationOverrides[key] ?? '一天'
    return {
      days: summary.days + 1,
      hours: summary.hours + getLeaveDurationHours(duration)
    }
  }, { days: 0, hours: 0 })

  return {
    personName: person.name,
    group: person.group,
    shiftSummary: getPersonShiftSummary({ ...person, shifts }, overtimeHours, legalFlags),
    leaveSummary,
    overtimeTotal,
    dailyRecords
  }
}

function getLeaveDurationHours(duration: LeaveDuration): number {
  return duration === '半天' ? 4 : 8
}

export function getAllPeopleMonthlyOvertimeStats(
  scheduleData: ScheduleData,
  overtimeOverrides: OvertimeOverrides,
  shiftOverrides: ShiftOverrides = {},
  legalOverrides?: LegalOverrides
): AllPeopleMonthlyOvertimeStats {
  const people = scheduleData.people.map(person => {
    const stats = getPersonMonthlyStats(
      scheduleData,
      person.name,
      overtimeOverrides,
      shiftOverrides,
      legalOverrides
    )
    const overtimeByType = getOvertimeChartItems(stats?.shiftSummary.加班)
    const weekdayHours = overtimeByType.find(item => item.type === '平日')?.hours ?? 0
    const specialHours = overtimeByType.find(item => item.type === '特勤')?.hours ?? 0
    const legalHours = overtimeByType.find(item => item.type === '法定')?.hours ?? 0
    const totalHours = normalizeOvertimeHours(stats?.overtimeTotal ?? 0)

    return {
      personName: person.name,
      group: person.group,
      weekdayHours,
      specialHours,
      legalHours,
      totalHours
    }
  })
  const overtimeTotals = people.map(person => person.totalHours)
  const totalOvertime = overtimeTotals.reduce((total, hours) => total + hours, 0)
  let currentRank = 0
  const ranking = [...people]
    .sort((a, b) => b.totalHours - a.totalHours)
    .map((person, index, sortedPeople) => {
      const previousPerson = sortedPeople[index - 1]
      currentRank = previousPerson && previousPerson.totalHours === person.totalHours
        ? currentRank
        : index + 1

      return {
        rank: currentRank,
        ...person
      }
    })

  return {
    maxOvertime: normalizeOvertimeHours(Math.max(...overtimeTotals, 0)),
    minOvertime: normalizeOvertimeHours(overtimeTotals.length > 0 ? Math.min(...overtimeTotals) : 0),
    averageOvertime: normalizeOvertimeHours(people.length > 0 ? totalOvertime / people.length : 0),
    people,
    ranking
  }
}
