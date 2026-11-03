import type { Member, DayOverride, Profile, Roster } from '../data/roster/model'
import type { CustomPattern } from '../data/patterns'
import { sortTodos, type Todo, type TodoTone } from '../data/todos'
import type { LeaveDuration } from '../data/leave'
import type { SalaryInput } from '../data/profile'
import type { ShiftType } from '../data/shifts'
import { emptyChangeSet, type SyncChangeSet } from './diff'
import { rowKeys, type SyncMeta } from './meta'

/* ---------------------------------------------------------------- 云端结构 */

export interface CloudRowMeta {
  updatedAt?: number
  deletedAt?: number
}

export interface CloudMemberRow extends CloudRowMeta {
  id: string
  name: string
  position?: string
  patternId: string
}

export interface CloudPatternRow extends CloudRowMeta {
  id: string
  name: string
  shifts: ShiftType[]
}

export interface CloudDayRow extends CloudRowMeta {
  memberId: string
  date: string
  shift: ShiftType
  overtimeHours?: number
  isLegal?: boolean
  leaveDuration?: LeaveDuration
}

export interface CloudTodoRow extends CloudRowMeta {
  id: string
  date: string
  text: string
  done: boolean
  tone: TodoTone
  createdAt: number
}

export interface CloudProfileRow extends CloudRowMeta {
  memberId: string
  salary: SalaryInput
}

export interface CloudSnapshot {
  members: CloudMemberRow[]
  patterns: CloudPatternRow[]
  dayRecords: CloudDayRow[]
  todos: CloudTodoRow[]
  profile: CloudProfileRow | null
}

/* ---------------------------------------------------------------- 合并 */

export interface MergeResult {
  roster: Roster
  meta: SyncMeta
  /** 需要推给云端的本地较新数据 */
  push: SyncChangeSet
  /** 本地是否被云端改动过（需要写回 storage） */
  changed: boolean
}

type Decision = 'local' | 'cloud' | 'delete'

/**
 * 逐行仲裁：
 * - 云端删除时间比本地新 → 跟随删除；
 * - 云端修改时间比本地新 → 采用云端；
 * - 其余情况本地赢（本地没时间戳时，若云端有数据则让云端赢，便于换机恢复）。
 */
function decide(localTs: number, tombTs: number, cloudTs: number, cloudTomb: number): Decision {
  if (cloudTomb > 0 && cloudTomb > localTs && cloudTomb >= tombTs) return 'delete'
  if (cloudTs > 0 && cloudTs > localTs && cloudTs >= tombTs) return 'cloud'
  if (localTs > 0 || tombTs > 0) return 'local'
  return cloudTs > 0 ? 'cloud' : 'local'
}

function cloudMember(row: CloudMemberRow): Member {
  const position = (row.position || '').trim()
  return {
    id: row.id,
    name: row.name,
    ...(position ? { position } : {}),
    patternId: row.patternId
  }
}

function cloudPattern(row: CloudPatternRow): CustomPattern {
  return { id: row.id, name: row.name, shifts: row.shifts.slice() }
}

function cloudDay(row: CloudDayRow): DayOverride {
  return {
    memberId: row.memberId,
    date: row.date,
    shift: row.shift,
    ...(row.overtimeHours ? { overtimeHours: row.overtimeHours } : {}),
    ...(row.isLegal === true ? { isLegal: true } : {}),
    ...(row.leaveDuration ? { leaveDuration: row.leaveDuration } : {})
  }
}

function cloudTodo(row: CloudTodoRow): Todo {
  return {
    id: row.id,
    date: row.date,
    text: row.text,
    done: row.done === true,
    tone: row.tone,
    createdAt: row.createdAt
  }
}

function cloudProfile(row: CloudProfileRow): Profile {
  return { memberId: row.memberId, salary: row.salary }
}

function overrideKeyOf(row: DayOverride): string {
  return `${row.memberId}|${row.date}`
}

function tombKeysOf(meta: SyncMeta, prefix: string): string[] {
  return Object.keys(meta.tombstones)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
}

/** 时间戳增量合并：0 表示「这条时间戳要清掉」 */
function applyStamps(base: Record<string, number>, updates: Record<string, number>): Record<string, number> {
  const next = { ...base }
  Object.keys(updates).forEach(key => {
    const value = updates[key]
    if (value > 0) next[key] = value
    else delete next[key]
  })
  return next
}

