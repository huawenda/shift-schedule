import {
  cloudRecordsToOverrides,
  getOverrideKey,
  isCloudDayRecord,
  isLeaveDuration,
  isShiftType,
  normalizeOvertimeHours,
  type CloudDayRecord,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '@local/core'

/**
 * 纯本地数据层：所有数据写在当前设备的 localStorage 里。
 *
 * 记录结构沿用 core 的 `CloudDayRecord`（历史命名，本质上就是「某天某人的一条覆盖记录」），
 * 这样记录读写的转换逻辑可以直接复用 core 里已经被测试覆盖的实现。
 */

export interface LocalOverrides {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
  leaveDurationOverrides: LeaveDurationOverrides
}

export interface LocalSettings {
  personName: string
}

export const dayRecordsStorageKey = 'shift-schedule:local:day-records:v1'
export const settingsStorageKey = 'shift-schedule:local:settings:v1'
const probeStorageKey = 'shift-schedule:local:probe'

/**
 * localStorage 在少数场景不可用（Safari 隐私模式、部分浏览器下的 file://）。
 * 这种情况退化成内存存储：页面仍可正常使用，只是刷新后数据会丢，界面会提示导出备份。
 */
const memoryFallback = new Map<string, string>()

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readRaw(storageKey: string): string | null {
  try {
    const storage = getBrowserStorage()
    if (storage) return storage.getItem(storageKey)
  } catch {
    // 落到内存兜底
  }

  return memoryFallback.get(storageKey) ?? null
}

function writeRaw(storageKey: string, value: string): void {
  try {
    const storage = getBrowserStorage()
    if (storage) {
      storage.setItem(storageKey, value)
      return
    }
  } catch {
    // 落到内存兜底
  }

  memoryFallback.set(storageKey, value)
}

export function removeRaw(storageKey: string): void {
  try {
    const storage = getBrowserStorage()
    if (storage) storage.removeItem(storageKey)
  } catch {
    // 忽略
  }

  memoryFallback.delete(storageKey)
}

/** 当前环境能否真正持久化。false 时界面会提醒尽快导出备份。 */
export function isLocalPersistenceAvailable(): boolean {
  try {
    const storage = getBrowserStorage()
    if (!storage) return false

    storage.setItem(probeStorageKey, '1')
    storage.removeItem(probeStorageKey)
    return true
  } catch {
    return false
  }
}

/** 把任意来源的数据收敛成合法记录，避免脏数据把界面弄崩。 */
export function normalizeLocalDayRecord(value: unknown): CloudDayRecord | null {
  if (!isCloudDayRecord(value)) return null

  const record = value as CloudDayRecord
  const personName = record.personName.trim()
  const date = record.date.trim()
  if (!personName || !date) return null

  const shiftOverride = isShiftType(record.shiftOverride) ? record.shiftOverride : undefined
  const overtimeHours = normalizeOvertimeHours(record.overtimeHours ?? 0)
  const isLegalOvertime = record.isLegalOvertime === true
  const leaveDuration =
    shiftOverride === '事假' && isLeaveDuration(record.leaveDuration) ? record.leaveDuration : undefined

  // 一条「没有任何有效内容」的记录没有存在意义，直接丢弃。
  if (!shiftOverride && overtimeHours <= 0 && !isLegalOvertime && !leaveDuration) return null

  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : Date.now()

  return {
    personName,
    date,
    ...(shiftOverride ? { shiftOverride } : {}),
    overtimeHours,
    ...(isLegalOvertime ? { isLegalOvertime } : {}),
    ...(leaveDuration ? { leaveDuration } : {}),
    updatedAt
  }
}

export function readLocalDayRecords(): CloudDayRecord[] {
  const raw = readRaw(dayRecordsStorageKey)
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  return dedupeLocalDayRecords(
    parsed
      .map(normalizeLocalDayRecord)
      .filter((record): record is CloudDayRecord => record !== null)
  )
}

export function writeLocalDayRecords(records: CloudDayRecord[]): void {
  writeRaw(dayRecordsStorageKey, JSON.stringify(
    dedupeLocalDayRecords(
      records
        .map(normalizeLocalDayRecord)
        .filter((record): record is CloudDayRecord => record !== null)
    )
  ))
}

export function upsertLocalDayRecord(record: CloudDayRecord): void {
  const normalized = normalizeLocalDayRecord(record)
  if (!normalized) {
    removeLocalDayRecord(record.personName, record.date)
    return
  }

  const key = getOverrideKey(normalized.personName, normalized.date)
  writeLocalDayRecords([
    ...readLocalDayRecords().filter(item => getOverrideKey(item.personName, item.date) !== key),
    normalized
  ])
}

export function removeLocalDayRecord(personName: string, date: string): void {
  const key = getOverrideKey(personName, date)
  writeLocalDayRecords(
    readLocalDayRecords().filter(record => getOverrideKey(record.personName, record.date) !== key)
  )
}

export function clearLocalDayRecords(): void {
  removeRaw(dayRecordsStorageKey)
}

export function readLocalOverrides(): LocalOverrides {
  return cloudRecordsToOverrides(readLocalDayRecords())
}

export function readLocalSettings(): Partial<LocalSettings> {
  const raw = readRaw(settingsStorageKey)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const record = parsed as Record<string, unknown>
  const personName = typeof record.personName === 'string' ? record.personName.trim() : ''
  return personName ? { personName } : {}
}

export function writeLocalSettings(patch: Partial<LocalSettings>): void {
  writeRaw(settingsStorageKey, JSON.stringify({
    ...readLocalSettings(),
    ...(typeof patch.personName === 'string' && patch.personName.trim()
      ? { personName: patch.personName.trim() }
      : {})
  }))
}

export function clearLocalSettings(): void {
  removeRaw(settingsStorageKey)
}

function dedupeLocalDayRecords(records: CloudDayRecord[]): CloudDayRecord[] {
  const byKey = new Map<string, CloudDayRecord>()

  records.forEach(record => {
    byKey.set(getOverrideKey(record.personName, record.date), record)
  })

  return Array.from(byKey.values()).sort((left, right) => (
    getOverrideKey(left.personName, left.date).localeCompare(getOverrideKey(right.personName, right.date))
  ))
}
