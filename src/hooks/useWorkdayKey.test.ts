import { describe, expect, it } from 'vitest'
import type { ShiftType } from '../data/shifts'
import { buildMoment } from './useCurrentShift'
import { workdayKeyOf } from './useWorkdayKey'

/** 本地时间构造，避免走到时区解析的那条坑 */
function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

const DATES = ['2026-11-05', '2026-11-06']

describe('workdayKeyOf', () => {
  it('夜班跨零点：00:30 仍算 11/05 的工作日', () => {
    const now = at(2026, 11, 6, 0, 30)
    const shifts: ShiftType[] = ['夜班', '白班']
    expect(workdayKeyOf(buildMoment(DATES, shifts, now), now)).toBe('2026-11-05')
  })

  it('07:30 还在夜班区间，仍是 11/05', () => {
    const now = at(2026, 11, 6, 7, 30)
    const shifts: ShiftType[] = ['夜班', '白班']
    expect(workdayKeyOf(buildMoment(DATES, shifts, now), now)).toBe('2026-11-05')
  })

  it('08:00 夜班结束，工作日切到 11/06', () => {
    const now = at(2026, 11, 6, 8, 0)
    const shifts: ShiftType[] = ['夜班', '白班']
    expect(workdayKeyOf(buildMoment(DATES, shifts, now), now)).toBe('2026-11-06')
  })

  it('没有进行中的班次时回落到日历今天', () => {
    const now = at(2026, 11, 6, 9, 0)
    const shifts: ShiftType[] = ['夜班', '休息']
    expect(workdayKeyOf(buildMoment(DATES, shifts, now), now)).toBe('2026-11-06')
  })

  it('当晚 21:00 开始的新夜班属于 11/06', () => {
    const now = at(2026, 11, 6, 21, 0)
    const shifts: ShiftType[] = ['夜班', '夜班']
    expect(workdayKeyOf(buildMoment(DATES, shifts, now), now)).toBe('2026-11-06')
  })
})
