import { describe, expect, it } from 'vitest'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getDeletedCloudRecordKeys,
  formatCloudTimestamp,
  getOverrideKey,
  hasCloudDayRecordChanged,
  type LegalOverrides,
  type LeaveDurationOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from './cloudRecordMaps'

describe('cloud record mapping', () => {
  it('converts cloud day records to override maps', () => {
    expect(cloudRecordsToOverrides([
      {
        _id: '1',
        personName: '华文达',
        date: '05/26',
        shiftOverride: '白特',
        overtimeHours: 1.5
      },
      {
        _id: '2',
        personName: '华文达',
        date: '05/27',
        overtimeHours: 2
      },
      {
        _id: '3',
        personName: '华文达',
        date: '05/28',
        shiftOverride: '休息'
      },
      {
        _id: '4',
        personName: '华文达',
        date: '05/29',
        isLegalOvertime: true
      },
      {
        _id: '5',
        personName: '张舒祺',
        date: '05/30',
        shiftOverride: '事假',
        leaveDuration: '半天'
      }
    ])).toEqual({
      shiftOverrides: {
        [getOverrideKey('华文达', '05/26')]: '白特',
        [getOverrideKey('华文达', '05/28')]: '休息',
        [getOverrideKey('张舒祺', '05/30')]: '事假'
      },
      overtimeOverrides: {
        [getOverrideKey('华文达', '05/26')]: 1.5,
        [getOverrideKey('华文达', '05/27')]: 2
      },
      legalOverrides: {
        [getOverrideKey('华文达', '05/29')]: true
      },
      leaveDurationOverrides: {
        [getOverrideKey('张舒祺', '05/30')]: '半天'
      }
    })
  })

  it('builds compact cloud day records from local override maps', () => {
    const shiftOverrides: ShiftOverrides = {
      [getOverrideKey('华文达', '05/26')]: '白特',
      [getOverrideKey('张舒祺', '05/26')]: '夜班'
    }
    const overtimeOverrides: OvertimeOverrides = {
      [getOverrideKey('华文达', '05/26')]: 1,
      [getOverrideKey('华文达', '05/27')]: 2.5
    }
    const legalOverrides: LegalOverrides = {
      [getOverrideKey('华文达', '05/28')]: true
    }
    const leaveDurationOverrides: LeaveDurationOverrides = {
      [getOverrideKey('张舒祺', '05/29')]: '一天'
    }
    shiftOverrides[getOverrideKey('张舒祺', '05/29')] = '事假'

    expect(buildCloudDayRecords(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides)).toEqual([
      {
        personName: '华文达',
        date: '05/26',
        shiftOverride: '白特',
        overtimeHours: 1
      },
      {
        personName: '华文达',
        date: '05/27',
        overtimeHours: 2.5
      },
      {
        personName: '华文达',
        date: '05/28',
        isLegalOvertime: true,
        overtimeHours: 0
      },
      {
        personName: '张舒祺',
        date: '05/26',
        shiftOverride: '夜班',
        overtimeHours: 0
      },
      {
        personName: '张舒祺',
        date: '05/29',
        shiftOverride: '事假',
        overtimeHours: 0,
        leaveDuration: '一天'
      }
    ])
  })

  it('formats cloud timestamps as readable Beijing datetime strings', () => {
    expect(formatCloudTimestamp(Date.UTC(2026, 4, 25, 14, 57, 22))).toBe('2026-05-25 22:57:22')
  })

  it('detects whether a cloud day record content changed', () => {
    expect(hasCloudDayRecordChanged(
      { personName: '华文达', date: '05/26', shiftOverride: '夜班', overtimeHours: 0 },
      { personName: '华文达', date: '05/26', shiftOverride: '夜班', overtimeHours: 0 }
    )).toBe(false)
    expect(hasCloudDayRecordChanged(
      { personName: '华文达', date: '05/26', shiftOverride: '夜班', overtimeHours: 0 },
      { personName: '华文达', date: '05/26', shiftOverride: '夜班', overtimeHours: 0, isLegalOvertime: true }
    )).toBe(true)
    expect(hasCloudDayRecordChanged(
      { personName: '华文达', date: '05/26', shiftOverride: '夜班', overtimeHours: 0 },
      { personName: '华文达', date: '05/26', shiftOverride: '白班', overtimeHours: 0 }
    )).toBe(true)
    expect(hasCloudDayRecordChanged(
      { personName: '华文达', date: '05/26', shiftOverride: '事假', overtimeHours: 0, leaveDuration: '半天' },
      { personName: '华文达', date: '05/26', shiftOverride: '事假', overtimeHours: 0, leaveDuration: '一天' }
    )).toBe(true)
  })

  it('deletes only explicitly deleted cloud record keys during sync', () => {
    expect(getDeletedCloudRecordKeys(
      [
        { personName: '华文达', date: '05/23', shiftOverride: '夜特' },
        { personName: '张舒祺', date: '05/23', shiftOverride: '夜特' }
      ],
      [
        { personName: '华文达', date: '05/23', shiftOverride: '白班' }
      ],
      [getOverrideKey('华文达', '05/24')]
    )).toEqual([])

    expect(getDeletedCloudRecordKeys(
      [
        { personName: '华文达', date: '05/23', shiftOverride: '夜特' },
        { personName: '张舒祺', date: '05/23', shiftOverride: '夜特' }
      ],
      [],
      [getOverrideKey('张舒祺', '05/23')]
    )).toEqual([getOverrideKey('张舒祺', '05/23')])
  })
})
