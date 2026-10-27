import { isShiftType, type ShiftType } from './shifts'
import { getPattern, getPatternShift, isPatternId, PATTERN_IDS, type PatternId } from './patterns'
import { readRaw, removeRaw, STORAGE_KEYS, writeRaw } from './storage'

/**
 * 花名册：成员 + 改班记录。
 *
 * 两个设计要点：
 * 1. 覆盖记录用 `memberId` 做键，不用姓名 —— 改名不丢历史；
 * 2. 只存「与模板不同」的日子，恢复默认 = 删除该条。
 */

export interface Member {
  id: string
  name: string
  patternId: PatternId
  /** 可选：对该班序的本地叫法（如「甲组」），不改变规律 */
  label?: string
}

export interface DayOverride {
  memberId: string
  /** 'YYYY-MM-DD' */
  date: string
  shift: ShiftType
}

export interface Roster {
  members: Member[]
  overrides: DayOverride[]
  updatedAt: number
}

export const emptyRoster: Roster = { members: [], overrides: [], updatedAt: 0 }

export const MAX_MEMBERS = 200

export function overrideKey(memberId: string, date: string): string {
  return `${memberId}|${date}`
}

export function createMemberId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `m-${Date.now().toString(36)}-${random}`
}

/* ---------------------------------------------------------------- 校验 */

export interface MemberDraft {
  name: string
  patternId: string
  label?: string
}

/** 返回中文错误文案；空数组表示通过 */
export function validateMembers(members: MemberDraft[]): string[] {
  const errors: string[] = []

  if (members.length === 0) errors.push('至少需要一位成员')
  if (members.length > MAX_MEMBERS) errors.push(`成员不能超过 ${MAX_MEMBERS} 人`)

  const seen = new Map<string, number>()
  members.forEach((member, index) => {
    const name = member.name.trim()
    if (!name) {
      errors.push(`第 ${index + 1} 行还没有填姓名`)
      return
    }
    if (name.length > 12) errors.push(`「${name}」太长了，姓名请控制在 12 个字以内`)
    if (!isPatternId(member.patternId)) errors.push(`「${name}」还没有选班序`)

    const previous = seen.get(name)
    if (previous !== undefined) errors.push(`「${name}」出现了两次（第 ${previous + 1} 行和第 ${index + 1} 行）`)
    else seen.set(name, index)
  })

  return errors
}

/* ------------------------------------------------------------ 归一化 */

function normalizeMember(value: unknown): Member | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const patternId = record.patternId

  if (!id || !name || !isPatternId(patternId)) return null

  const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim().slice(0, 12) : undefined
  return { id, name, patternId, ...(label ? { label } : {}) }
}

function normalizeOverride(value: unknown, memberIds: Set<string>): DayOverride | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const memberId = typeof record.memberId === 'string' ? record.memberId.trim() : ''
  const date = typeof record.date === 'string' ? record.date.trim() : ''
  const shift = record.shift

  if (!memberId || !memberIds.has(memberId)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!isShiftType(shift)) return null

  return { memberId, date, shift }
}

