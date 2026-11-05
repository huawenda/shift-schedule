import { BUILTIN_PATTERN_IDS, normalizeCustomPatterns, resolvePatterns, type CustomPattern } from '../patterns'
import { isShiftType } from '../shifts'
import { sanitizeOvertime } from '../overtime'
import { sanitizeLeave } from '../leave'
import { normalizeSalary } from '../profile'
import { normalizeTodos } from '../todos'
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_MEMBER_GROUPS,
  MAX_MEMBERS,
  emptyRoster,
  groupNameKey,
  orderByGroup,
  overrideKey,
  type DayOverride,
  type Member,
  type MemberGroup,
  type Profile,
  type Roster
} from './model'

/* ---------------------------------------------------------------- 校验 */

export interface MemberDraft {
  id?: string
  name: string
  patternId: string
}

export interface ValidateOptions {
  /** 本人 id：这一行不参与「与本人同名」的检查（它本来就是本人） */
  selfId?: string
  /** 本人姓名：其他任何成员都不能重名 */
  selfName?: string
}

/** 返回中文错误文案；空数组表示通过。`customs` 用于认出自定义班序 */
export function validateMembers(
  members: MemberDraft[],
  customs: CustomPattern[] = [],
  options: ValidateOptions = {}
): string[] {
  const errors: string[] = []
  const lookup = resolvePatterns(customs)
  const selfName = options.selfName?.trim() ?? ''

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

    const isSelfRow = Boolean(options.selfId && member.id === options.selfId)
    if (!isSelfRow && selfName && name === selfName) {
      errors.push(`「${name}」与本人同名，请换一个 —— 否则矩阵里分不清哪一行是你`)
    }

    const previous = seen.get(name)
    // 与本人同名时只报那条（语义更准），不再叠一条「出现了两次」——
    // 本人那一行本来就在表里，两条一起弹会让人以为表里有三行重名。
    if (previous !== undefined && !(selfName && name === selfName)) {
      errors.push(`「${name}」出现了两次（第 ${previous + 1} 行和第 ${index + 1} 行）`)
    } else if (previous === undefined) {
      seen.set(name, index)
    }
  })

  return errors
}

/* ------------------------------------------------------------ 分组 */

/** 组名校验；返回中文错误文案，null 表示通过 */
export function validateGroupName(
  name: string,
  groups: MemberGroup[],
  editingId?: string
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '请填写组名'
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) return `组名请控制在 ${MAX_GROUP_NAME_LENGTH} 个字以内`

  const duplicate = groups.find(
    group => group.id !== editingId && groupNameKey(group.name) === groupNameKey(trimmed)
  )
  if (duplicate) return `已经有叫「${duplicate.name}」的分组了`

  if (!editingId && groups.length >= MAX_MEMBER_GROUPS) {
    return `分组最多 ${MAX_MEMBER_GROUPS} 个，删掉一个再加`
  }
  return null
}

/** 分组归一化：去空、去重（id 与组名都不重复）、截断超长组名、收口到上限 */
function normalizeGroups(value: unknown): MemberGroup[] {
  if (!Array.isArray(value)) return []

  const groups: MemberGroup[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  value.forEach(item => {
    if (groups.length >= MAX_MEMBER_GROUPS) return
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>

    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string'
      ? record.name.trim().slice(0, MAX_GROUP_NAME_LENGTH)
      : ''
    if (!id || !name) return

    const key = groupNameKey(name)
    if (ids.has(id) || names.has(key)) return
    ids.add(id)
    names.add(key)
    groups.push({ id, name })
  })

  return groups
}

/* ------------------------------------------------------------ 归一化 */

function normalizeMember(
  value: unknown,
  knownPatternIds: Set<string>,
  knownGroupIds: Set<string>
): Member | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const position = typeof record.position === 'string' ? record.position.trim() : ''
  const patternId = typeof record.patternId === 'string' ? record.patternId.trim() : ''
  const groupId = typeof record.groupId === 'string' ? record.groupId.trim() : ''

  if (!id || !name || !knownPatternIds.has(patternId)) return null

  return {
    id,
    name,
    patternId,
    // 岗位为空就不落字段（缺省即无岗位），旧数据没这个字段时也不会多出来
    ...(position ? { position } : {}),
    // 组不存在时只丢分组，不丢人 —— 少一个人比「部门暂时没归上」更难发现
    ...(groupId && knownGroupIds.has(groupId) ? { groupId } : {})
  }
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

  // 加班、法定、事假时长都是可选字段：旧数据里没有，手改 JSON 也可能填错，一律收敛
  const extra = sanitizeOvertime(
    shift,
    typeof record.overtimeHours === 'number' ? record.overtimeHours : undefined,
    record.isLegal === true ? true : undefined
  )
  const leave = sanitizeLeave(shift, record.leaveDuration)

  return {
    memberId,
    date,
    shift,
    ...extra,
    // 8h（一天）是默认值，不必落库；只有 4h 需要显式记住
    ...(leave === '4h' ? { leaveDuration: leave } : {})
  }
}

export interface NormalizeResult {
  roster: Roster
  /** 因班序不存在 / 重名 / 重复 id 而被移出的成员姓名，供界面提示 */
  droppedMembers: string[]
}

/**
 * 把任意来源（旧文件、手改的 JSON、旧版备份）收敛成合法花名册，绝不抛异常。
 *
 * ⚠️ **顺序不能反**：必须先解析分组与自定义班序、拿到合法 id 集合，
 * 再校验成员。反过来的话，引用了自定义班序的成员会被判成「班序不存在」
 * 而整条丢掉 —— 用户会看到自己建的人凭空消失，且没有任何提示。
 */
export function normalizeRosterDetailed(value: unknown): NormalizeResult {
  if (typeof value !== 'object' || value === null) {
    return { roster: { ...emptyRoster }, droppedMembers: [] }
  }
  const record = value as Record<string, unknown>

  const groups = normalizeGroups(record.groups)
  const knownGroupIds = new Set(groups.map(group => group.id))

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

    const member = normalizeMember(item, knownPatternIds, knownGroupIds)
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

  // ⚠️ profile 必须在 members 建好、ids 齐了之后才能认 ——
  // 它是指向成员的指针，提前解析会把合法本人判成「不存在」而丢掉。
  const rawProfile = record.profile
  let profile: Profile | null = null
  if (typeof rawProfile === 'object' && rawProfile !== null) {
    const source = rawProfile as Record<string, unknown>
    const memberId = typeof source.memberId === 'string' ? source.memberId.trim() : ''
    if (memberId && ids.has(memberId)) {
      profile = { memberId, salary: normalizeSalary(source.salary) }
    }
  }

  return {
    roster: {
      // 行序统一按「分组块」收敛：设置页「全部」与矩阵都依赖这个顺序
      members: orderByGroup(members, groups),
      groups,
      patterns,
      overrides: [...byKey.values()].sort((left, right) =>
        overrideKey(left.memberId, left.date).localeCompare(overrideKey(right.memberId, right.date))
      ),
      todos: normalizeTodos(record.todos),
      profile,
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
