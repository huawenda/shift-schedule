import { describe, expect, it } from 'vitest'
import {
  applyShiftEdit,
  countOverrides,
  getEffectiveShift,
  getOverrideMap,
  normalizeRoster,
  normalizeRosterDetailed,
  overrideKey,
  patternLabelOf,
  patternUsage,
  removeMember,
  removePattern,
  upsertPattern,
  validateMembers,
  type Roster
} from './roster'
import { createBlankCustomPattern, getPatternShift, PATTERN_CYCLE_LENGTH } from './patterns'

const roster: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4F' },
    { id: 'm3', name: '周涛', patternId: '4J' }
  ],
  overrides: [],
  patterns: [],
  updatedAt: 0
}

/** 一条自定义班序：第 1 天白班，其余休息 */
function customPattern(id = 'cp-1', name = '甲班') {
  return {
    id,
    name,
    shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, (_, index) =>
      index === 0 ? ('白班' as const) : ('休息' as const)
    )
  }
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

  it('认得自定义班序', () => {
    expect(validateMembers([{ name: '王磊', patternId: 'cp-1' }], [customPattern()])).toEqual([])
    // 没把自定义班序传进来时，它就是不认识的 id
    expect(validateMembers([{ name: '王磊', patternId: 'cp-1' }]).length).toBe(1)
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
    expect(normalizeRoster({ patterns: 'nope' }).patterns).toEqual([])
  })

  it('没有 patterns 字段的旧数据照样读（v2 之前）', () => {
    const normalized = normalizeRoster({
      members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
      overrides: []
    })
    expect(normalized.patterns).toEqual([])
    expect(normalized.members).toHaveLength(1)
  })

  it('带 label 的旧数据：label 被忽略，人还在', () => {
    const normalized = normalizeRoster({
      members: [{ id: 'm1', name: '王磊', patternId: '4F', label: '甲组' }],
      overrides: []
    })
    expect(normalized.members).toEqual([{ id: 'm1', name: '王磊', patternId: '4F' }])
  })

  it('引用了自定义班序的成员不会被丢掉 —— 解析顺序的回归测试', () => {
    const normalized = normalizeRoster({
      // 故意把 patterns 放在 members 后面，模拟键顺序不同的 JSON
      members: [{ id: 'm1', name: '王磊', patternId: 'cp-1' }],
      overrides: [],
      patterns: [customPattern()]
    })
    expect(normalized.members.map(member => member.name)).toEqual(['王磊'])
    expect(normalized.patterns).toHaveLength(1)
  })

  it('班序真的不存在时才丢人，并报出姓名', () => {
    const { roster: normalized, droppedMembers } = normalizeRosterDetailed({
      members: [
        { id: 'm1', name: '王磊', patternId: '4F' },
        { id: 'm2', name: '李静', patternId: 'cp-没这条' }
      ],
      overrides: []
    })
    expect(normalized.members.map(member => member.name)).toEqual(['王磊'])
    expect(droppedMembers).toEqual(['李静'])
  })
})

describe('applyShiftEdit', () => {
  const date = '2026-10-20'
  const templateShift = getPatternShift('4F', date)!

  it('改成与模板不同的班次后，产生一条记录', () => {
    const next = applyShiftEdit(roster, 'm1', date, '白特')
    expect(next.overrides).toEqual([{ memberId: 'm1', date, shift: '白特' }])
    expect(getEffectiveShift(next, next.members[0], date, getOverrideMap(next))).toBe('白特')
  })

  it('改回模板值等于删除记录，不留空值', () => {
    const edited = applyShiftEdit(roster, 'm1', date, '白特')
    const restored = applyShiftEdit(edited, 'm1', date, templateShift)
    expect(restored.overrides).toEqual([])
    expect(getEffectiveShift(restored, restored.members[0], date, getOverrideMap(restored))).toBe(templateShift)
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
    expect(getEffectiveShift(next, next.members[0], date, map)).toBe(templateShift)
    expect(getEffectiveShift(next, next.members[1], date, map)).toBe('休息')
  })

  it('改不存在的成员：原样返回', () => {
    expect(applyShiftEdit(roster, 'ghost', date, '白班')).toBe(roster)
  })

  it('挂在自定义班序上的人也能改班，模板值取自自定义序列', () => {
    const withPattern = upsertPattern(roster, customPattern())
    const withMember = {
      ...withPattern,
      members: [...withPattern.members, { id: 'm4', name: '孙强', patternId: 'cp-1' }]
    }
    // 锚点日取自定义序列第一位 = 白班，改成白班应视为「没改」
    expect(applyShiftEdit(withMember, 'm4', '2026-06-07', '白班').overrides).toHaveLength(0)
    expect(applyShiftEdit(withMember, 'm4', '2026-06-07', '夜班').overrides).toHaveLength(1)
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

describe('班序维护', () => {
  it('upsertPattern 新增一条', () => {
    const next = upsertPattern(roster, customPattern())
    expect(next.patterns).toHaveLength(1)
    expect(next.patterns[0].name).toBe('甲班')
  })

  it('upsertPattern 按 id 更新已有的一条', () => {
    const once = upsertPattern(roster, customPattern())
    const twice = upsertPattern(once, { ...customPattern(), name: '甲班（改）' })
    expect(twice.patterns).toHaveLength(1)
    expect(twice.patterns[0].name).toBe('甲班（改）')
  })

  it('patternUsage 报出挂在这条班序上的人和记录数', () => {
    let next = upsertPattern(roster, customPattern())
    next = { ...next, members: [...next.members, { id: 'm4', name: '孙强', patternId: 'cp-1' }] }
    next = applyShiftEdit(next, 'm4', '2026-10-20', '夜班')

    const usage = patternUsage(next, 'cp-1')
    expect(usage.members).toEqual(['孙强'])
    expect(usage.overrides).toBe(1)
  })

  it('删除自定义班序：连带删除挂在上面的成员与改班记录', () => {
    let next = upsertPattern(roster, customPattern())
    next = { ...next, members: [...next.members, { id: 'm4', name: '孙强', patternId: 'cp-1' }] }
    next = applyShiftEdit(next, 'm4', '2026-10-20', '夜班')

    const result = removePattern(next, 'cp-1')
    expect(result.refused).toBe(false)
    expect(result.removedMembers).toEqual(['孙强'])
    expect(result.removedOverrides).toBe(1)
    expect(result.roster.patterns).toHaveLength(0)
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静', '周涛'])
    expect(result.roster.overrides).toHaveLength(0)
  })

  it('内置班序拒绝删除', () => {
    const result = removePattern(roster, '4F')
    expect(result.refused).toBe(true)
    expect(result.roster).toBe(roster)
  })

  it('显示名：内置是代号，自定义是名字', () => {
    const withPattern = upsertPattern(roster, customPattern())
    expect(patternLabelOf(withPattern, withPattern.members[0])).toBe('4F')

    const customMember = { id: 'm4', name: '孙强', patternId: 'cp-1' }
    expect(patternLabelOf(withPattern, customMember)).toBe('甲班')
  })
})

describe('overrideKey', () => {
  it('用 memberId 而不是姓名做键 —— 改名不丢记录', () => {
    const edited = applyShiftEdit(roster, 'm1', '2026-10-20', '白特')
    const renamed = {
      ...edited,
      members: edited.members.map(member => (member.id === 'm1' ? { ...member, name: '王雷' } : member))
    }
    expect(getEffectiveShift(renamed, renamed.members[0], '2026-10-20', getOverrideMap(renamed))).toBe('白特')
    expect(overrideKey('m1', '2026-10-20')).toBe('m1|2026-10-20')
  })
})
