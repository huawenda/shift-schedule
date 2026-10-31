import { describe, expect, it } from 'vitest'
import {
  MAX_OVERTIME_HOURS,
  canMarkLegal,
  canRecordOvertime,
  formatOvertimeHours,
  getOvertimePresets,
  normalizeOvertimeHours,
  sanitizeOvertime
} from './overtime'
import { SHIFT_TYPES } from './shifts'

/**
 * 这些规则与 core（`utils/schedule.ts` / `utils/legalOvertime.ts`）和
 * miniapp（`utils/shiftEditRules.ts`）必须一致 —— 三处口径不同的话，
 * 同一天在 Web、小程序、本地版会算出不同的加班费。
 */
describe('canRecordOvertime / canMarkLegal', () => {
  it('四个有工时的班次都能记', () => {
    expect(['白班', '夜班', '白特', '夜特'].every(shift => canRecordOvertime(shift as never))).toBe(true)
  })

  it('休息与事假不能记', () => {
    expect(canRecordOvertime('休息')).toBe(false)
    expect(canRecordOvertime('事假')).toBe(false)
  })

  it('法定标记比加班宽一档：休息日也能是法定日', () => {
    SHIFT_TYPES.forEach(shift => {
      expect(canMarkLegal(shift)).toBe(shift === '休息' ? true : canRecordOvertime(shift))
    })
  })
})

describe('getOvertimePresets', () => {
  it('白/夜普通档是 2 / 3 / 3.5', () => {
    expect(getOvertimePresets('白班', false)).toEqual([2, 3, 3.5])
    expect(getOvertimePresets('夜班', false)).toEqual([2, 3, 3.5])
  })

  it('白特/夜特直接是 10 / 11 / 11.5', () => {
    expect(getOvertimePresets('白特', false)).toEqual([10, 11, 11.5])
    expect(getOvertimePresets('夜特', false)).toEqual([10, 11, 11.5])
  })

  it('白/夜标了法定后切到整天档', () => {
    expect(getOvertimePresets('白班', true)).toEqual([10, 11, 11.5])
    expect(getOvertimePresets('夜班', true)).toEqual([10, 11, 11.5])
  })

  it('休息与事假没有预设档', () => {
    expect(getOvertimePresets('休息', false)).toEqual([])
    expect(getOvertimePresets('事假', true)).toEqual([])
  })
})

describe('normalizeOvertimeHours', () => {
  it('空与非数字都是 0', () => {
    expect(normalizeOvertimeHours('')).toBe(0)
    expect(normalizeOvertimeHours('abc')).toBe(0)
    expect(normalizeOvertimeHours(Number.NaN)).toBe(0)
  })

  it('负数与 0 都是 0', () => {
    expect(normalizeOvertimeHours(-1)).toBe(0)
    expect(normalizeOvertimeHours(0)).toBe(0)
  })

  it('向下取到 0.5 的倍数', () => {
    expect(normalizeOvertimeHours(2.7)).toBe(2.5)
    expect(normalizeOvertimeHours(3.49)).toBe(3)
    expect(normalizeOvertimeHours(0.4)).toBe(0)
    expect(normalizeOvertimeHours('2.5')).toBe(2.5)
  })

  it('封顶 24 小时', () => {
    expect(normalizeOvertimeHours(99)).toBe(MAX_OVERTIME_HOURS)
  })
})

describe('formatOvertimeHours', () => {
  it('整数不带小数点，半小时带一位', () => {
    expect(formatOvertimeHours(2)).toBe('2h')
    expect(formatOvertimeHours(3.5)).toBe('3.5h')
    expect(formatOvertimeHours(11.5)).toBe('11.5h')
  })
})

describe('sanitizeOvertime', () => {
  it('不支持加班的班次清掉小时，但休息仍可标法定', () => {
    expect(sanitizeOvertime('休息', 3, true)).toEqual({ overtimeHours: undefined, isLegal: true })
    expect(sanitizeOvertime('休息', 3, false)).toEqual({ overtimeHours: undefined, isLegal: undefined })
    expect(sanitizeOvertime('事假', 2, true)).toEqual({ overtimeHours: undefined, isLegal: undefined })
  })

  it('0 小时归一成 undefined，法定 false 也归一成 undefined', () => {
    expect(sanitizeOvertime('白班', 0, false)).toEqual({ overtimeHours: undefined, isLegal: undefined })
  })

  it('正常值保留并取整到 0.5', () => {
    expect(sanitizeOvertime('白班', 2.7, true)).toEqual({ overtimeHours: 2.5, isLegal: true })
  })
})
