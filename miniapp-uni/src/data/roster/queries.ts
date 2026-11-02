import { resolvePatterns, type CustomPattern, type PatternLookup } from '../patterns'
import type { ShiftType } from '../shifts'
import { overrideKey, type DayOverride, type Member, type Roster } from './model'

/* ------------------------------------------------------ 班序查询缓存 */

/**
 * 按 `roster.patterns` 的数组引用做缓存。
 *
 * 矩阵一屏要算 31 天 × N 人，逐个调用 `resolvePatterns()` 会重复建 Map。
 * 这里只按引用相等命中（所有 roster 更新都是不可变替换，不会出现
 * 「同一个数组被原地改动」导致缓存陈旧的情况）。
 */
let cachedPatternsRef: CustomPattern[] | null = null
let cachedLookup: PatternLookup | null = null

function lookupOf(roster: Roster): PatternLookup {
  if (!cachedLookup || cachedPatternsRef !== roster.patterns) {
    cachedPatternsRef = roster.patterns
    cachedLookup = resolvePatterns(roster.patterns)
  }
  return cachedLookup
}

/* ------------------------------------------------------------ 查询 */

export function findMember(roster: Roster, memberId: string): Member | undefined {
  return roster.members.find(member => member.id === memberId)
}

/** 本人；未设置（或指向的人已被删）返回 null */
export function getSelf(roster: Roster): Member | null {
  if (!roster.profile) return null
  return findMember(roster, roster.profile.memberId) ?? null
}

export function isSelf(roster: Roster, memberId: string): boolean {
  return roster.profile?.memberId === memberId
}

export function getOverrideMap(roster: Roster): Map<string, ShiftType> {
  const map = new Map<string, ShiftType>()
  roster.overrides.forEach(override => {
    map.set(overrideKey(override.memberId, override.date), override.shift)
  })
  return map
}

/** 整天记录（班次 + 加班 + 法定）—— 日历与弹层用这份，矩阵只需要班次那一份 */
export function getRecordMap(roster: Roster): Map<string, DayOverride> {
  const map = new Map<string, DayOverride>()
  roster.overrides.forEach(override => {
    map.set(overrideKey(override.memberId, override.date), override)
  })
  return map
}

export function getDayRecord(roster: Roster, memberId: string, date: string): DayOverride | undefined {
  const key = overrideKey(memberId, date)
  return roster.overrides.find(override => overrideKey(override.memberId, override.date) === key)
}

/** 某人某天的实际班次：优先改班记录，否则回落到模板 */
export function getEffectiveShift(
  roster: Roster,
  member: Member,
  date: string,
  overrideMap: Map<string, ShiftType>
): ShiftType | null {
  const edited = overrideMap.get(overrideKey(member.id, date))
  if (edited) return edited
  return getTemplateShift(roster, member, date)
}

export function getTemplateShift(roster: Roster, member: Member, date: string): ShiftType | null {
  return lookupOf(roster).getShift(member.patternId, date)
}

/* ------------------------------------------------------------ 展示 */

/** 班序的显示名：内置是代号（4F），自定义是用户起的名字（甲班） */
export function patternLabelOf(roster: Roster, member: Member): string {
  return lookupOf(roster).labelOf(member.patternId)
}

/** 按 id 取显示名，给设置页/下拉用 */
export function patternNameOf(roster: Roster, patternId: string): string {
  return lookupOf(roster).labelOf(patternId)
}
