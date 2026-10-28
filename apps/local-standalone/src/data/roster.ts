import { isShiftType, type ShiftType } from './shifts'
import { canRecordOvertime, sanitizeOvertime } from './overtime'
import { sanitizeLeave, type LeaveDuration } from './leave'
import {
  BUILTIN_PATTERN_IDS,
  isBuiltinPatternId,
  normalizeCustomPatterns,
  resolvePatterns,
  type CustomPattern,
  type PatternLookup
} from './patterns'
import { readRaw, removeRaw, STORAGE_KEYS, writeRaw } from './storage'
import {
  emptySalary,
  normalizeSalary,
  salaryFilledCount,
  type SalaryInput,
  type SelfIdentity
} from './profile'
import { createTodoId, normalizeTodos, sortTodos, type Todo } from './todos'

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
  /** 岗位（可空）：缺省即无岗位；矩阵里拼在班序旁展示，如「4F · 班长」 */
  position?: string
  /** 内置代号（4F…4X）或自定义班序的 id */
  patternId: string
}

export interface DayOverride {
  memberId: string
  /** 'YYYY-MM-DD' */
  date: string
  shift: ShiftType
  /** 当天加班小时数（0.5 步长）；undefined = 没有加班 */
  overtimeHours?: number
  /** 是否法定节假日上班（影响加班费倍率，统计用） */
  isLegal?: boolean
  /**
   * 事假时长。**只在「4h」时才写进记录** —— 8h（一天）是默认值，
   * 存下来只会让每条事假记录都多一个字段，且要额外判断它算不算「与默认不同」。
   */
  leaveDuration?: LeaveDuration
}

/** 弹层一次要写的整天内容 */
export interface DayRecordInput {
  shift: ShiftType
  overtimeHours?: number
  isLegal?: boolean
  leaveDuration?: LeaveDuration
}

/**
 * 本人：指向 `members` 里的一条，不另存副本。
 *
 * 为什么用指针而不是独立的一份数据：本人也要出现在全员矩阵里，
 * 存两份就会出现「改了个人信息、矩阵还是旧名字」这种两个真相来源。
 */
export interface Profile {
  memberId: string
  salary: SalaryInput
}

export interface Roster {
  members: Member[]
  overrides: DayOverride[]
  /** 用户自建的班序，上限 MAX_CUSTOM_PATTERNS */
  patterns: CustomPattern[]
  /**
   * 待办清单（只给本人用，不带 memberId）。
   *
   * 与考勤记录互不影响：记一条待办不会动班次，换人也不会清掉待办。
   */
  todos: Todo[]
  /** null = 还没设置本人（跳过向导、或导入了没有 profile 的备份） */
  profile: Profile | null
  updatedAt: number
}

