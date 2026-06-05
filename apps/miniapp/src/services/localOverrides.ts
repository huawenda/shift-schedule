import Taro from '@tarojs/taro'
import type { LeaveDuration, ShiftType } from '../types/schedule'
import { normalizeOvertimeHours } from '../utils/schedule'
import type { LeaveDurationOverrides, LegalOverrides, OvertimeOverrides, ShiftOverrides } from './cloudRecordMaps'

const editableShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']
const leaveDurationOptions: LeaveDuration[] = ['半天', '一天']
export const shiftOverridesStorageKey = 'shift-scheduler:shift-overrides:v1'
export const overtimeOverridesStorageKey = 'shift-scheduler:overtime-overrides:v1'
export const legalOverridesStorageKey = 'shift-scheduler:legal-overrides:v1'
export const leaveDurationOverridesStorageKey = 'shift-scheduler:leave-duration-overrides:v1'
export const shiftOverridesFileName = 'shift-overrides-v1.json'
export const overtimeOverridesFileName = 'overtime-overrides-v1.json'
export const legalOverridesFileName = 'legal-overrides-v1.json'
export const leaveDurationOverridesFileName = 'leave-duration-overrides-v1.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isShiftType(value: unknown): value is ShiftType {
  return editableShiftOptions.includes(value as ShiftType)
}

function isLeaveDuration(value: unknown): value is LeaveDuration {
  return leaveDurationOptions.includes(value as LeaveDuration)
}

function readStorage(key: string): unknown {
  try {
    return Taro.getStorageSync(key)
  } catch {
    return null
  }
}

function parseShiftOverrides(value: unknown): ShiftOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<ShiftOverrides>((overrides, [key, value]) => {
    if (isShiftType(value)) overrides[key] = value
    return overrides
  }, {})
}

function parseOvertimeOverrides(value: unknown): OvertimeOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<OvertimeOverrides>((overrides, [key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      overrides[key] = normalizeOvertimeHours(value)
    }
    return overrides
  }, {})
}

function parseLegalOverrides(value: unknown): LegalOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<LegalOverrides>((overrides, [key, value]) => {
    if (value === true) overrides[key] = true
    return overrides
  }, {})
}

function parseLeaveDurationOverrides(value: unknown): LeaveDurationOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<LeaveDurationOverrides>((overrides, [key, value]) => {
    if (isLeaveDuration(value)) overrides[key] = value
    return overrides
  }, {})
}

function getBackupFilePath(fileName: string): string | null {
  const env = Taro.env as { USER_DATA_PATH?: string } | undefined
  return env?.USER_DATA_PATH ? `${env.USER_DATA_PATH}/${fileName}` : null
}

function readJsonBackup(fileName: string): unknown {
  try {
    const filePath = getBackupFilePath(fileName)
    if (!filePath) return null

    const content = Taro.getFileSystemManager().readFileSync(filePath, 'utf8')
    return typeof content === 'string' ? JSON.parse(content) : null
  } catch {
    return null
  }
}

export function readShiftOverridesFromStorage(): ShiftOverrides {
  const storedValue = readStorage(shiftOverridesStorageKey)
  return parseShiftOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(shiftOverridesFileName))
}

export function readOvertimeOverridesFromStorage(): OvertimeOverrides {
  const storedValue = readStorage(overtimeOverridesStorageKey)
  return parseOvertimeOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(overtimeOverridesFileName))
}

export function readLegalOverridesFromStorage(): LegalOverrides {
  const storedValue = readStorage(legalOverridesStorageKey)
  return parseLegalOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(legalOverridesFileName))
}

export function readLeaveDurationOverridesFromStorage(): LeaveDurationOverrides {
  const storedValue = readStorage(leaveDurationOverridesStorageKey)
  return parseLeaveDurationOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(leaveDurationOverridesFileName))
}

export function writePersistence(key: string, fileName: string, value: unknown) {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    // Local persistence should never block editing in runtimes with restricted storage.
  }

  try {
    const filePath = getBackupFilePath(fileName)
    if (!filePath) return

    Taro.getFileSystemManager().writeFileSync(filePath, JSON.stringify(value), 'utf8')
  } catch {
    // The file backup is best-effort because some runtimes only expose storage.
  }
}
