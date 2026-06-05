import { describe, expect, it } from 'vitest'
import {
  cloudDayRecordToSupabaseRow,
  cloudDayRecordToSupabaseRows,
  mergeSupabaseDayRecordRows,
  getCurrentUserAccountFilter,
  supabaseDayRecordToCloudRecord,
  salaryEntryToSupabaseRow,
  supabaseSalaryRowsToRecords,
  webUsernameToSupabaseEmail
} from './supabaseMaps'

describe('supabase data mapping', () => {
  it('maps day records between app shape and Supabase rows', () => {
    const row = cloudDayRecordToSupabaseRow({
      personName: '华文达',
      date: '06/01',
      shiftOverride: '白特',
      overtimeHours: 3.5,
      isLegalOvertime: true
    })

    expect(row).toEqual({
      person_name: '华文达',
      record_date: '06/01',
      shift_override: '白特',
      overtime_hours: 3.5,
      is_legal_overtime: true,
      leave_duration: null
    })

    expect(supabaseDayRecordToCloudRecord({
      id: 7,
      person_name: '华文达',
      record_date: '06/01',
      shift_override: '白特',
      overtime_hours: '3.5',
      is_legal_overtime: true,
      leave_duration: null,
      created_at_ms: 1780000000000,
      created_at_text: '2026-06-01 08:00:00',
      updated_at_ms: 1780000000000,
      updated_at_text: '2026-06-01 08:00:00'
    })).toEqual({
      _id: '7',
      personName: '华文达',
      date: '06/01',
      shiftOverride: '白特',
      overtimeHours: 3.5,
      isLegalOvertime: true,
      createdAt: 1780000000000,
      createdAtText: '2026-06-01 08:00:00',
      updatedAt: 1780000000000,
      updatedAtText: '2026-06-01 08:00:00'
    })
  })

  it('splits shared shift data from private attendance data for Supabase', () => {
    expect(cloudDayRecordToSupabaseRows({
      personName: '华文达',
      date: '06/01',
      shiftOverride: '白特',
      overtimeHours: 3.5,
      isLegalOvertime: true
    })).toEqual({
      shiftRow: {
        person_name: '华文达',
        record_date: '06/01',
        shift_override: '白特'
      },
      privateRow: {
        person_name: '华文达',
        record_date: '06/01',
        overtime_hours: 3.5,
        is_legal_overtime: true,
        leave_duration: null
      }
    })

    expect(cloudDayRecordToSupabaseRows({
      personName: '华文达',
      date: '06/02',
      overtimeHours: 0
    })).toEqual({
      shiftRow: null,
      privateRow: null
    })
  })

  it('merges shared shift rows and visible private rows into app records', () => {
    expect(mergeSupabaseDayRecordRows(
      [
        {
          id: 1,
          person_name: '华文达',
          record_date: '06/01',
          shift_override: '白特',
          created_at_ms: 1780000000000,
          created_at_text: '2026-06-01 08:00:00',
          updated_at_ms: 1780000000000,
          updated_at_text: '2026-06-01 08:00:00'
        },
        {
          id: 2,
          person_name: '张舒祺',
          record_date: '06/01',
          shift_override: '夜班'
        }
      ],
      [
        {
          id: 9,
          person_name: '华文达',
          record_date: '06/01',
          overtime_hours: '3.5',
          is_legal_overtime: true,
          leave_duration: null
        }
      ]
    )).toEqual([
      {
        _id: 'shift:1',
        personName: '华文达',
        date: '06/01',
        shiftOverride: '白特',
        overtimeHours: 3.5,
        isLegalOvertime: true,
        createdAt: 1780000000000,
        createdAtText: '2026-06-01 08:00:00',
        updatedAt: 1780000000000,
        updatedAtText: '2026-06-01 08:00:00'
      },
      {
        _id: 'shift:2',
        personName: '张舒祺',
        date: '06/01',
        shiftOverride: '夜班'
      }
    ])
  })

  it('requires account lookups to target the current Supabase auth user', () => {
    expect(getCurrentUserAccountFilter('auth-user-1')).toEqual({
      column: 'auth_user_id',
      value: 'auth-user-1'
    })
    expect(() => getCurrentUserAccountFilter('')).toThrow('Missing Supabase auth user id')
  })

  it('maps salary rows to keyed salary input records', () => {
    expect(supabaseSalaryRowsToRecords([
      {
        person_name: '华文达',
        month: '2026-06',
        base_salary: '3582',
        performance_allowance: '100',
        position_allowance: '200',
        other_deductions: '50'
      }
    ])).toEqual({
      '华文达::2026-06': {
        baseSalary: '3582',
        performanceAllowance: '100',
        positionAllowance: '200',
        otherDeductions: '50'
      }
    })

    expect(salaryEntryToSupabaseRow('华文达::2026-06', {
      baseSalary: '3582',
      performanceAllowance: '',
      positionAllowance: '',
      otherDeductions: '50'
    })).toEqual({
      person_name: '华文达',
      month: '2026-06',
      base_salary: '3582',
      performance_allowance: '',
      position_allowance: '',
      other_deductions: '50'
    })
  })

  it('derives a stable private email from username for Supabase Auth', () => {
    expect(webUsernameToSupabaseEmail(' HuaWenDa ')).toBe('huawenda@shift-schedule.local')
    expect(webUsernameToSupabaseEmail('张三')).toBe('u-5f20-4e09@shift-schedule.local')
  })
})