export const emptyRoster: Roster = {
  members: [],
  overrides: [],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

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

/* ------------------------------------------------------------ 归一化 */

function normalizeMember(value: unknown, knownPatternIds: Set<string>): Member | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const position = typeof record.position === 'string' ? record.position.trim() : ''
  const patternId = typeof record.patternId === 'string' ? record.patternId.trim() : ''

  if (!id || !name || !knownPatternIds.has(patternId)) return null

  // 岗位为空就不落字段（缺省即无岗位），旧数据没这个字段时也不会多出来
  return { id, name, patternId, ...(position ? { position } : {}) }
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
      members,
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

export function isEdited(memberId: string, date: string, overrideMap: Map<string, ShiftType>): boolean {
  return overrideMap.has(overrideKey(memberId, date))
}

/**
 * 写入某人某天的整天内容（班次 + 加班 + 法定）。
 *
 * **删除条件已从「与模板相同」改成三元判断**：
 * `班次 == 模板 && 无加班 && 无法定` 才删除记录。
 * 不改的话，「模板本来就是白班、今天加了 2h」会被当成"与模板相同"整条删掉，加班凭空消失。
 */
export function applyDayRecord(
  roster: Roster,
  memberId: string,
  date: string,
  input: DayRecordInput
): Roster {
  const member = findMember(roster, memberId)
  if (!member) return roster

  const key = overrideKey(memberId, date)
  const rest = roster.overrides.filter(override => overrideKey(override.memberId, override.date) !== key)
  const templateShift = getTemplateShift(roster, member, date)
  const extra = sanitizeOvertime(input.shift, input.overtimeHours, input.isLegal)
  const leave = sanitizeLeave(input.shift, input.leaveDuration)

  const sameAsTemplate = input.shift === templateShift
  // 4h 事假也算「和默认不一样」——否则「模板本就事假、今天改成 4h」会被当场删掉
  const hasExtra = (extra.overtimeHours ?? 0) > 0 || extra.isLegal === true || leave === '4h'

  if (sameAsTemplate && !hasExtra) {
    return { ...roster, overrides: rest, updatedAt: Date.now() }
  }

  return {
    ...roster,
    overrides: [
      ...rest,
      {
        memberId,
        date,
        shift: input.shift,
        ...extra,
        ...(leave === '4h' ? { leaveDuration: leave } : {})
      }
    ],
    updatedAt: Date.now()
  }
}

/**
 * 「恢复默认」：把这一天的记录整条删掉 —— 班次回模板，**加班与法定一并清空**。
 */
export function restoreDay(roster: Roster, memberId: string, date: string): Roster {
  const key = overrideKey(memberId, date)
  const kept = roster.overrides.filter(override => overrideKey(override.memberId, override.date) !== key)
  if (kept.length === roster.overrides.length) return roster
  return { ...roster, overrides: kept, updatedAt: Date.now() }
}

/**
 * 只改班次（矩阵弹层用）。
 *
 * 新班次不支持加班时（改成休息/事假），已有的加班与法定会被**一并清掉**，
 * 否则会留下「休息 + 3h 加班」这种脏数据。矩阵弹层里会提前提示这一点。
 */
export function applyShiftEdit(
  roster: Roster,
  memberId: string,
  date: string,
  shift: ShiftType | null
): Roster {
  const member = findMember(roster, memberId)
  if (!member) return roster

  if (!shift) return restoreDay(roster, memberId, date)

  const existing = getDayRecord(roster, memberId, date)
  const keepOvertime = canRecordOvertime(shift) ? existing?.overtimeHours : undefined
  const keepLegal = canRecordOvertime(shift) ? existing?.isLegal : undefined
  // 矩阵弹层不能改事假时长，但也不该把它抹掉：改成事假时沿用原值，改成别的班次就丢掉
  const keepLeave = shift === '事假' ? existing?.leaveDuration : undefined

  return applyDayRecord(roster, memberId, date, {
    shift,
    overtimeHours: keepOvertime,
    isLegal: keepLegal,
    leaveDuration: keepLeave
  })
}

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

/* ------------------------------------------------------------ 待办维护 */

/**
 * 新增一条待办。
 *
 * 正文 trim 后为空就什么都不做（返回原 roster）——
 * 空待办在界面上表现为「加了个空行」，没有任何意义。
 */
export function addTodo(roster: Roster, date: string, text: string): Roster {
  const body = text.trim()
  if (!body) return roster
  const todo: Todo = {
    id: createTodoId(),
    date,
    text: body,
    done: false,
    createdAt: Date.now()
  }
  return {
    ...roster,
    todos: sortTodos([...roster.todos, todo]),
    updatedAt: Date.now()
  }
}

/** 勾选 / 取消勾选一条待办；找不到就原样返回 */
export function toggleTodo(roster: Roster, todoId: string): Roster {
  if (!roster.todos.some(todo => todo.id === todoId)) return roster
  return {
    ...roster,
    todos: roster.todos.map(todo =>
      todo.id === todoId ? { ...todo, done: !todo.done } : todo
    ),
    updatedAt: Date.now()
  }
}

/** 删除一条待办；找不到就原样返回 */
export function removeTodo(roster: Roster, todoId: string): Roster {
  if (!roster.todos.some(todo => todo.id === todoId)) return roster
  return {
    ...roster,
    todos: roster.todos.filter(todo => todo.id !== todoId),
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
  /**
   * 拒绝删除的原因，null 表示删成功：
   * - `builtin`：内置 13 条只读
   * - `self`：本人正挂在这条班序上（删班序会连人一起删，不能顺手把本人删了）
   */
  blocked: 'builtin' | 'self' | null
}

/**
 * 删除一条自定义班序，**连带删除挂在上面的成员与其改班记录**。
 *
 * 两种情况拒绝：内置 13 条（只读）、本人所在的班序（要删先把本人换到别的班序）。
 */
export function removePattern(roster: Roster, patternId: string): RemovePatternResult {
  if (isBuiltinPatternId(patternId)) {
    return { roster, removedMembers: [], removedOverrides: 0, blocked: 'builtin' }
  }

  if (getSelf(roster)?.patternId === patternId) {
    return { roster, removedMembers: [], removedOverrides: 0, blocked: 'self' }
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
    blocked: null
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
