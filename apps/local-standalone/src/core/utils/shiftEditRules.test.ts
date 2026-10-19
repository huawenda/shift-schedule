import { describe, expect, it } from 'vitest'
import { getEditableShiftOptionsForBase, getOvertimePresetOptions } from './shiftEditRules'

const ALL_SHIFTS = ['白班', '夜班', '休息', '白特', '夜特', '事假'] as const

describe('shift edit rules', () => {
  it('offers every shift type except the base shift', () => {
    for (const base of ALL_SHIFTS) {
      expect(getEditableShiftOptionsForBase(base)).toEqual(
        ALL_SHIFTS.filter(shift => shift !== base)
      )
    }
  })

  it('never lists the base shift itself among the options', () => {
    for (const base of ALL_SHIFTS) {
      const options = getEditableShiftOptionsForBase(base)
      expect(options).not.toContain(base)
      expect(options).toHaveLength(5)
    }
  })

  it('uses regular overtime presets for non-legal day and night shifts', () => {
    expect(getOvertimePresetOptions('白班', false)).toEqual([2, 3, 3.5])
    expect(getOvertimePresetOptions('夜班', false)).toEqual([2, 3, 3.5])
  })

  it('uses special overtime presets for special and legal regular shifts', () => {
    expect(getOvertimePresetOptions('白特', false)).toEqual([10, 11, 11.5])
    expect(getOvertimePresetOptions('夜特', false)).toEqual([10, 11, 11.5])
    expect(getOvertimePresetOptions('白班', true)).toEqual([10, 11, 11.5])
    expect(getOvertimePresetOptions('夜班', true)).toEqual([10, 11, 11.5])
  })

  it('hides overtime presets for shifts without overtime', () => {
    expect(getOvertimePresetOptions('休息', false)).toEqual([])
    expect(getOvertimePresetOptions('事假', false)).toEqual([])
  })
})
