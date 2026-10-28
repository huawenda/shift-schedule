/**
 * 本机存储：优先 localStorage，不可用时退化为内存。
 *
 * file:// 与隐私模式下 localStorage 可能抛异常，此时页面仍能跑，
 * 只是刷新会丢数据 —— 上层据此显示提示条并催促导出备份。
 */

const memoryFallback = new Map<string, string>()

const probeKey = 'shift-schedule:local:probe'

export const STORAGE_KEYS = {
  /**
   * 唯一的业务数据：整套花名册（成员 + 自建班序 + 改班/加班记录）。
   *
   * 键名里的 `v2` 是历史遗留（当时从「按姓名索引的日记录」换成「按 memberId 的整套花名册」），
   * 与备份文件的 `version` 不是同一个编号体系，别按它推断备份格式版本。
   */
  roster: 'shift-schedule:local:roster:v2'
} as const

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readRaw(key: string): string | null {
  try {
    const storage = getBrowserStorage()
    if (storage) return storage.getItem(key)
  } catch {
    // 落到内存兜底
  }
  return memoryFallback.get(key) ?? null
}

/** 返回是否真正写进了持久化存储（false 表示只进了内存） */
export function writeRaw(key: string, value: string): boolean {
  try {
    const storage = getBrowserStorage()
    if (storage) {
      storage.setItem(key, value)
      return true
    }
  } catch {
    // 落到内存兜底
  }
  memoryFallback.set(key, value)
  return false
}

export function removeRaw(key: string): void {
  try {
    const storage = getBrowserStorage()
    if (storage) storage.removeItem(key)
  } catch {
    // 忽略
  }
  memoryFallback.delete(key)
}

/** 当前环境能否真正持久化 */
export function isPersistenceAvailable(): boolean {
  try {
    const storage = getBrowserStorage()
    if (!storage) return false
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}
