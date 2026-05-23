import { describe, expect, it } from 'vitest'
import { scheduleData } from './schedule'

describe('scheduleData', () => {
  it('covers the full MVP date range with 24 days', () => {
    expect(scheduleData.startDate).toBe('2026-06-07')
    expect(scheduleData.endDate).toBe('2026-06-30')
    expect(scheduleData.dates).toHaveLength(24)
    expect(scheduleData.dates[0]).toBe('06/07')
    expect(scheduleData.dates[23]).toBe('06/30')
  })

  it('contains all 14 people and 24 shifts per person', () => {
    expect(scheduleData.people).toHaveLength(14)
    expect(scheduleData.people.every(person => person.shifts.length === 24)).toBe(true)
  })

  it('includes the default highlighted user', () => {
    expect(scheduleData.people).toContainEqual(
      expect.objectContaining({ name: '华文达', group: '4F' })
    )
  })
})