interface RowMerge<T> {
  merged: Map<string, T>
  stamps: Record<string, number>
  tombstones: Record<string, number>
  upserts: T[]
  deletes: string[]
  changed: boolean
}

/**
 * 合并一整类行：本地 Map + 云端 Map → 合并结果 + 需要推送的行/删除。
 * 返回的时间戳只包含本类键（0 = 清除），由外层统一回写。
 */
function mergeRows<T>(
  kind: 'member' | 'pattern' | 'day' | 'todo',
  localRows: Map<string, T>,
  cloudRows: Map<string, { row: T; updatedAt: number; deletedAt: number }>,
  meta: SyncMeta
): RowMerge<T> {
  const prefix = `${kind}:`
  const merged = new Map(localRows)
  const stamps: Record<string, number> = {}
  const tombstones: Record<string, number> = {}
  const upserts: T[] = []
  const deletes: string[] = []
  let changed = false

  const keys = new Set<string>([
    ...localRows.keys(),
    ...cloudRows.keys(),
    ...tombKeysOf(meta, prefix)
  ])

  keys.forEach(rawKey => {
    const fullKey = `${prefix}${rawKey}`
    const localTs = meta.rows[fullKey] ?? 0
    const tombTs = meta.tombstones[fullKey] ?? 0
    const cloud = cloudRows.get(rawKey)
    const cloudTs = cloud?.updatedAt ?? 0
    const cloudTomb = cloud?.deletedAt ?? 0

    // 本地从未有过这行（也没有墓碑）：云端有就直接采用，老数据没有 updatedAt 也不会被误删
    if (!localRows.has(rawKey) && tombTs === 0) {
      if (cloud && cloudTomb === 0) {
        merged.set(rawKey, cloud.row)
        stamps[fullKey] = cloudTs
        tombstones[fullKey] = 0
        changed = true
      }
      return
    }

    const decision = decide(localTs, tombTs, cloudTs, cloudTomb)

    if (decision === 'delete') {
      if (merged.delete(rawKey)) changed = true
      stamps[fullKey] = 0
      tombstones[fullKey] = cloudTomb
      return
    }

    if (decision === 'cloud') {
      if (!cloud) return
      if (JSON.stringify(merged.get(rawKey)) !== JSON.stringify(cloud.row)) {
        merged.set(rawKey, cloud.row)
        changed = true
      }
      stamps[fullKey] = cloudTs
      tombstones[fullKey] = 0
      return
    }

    const localRow = localRows.get(rawKey)
    if (localRow !== undefined) {
      // 本地和云端内容一致、且云端时间不旧：不需要重复上传
      if (cloud && cloudTomb === 0 && cloudTs >= localTs
        && JSON.stringify(localRow) === JSON.stringify(cloud.row)) {
        stamps[fullKey] = cloudTs || localTs
        tombstones[fullKey] = 0
        return
      }
      upserts.push(localRow)
      stamps[fullKey] = localTs || Date.now()
      tombstones[fullKey] = 0
    } else {
      deletes.push(rawKey)
      stamps[fullKey] = 0
      tombstones[fullKey] = tombTs || Date.now()
    }
  })

  return { merged, stamps, tombstones, upserts, deletes, changed }
}

