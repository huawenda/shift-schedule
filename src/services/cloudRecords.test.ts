import { describe, expect, it } from 'vitest'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
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
      }
    ])).toEqual({
      shiftOverrides: {
        [getOverrideKey('华文达', '05/26')]: '白特',
        [getOverrideKey('华文达', '05/28')]: '休息'
      },
      overtimeOverrides: {
        [getOverrideKey('华文达', '05/26')]: 1.5,
        [getOverrideKey('华文达', '05/27')]: 2
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

    expect(buildCloudDayRecords(shiftOverrides, overtimeOverrides)).toEqual([
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
        personName: '张舒祺',
        date: '05/26',
        shiftOverride: '夜班',
        overtimeHours: 0
      }
    ])
  })
})
