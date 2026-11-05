import { describe, expect, it } from 'vitest'
import { buildMoment } from './useCurrentShift'
import type { ShiftType } from '../data/shifts'

/** 本地时间构造，避免走到时区解析的那条坑 */
function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

const DATES = ['2026-11-01', '2026-11-02', '2026-11-03']

describe('useCurrentShift', () => {
  it('今天还没到上班点：显示距上班，按小时 + 分倒计时', () => {
    const shifts: ShiftType[] = ['休息', '白班', '休息']
    const moment = buildMoment(DATES, shifts, at(2026, 11, 2, 7, 0))

    expect(moment.kind).toBe('upcoming')
    expect(moment.shift).toBe('白班')
    expect(moment.countdownLabel).toBe('距上班')
    expect(moment.countdown).toEqual({ value: '1', unit: '小时' })
    expect(moment.countdownTail).toEqual({ value: '00', unit: '分' })
    expect(moment.rangeText).toContain('08:00 → 20:00 · 12 小时')
  })

  it('班中：显示距下班，并给出进行进度', () => {
    const shifts: ShiftType[] = ['休息', '白班', '休息']
    const moment = buildMoment(DATES, shifts, at(2026, 11, 2, 14, 0))

    expect(moment.kind).toBe('active')
    expect(moment.countdownLabel).toBe('距下班')
    expect(moment.countdown).toEqual({ value: '6', unit: '小时' })
    expect(moment.progress).toBeCloseTo(0.5, 4)
  })

  it('夜班跨零点：结束时间写「次日」，倒计时按次日结束算', () => {
    const shifts: ShiftType[] = ['休息', '夜班', '休息']
    const moment = buildMoment(DATES, shifts, at(2026, 11, 2, 23, 0))

    expect(moment.kind).toBe('active')
    expect(moment.rangeText).toContain('20:00 → 次日 08:00 · 12 小时')
    expect(moment.countdown).toEqual({ value: '9', unit: '小时' })
  })

  it('过了零点仍停留在昨天的夜班，按次日下班倒计时', () => {
    const dates = ['2026-11-05', '2026-11-06']
    const shifts: ShiftType[] = ['夜班', '白班']
    const moment = buildMoment(dates, shifts, at(2026, 11, 6, 0, 30))

    expect(moment.kind).toBe('active')
    expect(moment.dateKey).toBe('2026-11-05')
    expect(moment.shift).toBe('夜班')
    expect(moment.countdownLabel).toBe('距下班')
    expect(moment.countdown).toEqual({ value: '7', unit: '小时' })
    expect(moment.countdownTail).toEqual({ value: '30', unit: '分' })
    expect(moment.rangeText).toContain('20:00 → 次日 08:00')
  })

  it('到次日 08:00 才切到今天白班', () => {
    const dates = ['2026-11-05', '2026-11-06']
    const shifts: ShiftType[] = ['夜班', '白班']
    const moment = buildMoment(dates, shifts, at(2026, 11, 6, 8, 0))

    expect(moment.kind).toBe('active')
    expect(moment.dateKey).toBe('2026-11-06')
    expect(moment.shift).toBe('白班')
    expect(moment.countdownLabel).toBe('距下班')
  })

  it('夜班结束后今天休息，找下一班而不是把昨天当现在', () => {
    const dates = ['2026-11-05', '2026-11-06', '2026-11-07']
    const shifts: ShiftType[] = ['夜班', '休息', '白班']
    const moment = buildMoment(dates, shifts, at(2026, 11, 6, 9, 0))

    expect(moment.kind).toBe('upcoming')
    expect(moment.dateKey).toBe('2026-11-07')
    expect(moment.shift).toBe('白班')
  })

  it('今天休息时找下一个有工时的班次；超过 48 小时按天显示', () => {
    const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
    const shifts: ShiftType[] = ['休息', '休息', '休息', '白班']
    const moment = buildMoment(dates, shifts, at(2026, 11, 2, 12, 0))

    expect(moment.kind).toBe('upcoming')
    expect(moment.dateKey).toBe('2026-11-05')
    expect(moment.countdown).toEqual({ value: '2', unit: '天' })
    expect(moment.countdownTail).toEqual({ value: '20', unit: '小时' })
  })

  it('本期已无更多排班：回到 idle，不假装还有下一班', () => {
    const shifts: ShiftType[] = ['白班', '夜班', '休息']
    const moment = buildMoment(DATES, shifts, at(2026, 11, 10, 12, 0))

    expect(moment.kind).toBe('idle')
    expect(moment.rangeText).toBe('本月没有更多排班')
    expect(moment.countdown).toBeNull()
  })
})
