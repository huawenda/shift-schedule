import { describe, expect, it } from 'vitest'
import { scheduleData } from '../data/schedule'
import {
  getDateLabels,
  getMonthScheduleView,
  getPersonMonthCalendarCells,
  getPersonShiftSummary,
  getUpcomingShifts
} from './schedule'

describe('schedule utilities', () => {
  it('counts shift totals for the highlighted person', () => {
    const highlightedPerson = scheduleData.people[0]

    expect(getPersonShiftSummary(highlightedPerson)).toEqual({
      白班: 84,
      夜班: 80,
      休息: 81
    })
  })

  it('returns seven upcoming shifts from the start of the period', () => {
    const highlightedPerson = scheduleData.people[0]

    expect(getUpcomingShifts(scheduleData.dates, highlightedPerson, 7)).toEqual([
      { date: '05/01', shift: '休息' },
      { date: '05/02', shift: '白班' },
      { date: '05/03', shift: '白班' },
      { date: '05/04', shift: '白班' },
      { date: '05/05', shift: '白班' },
      { date: '05/06', shift: '休息' },
      { date: '05/07', shift: '休息' }
    ])
  })

  it('adds weekday labels to each date', () => {
    expect(getDateLabels(scheduleData.startDate, scheduleData.dates).slice(0, 3)).toEqual([
      { date: '05/01', weekday: '五' },
      { date: '05/02', weekday: '六' },
      { date: '05/03', weekday: '日' }
    ])
  })

  it('slices the generated schedule by selected month without changing person order', () => {
    const mayView = getMonthScheduleView(scheduleData, '05')
    const juneView = getMonthScheduleView(scheduleData, '06')
    const decemberView = getMonthScheduleView(scheduleData, '12')

    expect(mayView.startDate).toBe('2026-05-01')
    expect(mayView.endDate).toBe('2026-05-31')
    expect(mayView.dates).toHaveLength(31)
    expect(mayView.people).toHaveLength(14)
    expect(mayView.people[0]).toEqual(
      expect.objectContaining({
        name: '华文达',
        shifts: expect.arrayContaining(['白班', '夜班', '休息'])
      })
    )
    expect(mayView.people[0].shifts).toHaveLength(31)

    expect(juneView.startDate).toBe('2026-06-01')
    expect(juneView.endDate).toBe('2026-06-30')
    expect(juneView.dates).toHaveLength(30)
    expect(juneView.people[0].shifts).toHaveLength(30)

    expect(decemberView.startDate).toBe('2026-12-01')
    expect(decemberView.endDate).toBe('2026-12-31')
    expect(decemberView.dates).toHaveLength(31)
    expect(decemberView.people[0].shifts).toHaveLength(31)
  })

  it('builds a 7-column calendar grid for the highlighted person', () => {
    const mayView = getMonthScheduleView(scheduleData, '05')
    const juneView = getMonthScheduleView(scheduleData, '06')
    const mayCells = getPersonMonthCalendarCells(scheduleData, '05', '华文达')
    const juneCells = getPersonMonthCalendarCells(scheduleData, '06', '华文达')

    expect(mayCells).toHaveLength(42)
    expect(mayCells.slice(0, 5).map(cell => cell.day)).toEqual(['26', '27', '28', '29', '30'])
    expect(mayCells[0]).toEqual({
      key: '04/26',
      day: '26',
      shift: '夜班',
      inCurrentMonth: false
    })
    expect(mayCells[5]).toEqual({
      key: '05/01',
      day: '01',
      shift: '休息',
      inCurrentMonth: true
    })
    expect(mayCells.slice(-6).map(cell => cell.key)).toEqual([
      '06/01',
      '06/02',
      '06/03',
      '06/04',
      '06/05',
      '06/06'
    ])
    expect(mayCells[36].shift).toBe('白班')

    expect(juneCells).toHaveLength(35)
    expect(juneCells[0]).toEqual({
      key: '05/31',
      day: '31',
      shift: '休息',
      inCurrentMonth: false
    })
    expect(juneCells[1]).toEqual({
      key: '06/01',
      day: '01',
      shift: '白班',
      inCurrentMonth: true
    })
    expect(juneCells.slice(-4).map(cell => cell.key)).toEqual([
      '07/01',
      '07/02',
      '07/03',
      '07/04'
    ])
  })
})