export function mergeLocalAndCloud(local: Roster, meta: SyncMeta, cloud: CloudSnapshot): MergeResult {
  const cloudMemberMap = new Map(cloud.members.map(row => [row.id, {
    row: cloudMember(row),
    updatedAt: row.updatedAt ?? 0,
    deletedAt: row.deletedAt ?? 0
  }]))
  const cloudPatternMap = new Map(cloud.patterns.map(row => [row.id, {
    row: cloudPattern(row),
    updatedAt: row.updatedAt ?? 0,
    deletedAt: row.deletedAt ?? 0
  }]))
  const cloudDayMap = new Map(cloud.dayRecords.map(row => [`${row.memberId}|${row.date}`, {
    row: cloudDay(row),
    updatedAt: row.updatedAt ?? 0,
    deletedAt: row.deletedAt ?? 0
  }]))
  const cloudTodoMap = new Map(cloud.todos.map(row => [row.id, {
    row: cloudTodo(row),
    updatedAt: row.updatedAt ?? 0,
    deletedAt: row.deletedAt ?? 0
  }]))

  const members = mergeRows('member', new Map(local.members.map(row => [row.id, row])), cloudMemberMap, meta)
  const patterns = mergeRows('pattern', new Map(local.patterns.map(row => [row.id, row])), cloudPatternMap, meta)
  const days = mergeRows('day', new Map(local.overrides.map(row => [overrideKeyOf(row), row])), cloudDayMap, meta)
  const todos = mergeRows('todo', new Map(local.todos.map(row => [row.id, row])), cloudTodoMap, meta)

  /* profile 只有一行，规则同上 */
  const profileKey = rowKeys.profile
  const localProfileTs = meta.rows[profileKey] ?? 0
  const localProfileTomb = meta.tombstones[profileKey] ?? 0
  const cloudProfileRow = cloud.profile
  const cloudProfileTs = cloudProfileRow?.updatedAt ?? 0
  const cloudProfileTomb = cloudProfileRow?.deletedAt ?? 0
  const profileDecision = decide(localProfileTs, localProfileTomb, cloudProfileTs, cloudProfileTomb)

  let nextProfile = local.profile
  let profileChanged = false
  let changed = members.changed || patterns.changed || days.changed || todos.changed
  const profileStamps: Record<string, number> = {}
  const profileTombstones: Record<string, number> = {}

  if (profileDecision === 'delete') {
    if (local.profile) changed = true
    nextProfile = null
    profileStamps[profileKey] = 0
    profileTombstones[profileKey] = cloudProfileTomb
  } else if (local.profile === null && localProfileTomb === 0) {
    // 本地从未设置过本人：云端有就采用
    if (cloudProfileRow && cloudProfileTomb === 0) {
      nextProfile = cloudProfile(cloudProfileRow)
      changed = true
      profileStamps[profileKey] = cloudProfileTs
      profileTombstones[profileKey] = 0
    }
  } else if (profileDecision === 'cloud') {
    if (cloudProfileRow) {
      nextProfile = cloudProfile(cloudProfileRow)
      if (JSON.stringify(local.profile) !== JSON.stringify(nextProfile)) changed = true
      profileStamps[profileKey] = cloudProfileTs
      profileTombstones[profileKey] = 0
    }
  } else if (local.profile) {
    profileChanged = true
    profileStamps[profileKey] = localProfileTs || Date.now()
    profileTombstones[profileKey] = 0
  } else if (localProfileTomb > 0) {
    profileChanged = true
    profileStamps[profileKey] = 0
    profileTombstones[profileKey] = localProfileTomb
  }

  const nextMeta: SyncMeta = {
    rows: applyStamps(
      applyStamps(
        applyStamps(
          applyStamps(meta.rows, members.stamps),
          patterns.stamps
        ),
        days.stamps
      ),
      { ...todos.stamps, ...profileStamps }
    ),
    tombstones: applyStamps(
      applyStamps(
        applyStamps(
          applyStamps(meta.tombstones, members.tombstones),
          patterns.tombstones
        ),
        days.tombstones
      ),
      { ...todos.tombstones, ...profileTombstones }
    )
  }

  const push: SyncChangeSet = {
    ...emptyChangeSet(),
    members: members.upserts,
    patterns: patterns.upserts,
    dayRecords: days.upserts,
    todos: todos.upserts,
    profile: nextProfile,
    profileChanged,
    deleted: {
      memberIds: members.deletes,
      patternIds: patterns.deletes,
      dayRecordKeys: days.deletes,
      todoIds: todos.deletes
    }
  }

  const roster: Roster = {
    ...local,
    members: [...members.merged.values()],
    patterns: [...patterns.merged.values()],
    overrides: [...days.merged.values()],
    todos: sortTodos([...todos.merged.values()]),
    profile: nextProfile,
    updatedAt: changed ? Date.now() : local.updatedAt
  }

  return { roster, meta: nextMeta, push, changed }
}

/** 首次同步时给本地已有行补时间戳，让「本地数据」在首轮合并中获胜 */
export function stampLocalRows(roster: Roster, at = Date.now()): SyncMeta {
  const meta: SyncMeta = { rows: {}, tombstones: {} }
  roster.members.forEach(row => { meta.rows[rowKeys.member(row.id)] = at })
  roster.patterns.forEach(row => { meta.rows[rowKeys.pattern(row.id)] = at })
  roster.overrides.forEach(row => { meta.rows[rowKeys.day(row.memberId, row.date)] = at })
  roster.todos.forEach(row => { meta.rows[rowKeys.todo(row.id)] = at })
  if (roster.profile) meta.rows[rowKeys.profile] = at
  return meta
}
