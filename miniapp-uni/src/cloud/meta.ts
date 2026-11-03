import type { SyncChangeSet } from './diff'

/**
 * 同步元数据：记录每一行「最后一次本地修改时间」和「本地删除时间」。
 *
 * 数据模型本身不塞 updatedAt（Member / DayOverride 等是纯业务结构，
 * 塞时间戳会污染备份与纯函数），时间只在这一层维护：
 * - `rows[key]`：这行最后一次被本地写入的时间；
 * - `tombstones[key]`：这行最后一次被本地删除的时间（墓碑，防止另一端把它补回来）。
 */
export interface SyncMeta {
  rows: Record<string, number>
  tombstones: Record<string, number>
}

const META_KEY = 'shift-schedule:cloud:meta:v1'

export function readMeta(): SyncMeta {
  try {
    const raw = uni.getStorageSync(META_KEY)
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (parsed && typeof parsed === 'object') {
        return {
          rows: (parsed.rows as Record<string, number>) || {},
          tombstones: (parsed.tombstones as Record<string, number>) || {}
        }
      }
    }
  } catch {
    // 元数据坏了不影响业务数据，重新开始记录即可
  }
  return { rows: {}, tombstones: {} }
}

export function writeMeta(meta: SyncMeta) {
  try {
    uni.setStorageSync(META_KEY, JSON.stringify(meta))
  } catch {
    // 存不下元数据只会影响下次合并的精度，不影响本次使用
  }
}

/** 行键：与 diff 的业务键一一对应 */
export const rowKeys = {
  member: (id: string) => `member:${id}`,
  pattern: (id: string) => `pattern:${id}`,
  day: (memberId: string, date: string) => `day:${memberId}|${date}`,
  todo: (id: string) => `todo:${id}`,
  profile: 'profile'
}

/** 把一批本地变更记进元数据：写入记时间，删除记墓碑并清掉旧时间 */
export function noteLocalChanges(changes: SyncChangeSet, at = Date.now()): SyncMeta {
  const meta = readMeta()

  changes.members.forEach(member => {
    const key = rowKeys.member(member.id)
    meta.rows[key] = at
    delete meta.tombstones[key]
  })
  changes.patterns.forEach(pattern => {
    const key = rowKeys.pattern(pattern.id)
    meta.rows[key] = at
    delete meta.tombstones[key]
  })
  changes.dayRecords.forEach(record => {
    const key = rowKeys.day(record.memberId, record.date)
    meta.rows[key] = at
    delete meta.tombstones[key]
  })
  changes.todos.forEach(todo => {
    const key = rowKeys.todo(todo.id)
    meta.rows[key] = at
    delete meta.tombstones[key]
  })

  if (changes.profileChanged) {
    if (changes.profile) {
      meta.rows[rowKeys.profile] = at
      delete meta.tombstones[rowKeys.profile]
    } else {
      meta.tombstones[rowKeys.profile] = at
      delete meta.rows[rowKeys.profile]
    }
  }

  changes.deleted.memberIds.forEach(id => {
    meta.tombstones[rowKeys.member(id)] = at
    delete meta.rows[rowKeys.member(id)]
  })
  changes.deleted.patternIds.forEach(id => {
    meta.tombstones[rowKeys.pattern(id)] = at
    delete meta.rows[rowKeys.pattern(id)]
  })
  changes.deleted.dayRecordKeys.forEach(key => {
    meta.tombstones[`day:${key}`] = at
    delete meta.rows[`day:${key}`]
  })
  changes.deleted.todoIds.forEach(id => {
    meta.tombstones[rowKeys.todo(id)] = at
    delete meta.rows[rowKeys.todo(id)]
  })

  writeMeta(meta)
  return meta
}
