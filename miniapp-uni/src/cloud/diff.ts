import { overrideKey, type DayOverride, type Member, type Profile, type Roster } from '../data/roster/model'
import type { CustomPattern } from '../data/patterns'
import type { Todo } from '../data/todos'

/**
 * 本地 → 云端的增量变更集。
 *
 * 每次 commit 后用 `diffRoster(prev, next)` 生成，只包含真正变化的行；
 * 队列里多批变更用 `mergeChangeSets` 合并，避免连续操作发出多次请求。
 */
export interface SyncChangeSet {
  members: Member[]
  patterns: CustomPattern[]
  dayRecords: DayOverride[]
  todos: Todo[]
  /** 仅 `profileChanged` 为 true 时有意义（null = 云端清除档案） */
  profile: Profile | null
  profileChanged: boolean
  deleted: {
    memberIds: string[]
    patternIds: string[]
    dayRecordKeys: string[]
    todoIds: string[]
  }
}

export function emptyChangeSet(): SyncChangeSet {
  return {
    members: [],
    patterns: [],
    dayRecords: [],
    todos: [],
    profile: null,
    profileChanged: false,
    deleted: { memberIds: [], patternIds: [], dayRecordKeys: [], todoIds: [] }
  }
}

export function isEmptyChangeSet(changes: SyncChangeSet): boolean {
  return (
    changes.members.length === 0 &&
    changes.patterns.length === 0 &&
    changes.dayRecords.length === 0 &&
    changes.todos.length === 0 &&
    !changes.profileChanged &&
    changes.deleted.memberIds.length === 0 &&
    changes.deleted.patternIds.length === 0 &&
    changes.deleted.dayRecordKeys.length === 0 &&
    changes.deleted.todoIds.length === 0
  )
}

function diffList<T>(
  prev: T[],
  next: T[],
  keyOf: (item: T) => string
): { upserts: T[], removed: string[] } {
  const prevMap = new Map(prev.map(item => [keyOf(item), item]))
  const nextMap = new Map(next.map(item => [keyOf(item), item]))
  const upserts: T[] = []
  const removed: string[] = []

  nextMap.forEach((item, key) => {
    const old = prevMap.get(key)
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) upserts.push(item)
  })
  prevMap.forEach((_, key) => {
    if (!nextMap.has(key)) removed.push(key)
  })

  return { upserts, removed }
}

export function diffRoster(prev: Roster, next: Roster): SyncChangeSet {
  const members = diffList(prev.members, next.members, member => member.id)
  const patterns = diffList(prev.patterns, next.patterns, pattern => pattern.id)
  const dayRecords = diffList(prev.overrides, next.overrides, record => overrideKey(record.memberId, record.date))
  const todos = diffList(prev.todos, next.todos, todo => todo.id)
  const profileChanged = JSON.stringify(prev.profile) !== JSON.stringify(next.profile)

  return {
    members: members.upserts,
    patterns: patterns.upserts,
    dayRecords: dayRecords.upserts,
    todos: todos.upserts,
    profile: next.profile,
    profileChanged,
    deleted: {
      memberIds: members.removed,
      patternIds: patterns.removed,
      dayRecordKeys: dayRecords.removed,
      todoIds: todos.removed
    }
  }
}

function mergeList<T>(
  firstUpserts: T[],
  firstRemoved: string[],
  secondUpserts: T[],
  secondRemoved: string[],
  keyOf: (item: T) => string
): { upserts: T[], removed: string[] } {
  const map = new Map<string, T>()
  firstUpserts.forEach(item => map.set(keyOf(item), item))
  secondUpserts.forEach(item => map.set(keyOf(item), item))

  const removed = new Set<string>([...firstRemoved, ...secondRemoved])
  // 后一批重新加回来的行，不能再删
  map.forEach((_, key) => removed.delete(key))

  return { upserts: [...map.values()], removed: [...removed] }
}

/** 合并两批未发送的变更：后者覆盖前者 */
export function mergeChangeSets(first: SyncChangeSet, second: SyncChangeSet): SyncChangeSet {
  const members = mergeList(first.members, first.deleted.memberIds, second.members, second.deleted.memberIds, item => item.id)
  const patterns = mergeList(first.patterns, first.deleted.patternIds, second.patterns, second.deleted.patternIds, item => item.id)
  const dayRecords = mergeList(
    first.dayRecords,
    first.deleted.dayRecordKeys,
    second.dayRecords,
    second.deleted.dayRecordKeys,
    item => overrideKey(item.memberId, item.date)
  )
  const todos = mergeList(first.todos, first.deleted.todoIds, second.todos, second.deleted.todoIds, item => item.id)

  return {
    members: members.upserts,
    patterns: patterns.upserts,
    dayRecords: dayRecords.upserts,
    todos: todos.upserts,
    profile: second.profileChanged ? second.profile : first.profile,
    profileChanged: first.profileChanged || second.profileChanged,
    deleted: {
      memberIds: members.removed,
      patternIds: patterns.removed,
      dayRecordKeys: dayRecords.removed,
      todoIds: todos.removed
    }
  }
}
