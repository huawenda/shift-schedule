import { describe, expect, it } from 'vitest'
import records from './records'

const {
  filterWritableDeletedKeys,
  filterWritableRecords,
  normalizeRecord,
  normalizeOvertimeHours
} = records

describe('day record rules', () => {
  it('normalizes overtime to half-hour increments', () => {
    expect(normalizeOvertimeHours(2.24)).toBe(2)
    expect(normalizeOvertimeHours(2.26)).toBe(2.5)
    expect(normalizeOvertimeHours(-1)).toBe(0)
  })

  it('drops empty records after normalization', () => {
    expect(normalizeRecord({
      personName: '华文达',
      date: '06/01',
      overtimeHours: 0
    })).toBeNull()
  })

  it('keeps legal and leave fields only when valid', () => {
    expect(normalizeRecord({
      personName: '华文达',
      date: '06/01',
      shiftOverride: '事假',
      leaveDuration: '半天',
      overtimeHours: 1.26,
      isLegalOvertime: true
    })).toEqual({
      personName: '华文达',
      date: '06/01',
      shiftOverride: '事假',
      overtimeHours: 1.5,
      isLegalOvertime: true,
      leaveDuration: '半天'
    })
  })

  it('allows admins to write all records and users to write only their own', () => {
    const records = [
      { personName: '华文达', date: '06/01', shiftOverride: '白班' },
      { personName: '张舒琪', date: '06/01', shiftOverride: '夜班' }
    ]

    expect(filterWritableRecords({ personName: '张舒琪', isAdmin: false }, records)).toEqual([
      {
        personName: '张舒琪',
        date: '06/01',
        shiftOverride: '夜班',
        overtimeHours: 0,
        isLegalOvertime: false,
        leaveDuration: null
      }
    ])
    expect(filterWritableRecords({ personName: '华文达', isAdmin: true }, records)).toHaveLength(2)
  })

  it('filters deleted keys by write permission', () => {
    expect(filterWritableDeletedKeys(
      { personName: '张舒琪', isAdmin: false },
      ['张舒琪::06/01', '华文达::06/01', 'bad-key']
    )).toEqual([{ personName: '张舒琪', date: '06/01' }])
  })
})
