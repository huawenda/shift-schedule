import { describe, expect, it } from 'vitest'
import { scheduleData } from '../data/schedule'
import {
  formatScheduleMonthDay,
  getCalendarDateMeta,
  getDateLabels,
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getPersonMonthCalendarCells,
  getPersonShiftSummary,
  getUpcomingShifts
} from './schedule'

describe('schedule utilities', () => {
  it('counts shift totals for the highlighted person', () => {
    const highlightedPerson = scheduleData.people[0]

    expect(getPersonShiftSummary(highlightedPerson)).toEqual({
      白班: 80,
      夜班: 84,
      休息: 81,
      特勤: 0
    })
  })

  it('counts special duty shifts as duty and their underlying day or night shift', () => {
    expect(getPersonShiftSummary({
      name: '测试',
      group: 'T',
      shifts: ['白班', '夜班', '休息', '白特', '夜特']
    })).toEqual({
      白班: 2,
      夜班: 2,
      休息: 1,
      特勤: 2
    })
  })

  it('returns seven upcoming shifts from the start of the period', () => {
    const highlightedPerson = scheduleData.people[0]

    expect(getUpcomingShifts(scheduleData.dates, highlightedPerson, 7)).toEqual([
      { date: '04/19', shift: '休息' },
      { date: '04/20', shift: '夜班' },
      { date: '04/21', shift: '夜班' },
      { date: '04/22', shift: '夜班' },
      { date: '04/23', shift: '夜班' },
      { date: '04/24', shift: '休息' },
      { date: '04/25', shift: '休息' }
    ])
  })

  it('adds weekday labels to each date', () => {
    expect(getDateLabels(scheduleData.startDate, scheduleData.dates).slice(0, 3)).toEqual([
      { date: '04/19', weekday: '日' },
      { date: '04/20', weekday: '一' },
      { date: '04/21', weekday: '二' }
    ])
  })

  it('formats runtime dates for schedule matching', () => {
    expect(formatScheduleMonthDay(new Date(2026, 4, 24))).toBe('05/24')
    expect(formatScheduleMonthDay(new Date(2026, 11, 3))).toBe('12/03')
  })

  it('detects the current schedule month only when today is in range', () => {
    expect(getCurrentScheduleMonth(scheduleData, new Date(2026, 4, 19))).toBe('05')
    expect(getCurrentScheduleMonth(scheduleData, new Date(2026, 4, 20))).toBe('06')
    expect(getCurrentScheduleMonth(scheduleData, new Date(2026, 4, 24))).toBe('06')
    expect(getCurrentScheduleMonth(scheduleData, new Date(2026, 11, 19))).toBe('12')
    expect(getCurrentScheduleMonth(scheduleData, new Date(2026, 11, 20))).toBeNull()
    expect(getCurrentScheduleMonth(scheduleData, new Date(2027, 0, 1))).toBeNull()
  })

  it('returns compact lunar, solar holiday, lunar holiday, and solar term labels', () => {
    expect(getCalendarDateMeta('2026-05-01')).toEqual({
      label: '劳动',
      isHoliday: true
    })
    expect(getCalendarDateMeta('2026-05-05')).toEqual({
      label: '立夏',
      isHoliday: true
    })
    expect(getCalendarDateMeta('2026-06-19')).toEqual({
      label: '端午',
      isHoliday: true
    })
    expect(getCalendarDateMeta('2026-05-24')).toEqual({
      label: '初八',
      isHoliday: false
    })
    expect(getCalendarDateMeta('2026-05-04')).toEqual({
      label: '青年',
      isHoliday: true
    })
    expect(getCalendarDateMeta('2026-09-10')).toEqual({
      label: '教师',
      isHoliday: true
    })
  })

  it('slices the generated schedule by selected work month without changing person order', () => {
    const mayView = getMonthScheduleView(scheduleData, '05')
    const juneView = getMonthScheduleView(scheduleData, '06')
    const decemberView = getMonthScheduleView(scheduleData, '12')

    expect(mayView.startDate).toBe('2026-04-20')
    expect(mayView.endDate).toBe('2026-05-19')
    expect(mayView.dates).toHaveLength(30)
    expect(mayView.people).toHaveLength(14)
    expect(mayView.people[0]).toEqual(
      expect.objectContaining({
        name: '华文达',
        shifts: expect.arrayContaining(['白班', '夜班', '休息'])
      })
    )
    expect(mayView.people[0].shifts).toHaveLength(30)

    expect(juneView.startDate).toBe('2026-05-20')
    expect(juneView.endDate).toBe('2026-06-19')
    expect(juneView.dates).toHaveLength(31)
    expect(juneView.people[0].shifts).toHaveLength(31)

    expect(decemberView.startDate).toBe('2026-11-20')
    expect(decemberView.endDate).toBe('2026-12-19')
    expect(decemberView.dates).toHaveLength(30)
    expect(decemberView.people[0].shifts).toHaveLength(30)
  })

  it('builds a 7-column calendar grid for the highlighted person', () => {
    const mayView = getMonthScheduleView(scheduleData, '05')
    const juneView = getMonthScheduleView(scheduleData, '06')
    const mayCells = getPersonMonthCalendarCells(scheduleData, '05', '华文达')
    const juneCells = getPersonMonthCalendarCells(scheduleData, '06', '华文达')

    expect(mayCells).toHaveLength(35)
    expect(mayCells.slice(0, 5).map(cell => cell.day)).toEqual(['19', '20', '21', '22', '23'])
    expect(mayCells[0]).toEqual(expect.objectContaining({
      key: '04/19',
      day: '19',
      shift: '休息',
      inCurrentMonth: false
    }))
    expect(mayCells[1]).toEqual(expect.objectContaining({
      key: '04/20',
      day: '20',
      shift: '夜班',
      inCurrentMonth: true
    }))
    expect(mayCells.slice(-4).map(cell => cell.key)).toEqual([
      '05/20',
      '05/21',
      '05/22',
      '05/23'
    ])
    expect(mayCells[31].shift).toBe('夜班')

    expect(juneCells).toHaveLength(35)
    expect(juneCells[0]).toEqual(expect.objectContaining({
      key: '05/17',
      day: '17',
      shift: '夜班',
      inCurrentMonth: false
    }))
    expect(juneCells[3]).toEqual(expect.objectContaining({
      key: '05/20',
      day: '20',
      shift: '夜班',
      inCurrentMonth: true
    }))
    expect(juneCells.slice(-1).map(cell => cell.key)).toEqual(['06/20'])
  })
})