/** 把任意来源（旧文件、手改的 JSON）收敛成合法花名册，绝不抛异常 */
export function normalizeRoster(value: unknown): Roster {
  if (typeof value !== 'object' || value === null) return { ...emptyRoster }
  const record = value as Record<string, unknown>

  const rawMembers = Array.isArray(record.members) ? record.members : []
  const members: Member[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  rawMembers.forEach(item => {
    const member = normalizeMember(item)
    if (!member) return
    if (ids.has(member.id) || names.has(member.name)) return
    ids.add(member.id)
    names.add(member.name)
    members.push(member)
  })

  const rawOverrides = Array.isArray(record.overrides) ? record.overrides : []
  const byKey = new Map<string, DayOverride>()
  rawOverrides.forEach(item => {
    const override = normalizeOverride(item, ids)
    if (!override) return
    byKey.set(overrideKey(override.memberId, override.date), override)
  })

  return {
    members,
    overrides: [...byKey.values()].sort((left, right) =>
      overrideKey(left.memberId, left.date).localeCompare(overrideKey(right.memberId, right.date))
    ),
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0
  }
}

/* -------------------------------------------------------------- 读取 */

export function transformRoster(roster: Roster, produce: (draft: Roster) => Roster): Roster {
  return { ...produce(roster), updatedAt: Date.now() }
}

export function loadRoster(): Roster {
  const raw = readRaw(STORAGE_KEYS.roster)
  if (!raw) return { ...emptyRoster }

  try {
    return normalizeRoster(JSON.parse(raw))
  } catch {
    return { ...emptyRoster }
  }
}

/** 返回 false 表示只写进了内存，刷新会丢 */
export function saveRoster(roster: Roster): boolean {
  return writeRaw(STORAGE_KEYS.roster, JSON.stringify({ ...roster, updatedAt: Date.now() }))
}

export function clearRoster(): void {
  removeRaw(STORAGE_KEYS.roster)
}

export function isRosterEmpty(roster: Roster): boolean {
  return roster.members.length === 0
}

/* ------------------------------------------------------------ 查询 */

export function findMember(roster: Roster, memberId: string): Member | undefined {
  return roster.members.find(member => member.id === memberId)
}

export function getOverrideMap(roster: Roster): Map<string, ShiftType> {
  const map = new Map<string, ShiftType>()
  roster.overrides.forEach(override => {
    map.set(overrideKey(override.memberId, override.date), override.shift)
  })
  return map
}

/** 某人某天的实际班次：优先改班记录，否则回落到模板 */
export function getEffectiveShift(
  member: Member,
  date: string,
  overrideMap: Map<string, ShiftType>
): ShiftType | null {
  const edited = overrideMap.get(overrideKey(member.id, date))
  if (edited) return edited
  return getPatternShift(member.patternId, date)
}

export function getTemplateShift(member: Member, date: string): ShiftType | null {
  return getPatternShift(member.patternId, date)
}

export function isEdited(memberId: string, date: string, overrideMap: Map<string, ShiftType>): boolean {
  return overrideMap.has(overrideKey(memberId, date))
}

/**
 * 改某人某天的班。
 * `shift === null` 或改回模板值时，删除记录（不留空值）。
 */
export function applyShiftEdit(
  roster: Roster,
  memberId: string,
  date: string,
  shift: ShiftType | null
): Roster {
  const member = findMember(roster, memberId)
  if (!member) return roster

  const key = overrideKey(memberId, date)
  const rest = roster.overrides.filter(override => overrideKey(override.memberId, override.date) !== key)
  const templateShift = getTemplateShift(member, date)

  if (!shift || shift === templateShift) {
    return { ...roster, overrides: rest, updatedAt: Date.now() }
  }

  return {
    ...roster,
    overrides: [...rest, { memberId, date, shift }],
    updatedAt: Date.now()
  }
}

/** 删除成员时连带清掉他的全部改班记录；返回被清理的条数 */
export function removeMember(roster: Roster, memberId: string): { roster: Roster; removedOverrides: number } {
  const kept = roster.overrides.filter(override => override.memberId !== memberId)
  return {
    roster: {
      ...roster,
      members: roster.members.filter(member => member.id !== memberId),
      overrides: kept,
      updatedAt: Date.now()
    },
    removedOverrides: roster.overrides.length - kept.length
  }
}

/** 统计某人有多少条改班记录（删除前提示用） */
export function countOverrides(roster: Roster, memberId: string): number {
  return roster.overrides.filter(override => override.memberId === memberId).length
}

/** 每个班序当前挂了谁 —— 设置页与向导里做提示用 */
export function groupByPattern(roster: Roster): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}
  PATTERN_IDS.forEach(id => { grouped[id] = [] })
  roster.members.forEach(member => {
    grouped[member.patternId] = [...(grouped[member.patternId] ?? []), member.name]
  })
  return grouped
}

export function patternLabelOf(member: Member): string {
  const pattern = getPattern(member.patternId)
  return pattern ? `${pattern.id}${member.label ? ` · ${member.label}` : ''}` : member.patternId
}
