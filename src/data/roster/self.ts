import { resolvePatterns } from '../patterns'
import { emptySalary, normalizeSalary, salaryFilledCount, type SalaryInput, type SelfIdentity } from '../profile'
import { createMemberId, type Member, type Roster } from './model'
import { getSelf } from './queries'

/* ------------------------------------------------------- 本人与薪资 */

/**
 * 改动本人身份会连带清空什么 —— 界面在动手前先拿这个算给用户看。
 *
 * 「改姓名或改班序」＝换了一个人，所以这个人名下的考勤数据与薪资一起作废。
 * 只改薪资不在此列（钱是配置，不是考勤）。
 */
export interface SelfImpact {
  /** 姓名或班序是否真的变了 */
  changed: boolean
  /** 将被清空的改班记录条数 */
  overrides: number
  /** 其中含加班的条数 */
  overtime: number
  /** 其中标了法定的条数 */
  legal: number
  /** 已填的薪资项数量（0–4） */
  salaryFilled: number
}

export function selfImpact(roster: Roster, input: SelfIdentity): SelfImpact {
  const self = getSelf(roster)
  if (!self) {
    return { changed: false, overrides: 0, overtime: 0, legal: 0, salaryFilled: 0 }
  }

  const changed = self.name !== input.name.trim() || self.patternId !== input.patternId
  const own = roster.overrides.filter(override => override.memberId === self.id)

  return {
    changed,
    overrides: own.length,
    overtime: own.filter(override => (override.overtimeHours ?? 0) > 0).length,
    legal: own.filter(override => override.isLegal === true).length,
    salaryFilled: roster.profile ? salaryFilledCount(roster.profile.salary) : 0
  }
}

/** 本人身份的校验：空、超长、与同事重名、班序不存在 */
export function validateSelf(roster: Roster, input: SelfIdentity): string[] {
  const errors: string[] = []
  const name = input.name.trim()
  const self = getSelf(roster)

  if (!name) errors.push('请填本人姓名')
  else if (name.length > 12) errors.push('姓名请控制在 12 个字以内')

  if (!resolvePatterns(roster.patterns).has(input.patternId)) errors.push('请选择本人的班序')

  if (name) {
    const clash = roster.members.some(member => member.name === name && member.id !== self?.id)
    if (clash) errors.push(`「${name}」已经是一位同事了，本人姓名不能和同事重名`)
  }

  if ((input.position ?? '').trim().length > 12) errors.push('岗位请控制在 12 个字以内')

  return errors
}

export interface ApplySelfResult {
  roster: Roster
  /** 是新建的本人（之前为 null） */
  created: boolean
  /** 因为换人而被清掉的条数 */
  clearedOverrides: number
}

/**
 * 设置 / 修改本人身份。
 *
 * 没设过 → 直接往 members 里加一条并挂上 profile；
 * 姓名或班序变了 → 更新那一条，并把**该人名下的改班记录与薪资一起清空**（视为换了个人）；
 * 只改岗位 → 原地更新岗位，不碰考勤与薪资（岗位不是身份的一部分）。
 * 姓名、班序、岗位都没变时原样返回，不动任何数据。
 */
export function applySelf(roster: Roster, input: SelfIdentity): ApplySelfResult {
  const name = input.name.trim()
  const patternId = input.patternId
  const position = (input.position ?? '').trim()
  const self = getSelf(roster)

  if (!self) {
    const member: Member = { id: createMemberId(), name, patternId, ...(position ? { position } : {}) }
    return {
      roster: {
        ...roster,
        members: [...roster.members, member],
        profile: { memberId: member.id, salary: { ...emptySalary } },
        updatedAt: Date.now()
      },
      created: true,
      clearedOverrides: 0
    }
  }

  // 姓名与班序都没变 → 不是换人，只可能改了岗位（或什么都没改），原地更新岗位
  if (self.name === name && self.patternId === patternId) {
    if ((self.position ?? '') === position) {
      return { roster, created: false, clearedOverrides: 0 }
    }
    return {
      roster: {
        ...roster,
        members: roster.members.map(member =>
          member.id === self.id ? { ...member, position: position || undefined } : member
        ),
        updatedAt: Date.now()
      },
      created: false,
      clearedOverrides: 0
    }
  }

  const keptOverrides = roster.overrides.filter(override => override.memberId !== self.id)
  return {
    roster: {
      ...roster,
      members: roster.members.map(member =>
        member.id === self.id ? { ...member, name, patternId, position: position || undefined } : member
      ),
      overrides: keptOverrides,
      // 换人 → 薪资也回到空白，不把上一个人的钱带过来
      profile: { memberId: self.id, salary: { ...emptySalary } },
      updatedAt: Date.now()
    },
    created: false,
    clearedOverrides: roster.overrides.length - keptOverrides.length
  }
}

/** 只改薪资（不动身份，因此不会触发任何清空） */
export function saveSalary(roster: Roster, salary: SalaryInput): Roster {
  if (!roster.profile) return roster
  return {
    ...roster,
    profile: { ...roster.profile, salary: normalizeSalary(salary) },
    updatedAt: Date.now()
  }
}
