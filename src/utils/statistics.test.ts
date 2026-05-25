import { describe, expect, it } from 'vitest'
import { getOverrideKey, type OvertimeOverrides, type ShiftOverrides } from '../services/cloudRecordMaps'
import type { ScheduleData } from '../types/schedule'
import { getPersonMonthlyStats } from './statistics'

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
})
