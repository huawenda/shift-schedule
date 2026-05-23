import { describe, expect, it } from 'vitest'
import { scheduleData } from '../data/schedule'
import {
  filterPeopleByMode,
  getDateLabels,
  getMonthScheduleView,
  getPersonShiftSummary,
  getUpcomingShifts
} from './schedule'

describe('schedule utilities', () => {
  it('counts shift totals for the highlighted person', () => {
    const highlightedPerson = scheduleData.people[0]

    expect(getPersonShiftSummary(highlightedPerson)).toEqual({
      白班: 24,
      夜班: 16,
      休息: 21
    })
  })

  it('filters the table to the highlighted person in mine-only mode', () => {
    const allPeople = filterPeopleByMode(scheduleData.people, '华文达', false)
    const mineOnlyPeople = filterPeopleByMode(scheduleData.people, '华文达', true)

    expect(allPeople).toHaveLength(14)
    expect(mineOnlyPeople).toEqual([
      expect.objectContaining({ name: '华文达', group: '4F' })
    ])
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

  it('slices the generated schedule by month without changing person order', () => {
    const mayView = getMonthScheduleView(scheduleData, '05')
    const juneView = getMonthScheduleView(scheduleData, '06')

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
  })
})
