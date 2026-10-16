import type { CloudDayRecord } from '@local/core'
import {
  clearLocalDayRecords,
  clearLocalSettings,
  normalizeLocalDayRecord,
  readLocalDayRecords,
  readLocalSettings,
  writeLocalDayRecords,
  writeLocalSettings
} from './localStore'
import {
  clearSalaryInputs,
  parseSalaryInputRecords,
  readSalaryInputsFromStorage,
  writeSalaryInputsToStorage,
  type SalaryInputRecords
} from './salaryInputs'

/**
 * 备份 / 恢复。
 *
 * localStorage 会被「清除浏览器数据」一并带走，也可能被隐私模式或清理工具干掉，
 * 所以本地版必须有一个把数据导出成文件的口子。
 */

export const backupAppId = 'shift-schedule-local'
export const backupVersion = 1

export interface LocalBackupFile {
  app: string
  version: number
  exportedAt: string
  dayRecords: CloudDayRecord[]
  salaryInputs: SalaryInputRecords
  settings: { personName?: string }
}

export interface RestoreResult {
  dayRecords: number
  salaryInputs: number
}

export function createBackup(): LocalBackupFile {
  const settings = readLocalSettings()

  return {
    app: backupAppId,
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    dayRecords: readLocalDayRecords(),
    salaryInputs: readSalaryInputsFromStorage(),
    settings: settings.personName ? { personName: settings.personName } : {}
  }
}

export function downloadBackup(): string {
  const backup = createBackup()
  const fileName = buildBackupFileName(new Date())
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  return fileName
}

/** 解析备份文件内容并覆盖写入本地数据；格式不对时抛出可直接展示给用户的中文错误。 */
export function restoreBackup(text: string): RestoreResult {
  const backup = parseBackupFile(text)

  writeLocalDayRecords(backup.dayRecords)
  writeSalaryInputsToStorage(backup.salaryInputs)

  if (backup.settings.personName) {
    writeLocalSettings({ personName: backup.settings.personName })
  }

  return {
    dayRecords: backup.dayRecords.length,
    salaryInputs: Object.keys(backup.salaryInputs).length
  }
}

export function clearAllLocalData(): void {
  clearLocalDayRecords()
  clearSalaryInputs()
  clearLocalSettings()
}

function parseBackupFile(text: string): LocalBackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是合法的 JSON')
  }

  // 兼容早期/宽松格式：顶层直接就是一个记录数组。
  if (Array.isArray(parsed)) {
    const dayRecords = normalizeBackupDayRecords(parsed)
    if (dayRecords.length === 0) throw new Error('备份文件里没有可识别的排班记录')

    return {
      app: backupAppId,
      version: backupVersion,
      exportedAt: '',
      dayRecords,
      salaryInputs: {},
      settings: {}
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('备份文件格式无法识别')
  }

  const record = parsed as Record<string, unknown>
  if (typeof record.app === 'string' && record.app !== backupAppId) {
    throw new Error('这个备份文件不是「倒班表 · 本地版」导出的')
  }

  const dayRecords = normalizeBackupDayRecords(record.dayRecords)
  const salaryInputs = parseSalaryInputRecords(record.salaryInputs)
  const settings = parseBackupSettings(record.settings)

  if (dayRecords.length === 0 && Object.keys(salaryInputs).length === 0) {
    throw new Error('备份文件里没有可恢复的数据')
  }

  return {
    app: backupAppId,
    version: typeof record.version === 'number' ? record.version : backupVersion,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    dayRecords,
    salaryInputs,
    settings
  }
}

function normalizeBackupDayRecords(value: unknown): CloudDayRecord[] {
  if (!Array.isArray(value)) return []

  return value
    .map(normalizeLocalDayRecord)
    .filter((item): item is CloudDayRecord => item !== null)
}

function parseBackupSettings(value: unknown): { personName?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const personName = (value as Record<string, unknown>).personName
  return typeof personName === 'string' && personName.trim() ? { personName: personName.trim() } : {}
}

function buildBackupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes())].join('')

  return `倒班表-本地备份-${stamp}.json`
}
