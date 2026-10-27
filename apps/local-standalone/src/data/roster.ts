import { isShiftType, type ShiftType } from './shifts'
import {
  BUILTIN_PATTERN_IDS,
  isBuiltinPatternId,
  normalizeCustomPatterns,
  resolvePatterns,
  type CustomPattern,
  type PatternLookup
} from './patterns'
import { readRaw, removeRaw, STORAGE_KEYS, writeRaw } from './storage'

/**
 * 花名册：自定义班序 + 成员 + 改班记录。
 *
 * 三个设计要点：
 * 1. 覆盖记录用 `memberId` 做键，不用姓名 —— 改名不丢历史；
 * 2. 只存「与模板不同」的日子，恢复默认 = 删除该条；
 * 3. 自定义班序与成员存在同一份数据里 —— 导入时必须同时替换，
 *    否则成员的 patternId 会指向不存在的班序，人会被归一化丢掉。
 */

export interface Member {
  id: string
  name: string
  /** 内置代号（4F…4X）或自定义班序的 id */
  patternId: string
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
  /** 用户自建的班序，上限 MAX_CUSTOM_PATTERNS */
  patterns: CustomPattern[]
  updatedAt: number
}

export const emptyRoster: Roster = { members: [], overrides: [], patterns: [], updatedAt: 0 }

export const MAX_MEMBERS = 200

export function overrideKey(memberId: string, date: string): string {
  return `${memberId}|${date}`
}

export function createMemberId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `m-${Date.now().toString(36)}-${random}`
}

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

/* ---------------------------------------------------------------- 校验 */

export interface MemberDraft {
  name: string
  patternId: string
}

/** 返回中文错误文案；空数组表示通过。`customs` 用于认出自定义班序 */
export function validateMembers(members: MemberDraft[], customs: CustomPattern[] = []): string[] {
  const errors: string[] = []
  const lookup = resolvePatterns(customs)

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
    if (!lookup.has(member.patternId)) errors.push(`「${name}」还没有选班序`)

    const previous = seen.get(name)
    if (previous !== undefined) errors.push(`「${name}」出现了两次（第 ${previous + 1} 行和第 ${index + 1} 行）`)
    else seen.set(name, index)
  })

  return errors
}

/* ------------------------------------------------------------ 归一化 */

function normalizeMember(value: unknown, knownPatternIds: Set<string>): Member | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const patternId = typeof record.patternId === 'string' ? record.patternId.trim() : ''

  if (!id || !name || !knownPatternIds.has(patternId)) return null

  return { id, name, patternId }
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

export interface NormalizeResult {
  roster: Roster
  /** 因班序不存在 / 重名 / 重复 id 而被移出的成员姓名，供界面提示 */
  droppedMembers: string[]
}

/**
 * 把任意来源（旧文件、手改的 JSON、旧版备份）收敛成合法花名册，绝不抛异常。
 *
 * ⚠️ **顺序不能反**：必须先解析自定义班序、拿到合法 patternId 集合，
 * 再校验成员。反过来的话，引用了自定义班序的成员会被判成「班序不存在」
 * 而整条丢掉 —— 用户会看到自己建的人凭空消失，且没有任何提示。
 */
