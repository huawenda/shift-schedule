import { describe, expect, it } from 'vitest'
import { getEditableShiftOptionsForBase, getOvertimePresetOptions } from './shiftEditRules'

describe('shift edit rules', () => {
  it('hides the base shift from editable regular shift options', () => {
    expect(getEditableShiftOptionsForBase('白班')).toEqual(['夜班', '事假'])
    expect(getEditableShiftOptionsForBase('夜班')).toEqual(['白班', '事假'])
  })

  it('allows rest shifts to change only to special duty shifts', () => {
    expect(getEditableShiftOptionsForBase('休息')).toEqual(['白特', '夜特'])
  })

  it('returns no edit options when no alternative exists', () => {
    expect(getEditableShiftOptionsForBase('白特')).toEqual([])
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
