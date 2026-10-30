import { describe, expect, it } from 'vitest'
import {
  applySelf,
  getSelf,
  isSelf,
  normalizeRoster,
  removePattern,
  saveSalary,
  selfImpact,
  upsertPattern,
  validateMembers,
  validateSelf,
  type Roster
} from './roster'
import { emptySalary, parseMoney, sanitizeMoneyInput } from './profile'
import { PATTERN_CYCLE_LENGTH } from './patterns'

const base: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4J' }
  ],
  overrides: [
    { memberId: 'm1', date: '2026-10-20', shift: '白特', overtimeHours: 3 },
    { memberId: 'm1', date: '2026-10-21', shift: '夜班', overtimeHours: 2, isLegal: true },
    { memberId: 'm2', date: '2026-10-22', shift: '休息' }
  ],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

/** 已经设好本人在 m1 上，且薪资填了两项 */
const withSelf: Roster = {
  ...base,
  profile: {
    memberId: 'm1',
    salary: { ...emptySalary, baseSalary: '8000', socialFund: '1200' }
  }
}

function customPattern(id = 'cp-1', name = '甲班') {
  return {
    id,
    name,
    shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, (_, index) =>
      index === 0 ? ('白班' as const) : ('休息' as const)
    )
  }
}

describe('金额输入清洗', () => {
  it('只留数字与一个小数点，小数最多两位', () => {
    expect(sanitizeMoneyInput('8000')).toBe('8000')
    expect(sanitizeMoneyInput('¥8,000.987')).toBe('8000.98')
    expect(sanitizeMoneyInput('12.3.4')).toBe('12.34')
    expect(sanitizeMoneyInput('abc')).toBe('')
    expect(sanitizeMoneyInput('')).toBe('')
  })

  it('前导 0 被去掉，但「0」与「0.5」要保留', () => {
    expect(sanitizeMoneyInput('007')).toBe('7')
    expect(sanitizeMoneyInput('0')).toBe('0')
    expect(sanitizeMoneyInput('0.5')).toBe('0.5')
  })

  it('整数位截断到 7 位，防止填出天文数字', () => {
    expect(sanitizeMoneyInput('123456789')).toBe('1234567')
  })

  it('解析成数字：空、非法、负数一律按 0', () => {
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('abc')).toBe(0)
    expect(parseMoney('8000.555')).toBe(8000.56)
    expect(parseMoney('0')).toBe(0)
  })
})

