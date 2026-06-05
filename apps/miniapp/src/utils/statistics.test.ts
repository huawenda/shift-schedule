import { describe, expect, it } from 'vitest'
import { getOverrideKey, type LeaveDurationOverrides, type OvertimeOverrides, type ShiftOverrides } from '../services/cloudRecordMaps'
import type { ScheduleData } from '../types/schedule'
import { getAllPeopleMonthlyOvertimeStats, getOvertimeChartItems, getPersonMonthlyStats } from './statistics'

const sampleSchedule: ScheduleData = {
  startDate: '2026-05-20',
  endDate: '2026-06-19',
  dates: ['05/20', '05/21', '05/22', '05/23', '05/24'],
  people: [
    {
      name: '华文达',
      group: '4F',
      shifts: ['白班', '夜班', '休息', '白特', '夜特']
    },
    {
      name: '张舒祺',
      group: '4G',
      shifts: ['夜班', '夜班', '休息', '休息', '白班']
    }
  ]
}

describe('statistics utilities', () => {
  it('summarizes monthly shift counts for the selected user', () => {
    expect(getPersonMonthlyStats(sampleSchedule, '华文达', {})).toEqual(expect.objectContaining({
      personName: '华文达',
      group: '4F',
      shiftSummary: {
        白班: 1,
        夜班: 1,
        休息: 1,
        白特: 1,
        夜特: 1,
        加班: {
          白班: 0,
          夜班: 0,
          白特: 0,
          夜特: 0
        }
      },
      overtimeTotal: 0
    }))
  })

  it('uses shift overrides when calculating attendance', () => {
    const shiftOverrides: ShiftOverrides = {
      [getOverrideKey('华文达', '05/20')]: '夜班',
      [getOverrideKey('华文达', '05/23')]: '白班'
    }

    expect(getPersonMonthlyStats(sampleSchedule, '华文达', {}, shiftOverrides)?.shiftSummary).toEqual({
      白班: 1,
      夜班: 2,
      休息: 1,
      白特: 0,
      夜特: 1,
      加班: {
        白班: 0,
        夜班: 0,
        白特: 0,
        夜特: 0
      }
    })
  })

  it('summarizes leave days and converts leave duration to hours', () => {
    const shiftOverrides: ShiftOverrides = {
      [getOverrideKey('华文达', '05/20')]: '事假',
      [getOverrideKey('华文达', '05/21')]: '事假'
    }
    const leaveDurationOverrides: LeaveDurationOverrides = {
      [getOverrideKey('华文达', '05/20')]: '半天',
      [getOverrideKey('华文达', '05/21')]: '一天'
    }

    expect(getPersonMonthlyStats(
      sampleSchedule,
      '华文达',
      {},
      shiftOverrides,
      {},
      leaveDurationOverrides
    )).toEqual(expect.objectContaining({
      leaveSummary: {
        days: 2,
        hours: 12
      },
      shiftSummary: expect.objectContaining({
        白班: 0,
        夜班: 0,
        事假: 2
      })
    }))
  })

  it('keeps legal marked days out of their effective shift bucket', () => {
    expect(getPersonMonthlyStats(
      sampleSchedule,
      '华文达',
      {
        [getOverrideKey('华文达', '05/20')]: 1,
        [getOverrideKey('华文达', '05/23')]: 2
      },
      {},
      {
        [getOverrideKey('华文达', '05/20')]: true,
        [getOverrideKey('华文达', '05/23')]: true
      }
    )?.shiftSummary).toEqual({
      白班: 0,
      夜班: 1,
      休息: 1,
      白特: 0,
      夜特: 1,
      法定: 2,
      加班: {
        白班: 0,
        夜班: 0,
        白特: 0,
        夜特: 0,
        法定: 3
      }
    })
  })

  it('sums overtime hours for the selected user only', () => {
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/20')]: 1.5,
      [getOverrideKey('华文达', '05/23')]: 2,
      [getOverrideKey('张舒祺', '05/20')]: 8
    }

    expect(getPersonMonthlyStats(sampleSchedule, '华文达', overtimeOverrides)?.overtimeTotal).toBe(3.5)
  })

  it('groups overtime hours by the effective shift bucket', () => {
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/20')]: 1.5,
      [getOverrideKey('华文达', '05/23')]: 2
    }

    expect(getPersonMonthlyStats(sampleSchedule, '华文达', overtimeOverrides)?.shiftSummary.加班).toEqual({
      白班: 1.5,
      夜班: 0,
      白特: 2,
      夜特: 0
    })
  })

  it('builds ordered overtime chart items by overtime type', () => {
    expect(getOvertimeChartItems({
      白班: 1,
      夜班: 2.5,
      白特: 0,
      夜特: 4,
      法定: 5
    })).toEqual([
      { type: '平日', hours: 3.5 },
      { type: '特勤', hours: 4 },
      { type: '法定', hours: 5 }
    ])
  })

  it('returns daily attendance and overtime details', () => {
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/23')]: 2
    }

    expect(getPersonMonthlyStats(sampleSchedule, '华文达', overtimeOverrides)?.dailyRecords).toEqual([
      { date: '05/20', shift: '白班', overtimeHours: 0 },
      { date: '05/21', shift: '夜班', overtimeHours: 0 },
      { date: '05/22', shift: '休息', overtimeHours: 0 },
      { date: '05/23', shift: '白特', overtimeHours: 2 },
      { date: '05/24', shift: '夜特', overtimeHours: 0 }
    ])
  })

  it('includes legal flags in daily attendance details when provided', () => {
    expect(getPersonMonthlyStats(
      sampleSchedule,
      '华文达',
      {},
      {},
      { [getOverrideKey('华文达', '05/21')]: true }
    )?.dailyRecords).toEqual([
      { date: '05/20', shift: '白班', overtimeHours: 0, isLegal: false },
      { date: '05/21', shift: '夜班', overtimeHours: 0, isLegal: true },
      { date: '05/22', shift: '休息', overtimeHours: 0, isLegal: false },
      { date: '05/23', shift: '白特', overtimeHours: 0, isLegal: false },
      { date: '05/24', shift: '夜特', overtimeHours: 0, isLegal: false }
    ])
  })

  it('summarizes all people monthly overtime by person and overtime type', () => {
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/20')]: 1,
      [getOverrideKey('华文达', '05/21')]: 2,
      [getOverrideKey('华文达', '05/23')]: 3,
      [getOverrideKey('张舒祺', '05/20')]: 4,
      [getOverrideKey('张舒祺', '05/22')]: 5
    }
    const shiftOverrides: ShiftOverrides = {
      [getOverrideKey('张舒祺', '05/22')]: '白特'
    }
    const legalOverrides = {
      [getOverrideKey('华文达', '05/21')]: true,
      [getOverrideKey('张舒祺', '05/20')]: true
    }

    expect(getAllPeopleMonthlyOvertimeStats(
      sampleSchedule,
      overtimeOverrides,
      shiftOverrides,
      legalOverrides
    )).toEqual({
      maxOvertime: 9,
      minOvertime: 6,
      averageOvertime: 7.5,
      people: [
        {
          personName: '华文达',
          group: '4F',
          weekdayHours: 1,
          specialHours: 3,
          legalHours: 2,
          totalHours: 6
        },
        {
          personName: '张舒祺',
          group: '4G',
          weekdayHours: 0,
          specialHours: 5,
          legalHours: 4,
          totalHours: 9
        }
      ],
      ranking: [
        {
          rank: 1,
          personName: '张舒祺',
          group: '4G',
          weekdayHours: 0,
          specialHours: 5,
          legalHours: 4,
          totalHours: 9
        },
        {
          rank: 2,
          personName: '华文达',
          group: '4F',
          weekdayHours: 1,
          specialHours: 3,
          legalHours: 2,
          totalHours: 6
        }
      ]
    })
  })

  it('uses the same rank number when people have equal overtime totals', () => {
    const tiedSchedule: ScheduleData = {
      ...sampleSchedule,
      people: [
        ...sampleSchedule.people,
        {
          name: '陈泳智',
          group: '4H',
          shifts: ['白班', '夜班', '休息', '白特', '夜特']
        }
      ]
    }
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/20')]: 4,
      [getOverrideKey('张舒祺', '05/20')]: 4,
      [getOverrideKey('陈泳智', '05/20')]: 2
    }

    expect(getAllPeopleMonthlyOvertimeStats(tiedSchedule, overtimeOverrides).ranking.map(person => ({
      name: person.personName,
      rank: person.rank,
      totalHours: person.totalHours
    }))).toEqual([
      { name: '华文达', rank: 1, totalHours: 4 },
      { name: '张舒祺', rank: 1, totalHours: 4 },
      { name: '陈泳智', rank: 3, totalHours: 2 }
    ])
  })
})
