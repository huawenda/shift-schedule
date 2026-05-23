import { describe, expect, it } from 'vitest'
import { scheduleData } from './schedule'

describe('scheduleData', () => {
  it('covers May through December 2026 with 245 days', () => {
    expect(scheduleData.startDate).toBe('2026-05-01')
    expect(scheduleData.endDate).toBe('2026-12-31')
    expect(scheduleData.dates).toHaveLength(245)
    expect(scheduleData.dates[0]).toBe('05/01')
    expect(scheduleData.dates[244]).toBe('12/31')
  })

  it('contains all 14 people and 245 shifts per person', () => {
    expect(scheduleData.people).toHaveLength(14)
    expect(scheduleData.people.every(person => person.shifts.length === 245)).toBe(true)
  })

  it('includes the default highlighted user', () => {
    expect(scheduleData.people).toContainEqual(
      expect.objectContaining({ name: '华文达', group: '4F' })
    )
  })

  it('preserves the provided 06/07 to 06/30 cycle for every person', () => {
    const cycleStartIndex = scheduleData.dates.indexOf('06/07')
    const highlightedPerson = scheduleData.people.find(person => person.name === '华文达')
    const coworker = scheduleData.people.find(person => person.name === '张舒棋')

    expect(highlightedPerson?.shifts.slice(cycleStartIndex, cycleStartIndex + 24)).toEqual([
      '夜班', '夜班', '夜班', '夜班', '休息', '休息',
      '夜班', '夜班', '夜班', '夜班', '休息', '休息',
      '白班', '白班', '白班', '白班', '休息', '休息',
      '白班', '白班', '白班', '白班', '休息', '休息'
    ])
    expect(coworker?.shifts.slice(cycleStartIndex, cycleStartIndex + 24)).toEqual([
      '休息', '夜班', '夜班', '夜班', '夜班', '休息',
      '休息', '夜班', '夜班', '夜班', '夜班', '休息',
      '休息', '白班', '白班', '白班', '白班', '休息',
      '休息', '白班', '白班', '白班', '白班', '休息'
    ])
  })

  it('maps May dates by cycling backward from the provided 06/07 anchor', () => {
    const highlightedPerson = scheduleData.people.find(person => person.name === '华文达')
    const coworker = scheduleData.people.find(person => person.name === '张舒棋')

    expect(highlightedPerson?.shifts.slice(0, 7)).toEqual([
      '休息', '白班', '白班', '白班', '白班', '休息', '休息'
    ])
    expect(coworker?.shifts.slice(0, 7)).toEqual([
      '休息', '休息', '白班', '白班', '白班', '白班', '休息'
    ])
  })
})
