import { describe, expect, it } from 'vitest'
import { getEditableShiftOptionsForBase } from './shiftEditRules'

describe('shift edit rules', () => {
  it('allows regular shifts to change between regular shifts and leave', () => {
    expect(getEditableShiftOptionsForBase('白班')).toEqual(['白班', '夜班', '事假'])
    expect(getEditableShiftOptionsForBase('夜班')).toEqual(['白班', '夜班', '事假'])
  })

  it('allows rest shifts to change only to special duty shifts', () => {
    expect(getEditableShiftOptionsForBase('休息')).toEqual(['白特', '夜特'])
  })
})
