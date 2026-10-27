import { describe, expect, it } from 'vitest'
import {
  applyShiftEdit,
  countOverrides,
  getEffectiveShift,
  getOverrideMap,
  normalizeRoster,
  overrideKey,
  removeMember,
  validateMembers,
  type Roster
} from './roster'
import { getPatternShift } from './patterns'

const roster: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4F' },
    { id: 'm3', name: '周涛', patternId: '4J' }
  ],
  overrides: [],
  updatedAt: 0
}

describe('validateMembers', () => {
  it('至少一人', () => {
    expect(validateMembers([])).toContain('至少需要一位成员')
  })

  it('拦重名与空名', () => {
    const errors = validateMembers([
      { name: '王磊', patternId: '4F' },
      { name: ' 王磊 ', patternId: '4G' },
      { name: '  ', patternId: '4J' }
    ])
    expect(errors.some(error => error.includes('出现了两次'))).toBe(true)
    expect(errors.some(error => error.includes('还没有填姓名'))).toBe(true)
  })

  it('拦未选班序', () => {
    expect(validateMembers([{ name: '王磊', patternId: '' }]).some(e => e.includes('还没有选班序'))).toBe(true)
  })

  it('合法草稿没有错误', () => {
    expect(validateMembers([
      { name: '王磊', patternId: '4F' },
      { name: '李静', patternId: '4F' }
    ])).toEqual([])
  })
})

describe('normalizeRoster', () => {
  it('丢掉非法成员、去重、过滤孤儿记录', () => {
    const normalized = normalizeRoster({
      members: [
        { id: 'm1', name: '王磊', patternId: '4F' },
        { id: 'm1', name: '重复ID', patternId: '4G' },
        { id: 'm2', name: '王磊', patternId: '4H' },
        { id: 'm3', name: '李静', patternId: '9Z' },
        null
      ],
      overrides: [
        { memberId: 'm1', date: '2026-10-20', shift: '休息' },
        { memberId: 'ghost', date: '2026-10-20', shift: '休息' },
        { memberId: 'm1', date: '不是日期', shift: '休息' },
        { memberId: 'm1', date: '2026-10-21', shift: '加班' }
      ]
    })

    expect(normalized.members.map(member => member.name)).toEqual(['王磊'])
    expect(normalized.overrides).toHaveLength(1)
  })

  it('脏数据不抛异常', () => {
    expect(normalizeRoster(null).members).toEqual([])
    expect(normalizeRoster('nope').members).toEqual([])
    expect(normalizeRoster({ members: 'nope' }).overrides).toEqual([])
  })
})

describe('applyShiftEdit', () => {
  const date = '2026-10-20'
  const templateShift = getPatternShift('4F', date)!

  it('改成与模板不同的班次后，产生一条记录', () => {
    const next = applyShiftEdit(roster, 'm1', date, '白特')
    expect(next.overrides).toEqual([{ memberId: 'm1', date, shift: '白特' }])
    expect(getEffectiveShift(next.members[0], date, getOverrideMap(next))).toBe('白特')
  })

  it('改回模板值等于删除记录，不留空值', () => {
    const edited = applyShiftEdit(roster, 'm1', date, '白特')
    const restored = applyShiftEdit(edited, 'm1', date, templateShift)
    expect(restored.overrides).toEqual([])
    expect(getEffectiveShift(restored.members[0], date, getOverrideMap(restored))).toBe(templateShift)
  })

  it('显式恢复默认（null）也删除记录', () => {
    const edited = applyShiftEdit(roster, 'm1', date, '白特')
    expect(applyShiftEdit(edited, 'm1', date, null).overrides).toEqual([])
  })

  it('同一个人同一天只有一条记录（覆盖写）', () => {
    let next = applyShiftEdit(roster, 'm1', date, '白特')
    next = applyShiftEdit(next, 'm1', date, '事假')
    expect(next.overrides).toHaveLength(1)
    expect(next.overrides[0].shift).toBe('事假')
  })

  it('同一班序的两个人各自独立改班，互不影响', () => {
    const next = applyShiftEdit(roster, 'm2', date, '休息')
    const map = getOverrideMap(next)
    expect(getEffectiveShift(next.members[0], date, map)).toBe(templateShift)
    expect(getEffectiveShift(next.members[1], date, map)).toBe('休息')
  })

  it('改不存在的成员：原样返回', () => {
    expect(applyShiftEdit(roster, 'ghost', date, '白班')).toBe(roster)
  })
})

describe('removeMember', () => {
  it('删成员时连带清掉他的记录，并报告条数', () => {
    let next = applyShiftEdit(roster, 'm1', '2026-10-20', '白特')
    next = applyShiftEdit(next, 'm1', '2026-10-21', '事假')
    next = applyShiftEdit(next, 'm2', '2026-10-20', '休息')

    expect(countOverrides(next, 'm1')).toBe(2)

    const { roster: after, removedOverrides } = removeMember(next, 'm1')
    expect(removedOverrides).toBe(2)
    expect(after.members.map(member => member.id)).toEqual(['m2', 'm3'])
    expect(after.overrides).toEqual([{ memberId: 'm2', date: '2026-10-20', shift: '休息' }])
  })
})

describe('overrideKey', () => {
  it('用 memberId 而不是姓名做键 —— 改名不丢记录', () => {
    const edited = applyShiftEdit(roster, 'm1', '2026-10-20', '白特')
    const renamed = {
      ...edited,
      members: edited.members.map(member => (member.id === 'm1' ? { ...member, name: '王雷' } : member))
    }
    expect(getEffectiveShift(renamed.members[0], '2026-10-20', getOverrideMap(renamed))).toBe('白特')
    expect(overrideKey('m1', '2026-10-20')).toBe('m1|2026-10-20')
  })
})
