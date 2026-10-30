import { normalizeRoster } from '../data/roster/normalize'
import { emptyRoster, type Roster } from '../data/roster/model'
import { readRaw, STORAGE_KEYS, writeRaw } from './storage'

/** 从本机存储读回花名册；解析失败按空表处理，不让一条脏数据把应用卡死 */
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
