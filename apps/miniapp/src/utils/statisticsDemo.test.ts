import { describe, expect, it } from 'vitest'
import { getOverrideKey } from '../services/cloudRecordMaps'
import { scheduleData } from '../data/schedule'
import { getMonthScheduleView } from './schedule'
import { getAllPeopleMonthlyOvertimeStats } from './statistics'
import { getAdminJuneDemoOverrides, getTeamJuneDemoOverrides } from './statisticsDemo'

describe('statistics demo overrides', () => {
  it('sets admin June day and night shifts to 3 overtime hours', () => {
    const { overtimeOverrides } = getAdminJuneDemoOverrides()

    expect(overtimeOverrides[getOverrideKey('华文达', '05/20')]).toBe(3)
    expect(overtimeOverrides[getOverrideKey('华文达', '05/27')]).toBe(3)
    expect(overtimeOverrides[getOverrideKey('华文达', '06/01')]).toBe(3)
    expect(overtimeOverrides[getOverrideKey('华文达', '06/07')]).toBe(3)
    expect(overtimeOverrides[getOverrideKey('华文达', '06/20')]).toBeUndefined()
  })

  it('changes selected admin June rest days to special shifts with 10 overtime hours', () => {
    const { shiftOverrides, overtimeOverrides } = getAdminJuneDemoOverrides()

    expect(shiftOverrides[getOverrideKey('华文达', '05/24')]).toBe('夜特')
    expect(shiftOverrides[getOverrideKey('华文达', '05/25')]).toBe('夜特')
    expect(shiftOverrides[getOverrideKey('华文达', '05/30')]).toBe('夜特')
    expect(shiftOverrides[getOverrideKey('华文达', '05/31')]).toBe('白特')
    expect(shiftOverrides[getOverrideKey('华文达', '06/05')]).toBe('白特')
    expect(overtimeOverrides[getOverrideKey('华文达', '05/24')]).toBe(10)
    expect(overtimeOverrides[getOverrideKey('华文达', '05/31')]).toBe(10)
  })

  it('marks one admin June day shift as legal overtime with 11 hours', () => {
    const { legalOverrides, overtimeOverrides } = getAdminJuneDemoOverrides()
    const legalDayKey = getOverrideKey('华文达', '05/26')

    expect(legalOverrides[legalDayKey]).toBe(true)
    expect(overtimeOverrides[legalDayKey]).toBe(11)
  })

  it('generates deterministic June demo overtime for every person across all overtime types', () => {
    const juneSchedule = getMonthScheduleView(scheduleData, '06')
    const { shiftOverrides, overtimeOverrides, legalOverrides } = getTeamJuneDemoOverrides(juneSchedule)
    const stats = getAllPeopleMonthlyOvertimeStats(juneSchedule, overtimeOverrides, shiftOverrides, legalOverrides)

    expect(stats.people).toHaveLength(juneSchedule.people.length)
    expect(stats.people.every(person => person.totalHours > 0)).toBe(true)
    expect(stats.people.reduce((total, person) => total + person.weekdayHours, 0)).toBeGreaterThan(0)
    expect(stats.people.reduce((total, person) => total + person.specialHours, 0)).toBeGreaterThan(0)
    expect(stats.people.reduce((total, person) => total + person.legalHours, 0)).toBeGreaterThan(0)
    expect(Object.keys(overtimeOverrides).some(key => key.endsWith('06/20'))).toBe(false)
  })
})