describe('设置本人', () => {
  it('还没设过本人时，新建一条成员并挂上 profile，薪资为空', () => {
    const result = applySelf(base, { name: '王磊', patternId: '4F' })

    expect(result.created).toBe(true)
    expect(result.clearedOverrides).toBe(0)
    expect(result.roster.profile?.memberId).toBe(result.roster.members[result.roster.members.length - 1]?.id)
    expect(result.roster.profile?.salary).toEqual(emptySalary)
    // 原有成员一个不少，新本人追加在末尾
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静', '王磊'])
  })

  it('姓名或班序没变时原样返回，不动任何数据', () => {
    const same = applySelf(withSelf, { name: '王磊', patternId: '4F' })
    expect(same.roster).toBe(withSelf)
    expect(same.clearedOverrides).toBe(0)
  })

  it('改名 = 换人：清掉本人全部改班记录（含加班、法定），薪资一并清空', () => {
    const result = applySelf(withSelf, { name: '王小明', patternId: '4F' })

    expect(result.clearedOverrides).toBe(2)
    expect(result.roster.members[0].name).toBe('王小明')
    // 同事的记录一条都不能动
    expect(result.roster.overrides).toEqual([{ memberId: 'm2', date: '2026-10-22', shift: '休息' }])
    expect(result.roster.profile?.salary).toEqual(emptySalary)
    // memberId 不变，避免牵连别处引用
    expect(result.roster.profile?.memberId).toBe('m1')
  })

  it('只改班序也算换人', () => {
    const result = applySelf(withSelf, { name: '王磊', patternId: '4G' })
    expect(result.clearedOverrides).toBe(2)
    expect(result.roster.members[0].patternId).toBe('4G')
  })

  it('只改岗位不算换人：原地更新岗位，不清考勤也不清薪资', () => {
    const result = applySelf(withSelf, { name: '王磊', patternId: '4F', position: '班长' })
    expect(result.clearedOverrides).toBe(0)
    expect(result.roster.members[0].position).toBe('班长')
    expect(result.roster.overrides).toEqual(withSelf.overrides)
    expect(result.roster.profile?.salary).toEqual(withSelf.profile?.salary)
  })

  it('清空岗位也只是原地更新，不动数据', () => {
    const withPosition: Roster = {
      ...withSelf,
      members: withSelf.members.map(member =>
        member.id === 'm1' ? { ...member, position: '班长' } : member
      )
    }
    const result = applySelf(withPosition, { name: '王磊', patternId: '4F', position: '' })
    expect(result.clearedOverrides).toBe(0)
    expect(result.roster.members[0].position).toBeUndefined()
  })

  it('换人时岗位一并写入', () => {
    const result = applySelf(withSelf, { name: '王小明', patternId: '4F', position: '主管' })
    expect(result.roster.members[0].position).toBe('主管')
    expect(result.clearedOverrides).toBe(2)
  })

  it('自建班序也能设成本人的班序', () => {
    const withPattern = upsertPattern(base, customPattern())
    const result = applySelf(withPattern, { name: '王磊', patternId: 'cp-1' })
    expect(result.roster.profile).toEqual({ memberId: getSelf(result.roster)?.id, salary: emptySalary })
    expect(getSelf(result.roster)?.patternId).toBe('cp-1')
  })
})

describe('换人的影响面（确认弹层用）', () => {
  it('数清将被清掉的记录、其中多少条加班/法定、薪资填了几项', () => {
    const impact = selfImpact(withSelf, { name: '王小明', patternId: '4F' })
    expect(impact.changed).toBe(true)
    expect(impact.overrides).toBe(2)
    expect(impact.overtime).toBe(2)
    expect(impact.legal).toBe(1)
    expect(impact.salaryFilled).toBe(2)
  })

  it('没改动时 changed 为 false，界面据此不弹确认', () => {
    expect(selfImpact(withSelf, { name: '王磊', patternId: '4F' }).changed).toBe(false)
  })

  it('还没设本人时不报「会清掉」', () => {
    const impact = selfImpact(base, { name: '王磊', patternId: '4F' })
    expect(impact).toEqual({ changed: false, overrides: 0, overtime: 0, legal: 0, salaryFilled: 0 })
  })
})

describe('本人身份的校验', () => {
  it('姓名为空 / 超过 12 字 / 班序不存在都要拦', () => {
    expect(validateSelf(base, { name: '  ', patternId: '4F' }).length).toBeGreaterThan(0)
    expect(validateSelf(base, { name: '一二三四五六七八九十一二三', patternId: '4F' })).toContain(
      '姓名请控制在 12 个字以内'
    )
    expect(validateSelf(base, { name: '王磊', patternId: 'nope' })).toContain('请选择本人的班序')
  })

  it('岗位超过 12 字要拦', () => {
    expect(validateSelf(base, { name: '王磊', patternId: '4F', position: '一二三四五六七八九十一二三' })).toContain(
      '岗位请控制在 12 个字以内'
    )
  })

  it('本人姓名不能和同事重名，但不能把自己判成重名', () => {
    const clash = validateSelf(withSelf, { name: '李静', patternId: '4F' })
    expect(clash.some(error => error.includes('不能和同事重名'))).toBe(true)

    // 设自己现在的名字不算冲突
    expect(validateSelf(withSelf, { name: '王磊', patternId: '4F' })).toEqual([])
  })
})