export function normalizeRosterDetailed(value: unknown): NormalizeResult {
  if (typeof value !== 'object' || value === null) {
    return { roster: { ...emptyRoster }, droppedMembers: [] }
  }
  const record = value as Record<string, unknown>

  const patterns = normalizeCustomPatterns(record.patterns)
  const knownPatternIds = new Set<string>([...BUILTIN_PATTERN_IDS, ...patterns.map(pattern => pattern.id)])

  const rawMembers = Array.isArray(record.members) ? record.members : []
  const members: Member[] = []
  const droppedMembers: string[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  rawMembers.forEach(item => {
    const rawName =
      typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string'
        ? ((item as Record<string, unknown>).name as string).trim()
        : ''

    const member = normalizeMember(item, knownPatternIds)
    if (!member) {
      if (rawName) droppedMembers.push(rawName)
      return
    }
    if (ids.has(member.id) || names.has(member.name)) {
      droppedMembers.push(member.name)
      return
    }
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
    roster: {
      members,
      patterns,
      overrides: [...byKey.values()].sort((left, right) =>
        overrideKey(left.memberId, left.date).localeCompare(overrideKey(right.memberId, right.date))
      ),
      updatedAt:
        typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0
    },
    droppedMembers
  }
}

/** 只关心结果时用这个；需要知道谁被丢了用 `normalizeRosterDetailed` */
export function normalizeRoster(value: unknown): Roster {
  return normalizeRosterDetailed(value).roster
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
  const templateShift = getTemplateShift(roster, member, date)

  if (!shift || shift === templateShift) {
    return { ...roster, overrides: rest, updatedAt: Date.now() }
  }

  return {
    ...roster,
    overrides: [...rest, { memberId, date, shift }],
    updatedAt: Date.now()
  }
}

/* ------------------------------------------------------------ 成员维护 */

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

/* ------------------------------------------------------------ 班序维护 */

/** 新建或更新一条自定义班序（按 id 判断是哪种） */
export function upsertPattern(roster: Roster, pattern: CustomPattern): Roster {
  const exists = roster.patterns.some(item => item.id === pattern.id)
  const patterns = exists
    ? roster.patterns.map(item => (item.id === pattern.id ? pattern : item))
    : [...roster.patterns, pattern]

  return { ...roster, patterns, updatedAt: Date.now() }
}

export interface PatternUsage {
  /** 挂在这条班序上的成员姓名 */
  members: string[]
  /** 这些人名下的改班记录总数 */
  overrides: number
}

/** 删除某条班序之前，先算清会牵连到谁（界面二次确认要用） */
export function patternUsage(roster: Roster, patternId: string): PatternUsage {
  const victims = roster.members.filter(member => member.patternId === patternId)
  const ids = new Set(victims.map(member => member.id))
  return {
    members: victims.map(member => member.name),
    overrides: roster.overrides.filter(override => ids.has(override.memberId)).length
  }
}

export interface RemovePatternResult {
  roster: Roster
  /** 同时被删掉的成员姓名 */
  removedMembers: string[]
  removedOverrides: number
  /** 内置班序不允许删，此时为 true 且 roster 原样返回 */
  refused: boolean
}

/**
 * 删除一条自定义班序，**连带删除挂在上面的成员与其改班记录**。
 * 内置 13 条拒绝删除（返回 refused: true）。
 */
export function removePattern(roster: Roster, patternId: string): RemovePatternResult {
  if (isBuiltinPatternId(patternId)) {
    return { roster, removedMembers: [], removedOverrides: 0, refused: true }
  }

  const victims = roster.members.filter(member => member.patternId === patternId)
  const victimIds = new Set(victims.map(member => member.id))
  const keptOverrides = roster.overrides.filter(override => !victimIds.has(override.memberId))

  return {
    roster: {
      ...roster,
      patterns: roster.patterns.filter(pattern => pattern.id !== patternId),
      members: roster.members.filter(member => member.patternId !== patternId),
      overrides: keptOverrides,
      updatedAt: Date.now()
    },
    removedMembers: victims.map(member => member.name),
    removedOverrides: roster.overrides.length - keptOverrides.length,
    refused: false
  }
}

/* ------------------------------------------------------------ 展示 */

/** 每个班序当前挂了谁（内置 + 自定义都列出来）—— 设置页与向导里做提示用 */
export function groupByPattern(roster: Roster): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}
  lookupOf(roster).all.forEach(pattern => { grouped[pattern.id] = [] })
  roster.members.forEach(member => {
    grouped[member.patternId] = [...(grouped[member.patternId] ?? []), member.name]
  })
  return grouped
}

/** 班序的显示名：内置是代号（4F），自定义是用户起的名字（甲班） */
export function patternLabelOf(roster: Roster, member: Member): string {
  return lookupOf(roster).labelOf(member.patternId)
}

/** 按 id 取显示名，给设置页/下拉用 */
export function patternNameOf(roster: Roster, patternId: string): string {
  return lookupOf(roster).labelOf(patternId)
}