describe('薪资独立保存', () => {
  it('只改薪资不会碰考勤记录，也不会清空身份', () => {
    const next = saveSalary(withSelf, { ...emptySalary, baseSalary: '9000' })
    expect(next.overrides).toEqual(withSelf.overrides)
    expect(next.profile?.memberId).toBe('m1')
    expect(next.profile?.salary.baseSalary).toBe('9000')
  })

  it('输入带脏字符也会被清洗后落库', () => {
    const next = saveSalary(withSelf, { ...emptySalary, baseSalary: '9,000.456' })
    expect(next.profile?.salary.baseSalary).toBe('9000.45')
  })

  it('还没设本人时保存薪资是空操作', () => {
    expect(saveSalary(base, { ...emptySalary, baseSalary: '1' })).toBe(base)
  })
})

describe('本人不能被顺手删掉', () => {
  it('删除本人所在的班序被拒绝（否则连人带记录一起没了）', () => {
    const withPattern = upsertPattern(base, customPattern())
    const roster: Roster = {
      ...withPattern,
      members: withPattern.members.map(member =>
        member.id === 'm1' ? { ...member, patternId: 'cp-1' } : member
      ),
      profile: { memberId: 'm1', salary: { ...emptySalary } }
    }

    const result = removePattern(roster, 'cp-1')
    expect(result.blocked).toBe('self')
    expect(result.roster).toBe(roster)
  })

  it('本人不在这条班序上时，照常删除并连带清人', () => {
    const withPattern = upsertPattern(base, customPattern())
    const roster: Roster = {
      ...withPattern,
      members: withPattern.members.map(member =>
        member.id === 'm2' ? { ...member, patternId: 'cp-1' } : member
      ),
      profile: { memberId: 'm1', salary: { ...emptySalary } }
    }

    const result = removePattern(roster, 'cp-1')
    expect(result.blocked).toBe(null)
    expect(result.removedMembers).toEqual(['李静'])
  })
})

describe('新增成员不能与本人同名', () => {
  it('与本人同名的同事被拦下', () => {
    const errors = validateMembers(
      [
        { name: '王磊', patternId: '4F' },
        { name: '李静', patternId: '4J' }
      ],
      [],
      { selfId: 'm1', selfName: '王磊' }
    )
    expect(errors.some(error => error.includes('与本人同名'))).toBe(true)
  })

  it('本人那一行本身不参与这条检查', () => {
    const errors = validateMembers(
      [
        { id: 'm1', name: '王磊', patternId: '4F' },
        { id: 'm2', name: '李静', patternId: '4J' }
      ],
      [],
      { selfId: 'm1', selfName: '王磊' }
    )
    expect(errors).toEqual([])
  })

  it('与本人同名时不再叠一条「出现了两次」', () => {
    const errors = validateMembers([{ name: '王磊', patternId: '4F' }], [], {
      selfId: 'm1',
      selfName: '王磊'
    })
    expect(errors.some(error => error.includes('与本人同名'))).toBe(true)
    expect(errors.filter(error => error.includes('出现了两次'))).toEqual([])
  })
})

describe('归一化里的本人指针', () => {
  it('正常还原 profile', () => {
    const next = normalizeRoster(withSelf)
    expect(next.profile?.memberId).toBe('m1')
    expect(next.profile?.salary.baseSalary).toBe('8000')
  })

  it('指向不存在的成员时归零，不抛异常也不拖累成员', () => {
    const next = normalizeRoster({
      ...withSelf,
      profile: { memberId: 'ghost', salary: { baseSalary: '1' } }
    })
    expect(next.profile).toBe(null)
    expect(next.members).toHaveLength(2)
  })

  it('没设本人（旧数据）时为 null，不是报错', () => {
    expect(normalizeRoster(base).profile).toBe(null)
  })
})

describe('isSelf', () => {
  it('只有 profile 指向的那一条算本人', () => {
    expect(isSelf(withSelf, 'm1')).toBe(true)
    expect(isSelf(withSelf, 'm2')).toBe(false)
    expect(isSelf(base, 'm1')).toBe(false)
  })
})
