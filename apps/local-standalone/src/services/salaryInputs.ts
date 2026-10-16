import { emptySalaryInputs, type SalaryInputValues } from '@local/core'

/**
 * 薪资输入：只存在本机 localStorage。
 * 与 salaryInputs 的存储键保持独立，避免和「薪资计算」的其他状态混在一起。
 */

export type SalaryInputRecords = Record<string, SalaryInputValues>

const salaryInputsStorageKey = 'shift-schedule:local:salary-inputs:v1'

export function getSalaryInputKey(personName: string, month: string): string {
  return `${personName}::${month}`
}

export function readSalaryInputsFromStorage(): SalaryInputRecords {
  if (typeof window === 'undefined') return {}

  try {
    return parseSalaryInputRecords(JSON.parse(window.localStorage.getItem(salaryInputsStorageKey) || '{}'))
  } catch {
    return {}
  }
}

export function writeSalaryInputsToStorage(records: SalaryInputRecords): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(salaryInputsStorageKey, JSON.stringify(records))
  } catch {
    // 薪资输入属于便利数据，写不进去也不该阻塞页面
  }
}

export function clearSalaryInputs(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(salaryInputsStorageKey)
  } catch {
    // 忽略
  }
}

export async function loadSalaryInputs(): Promise<SalaryInputRecords> {
  return readSalaryInputsFromStorage()
}

export async function saveSalaryInput(key: string, values: SalaryInputValues): Promise<void> {
  writeSalaryInputsToStorage({
    ...readSalaryInputsFromStorage(),
    [key]: values
  })
}

export function parseSalaryInputRecords(value: unknown): SalaryInputRecords {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<SalaryInputRecords>((records, [key, record]) => {
    if (!isRecord(record)) return records

    records[key] = {
      baseSalary: parseInputString(record.baseSalary),
      performanceAllowance: parseInputString(record.performanceAllowance),
      positionAllowance: parseInputString(record.positionAllowance),
      otherDeductions: parseInputString(record.otherDeductions)
    }
    return records
  }, {})
}

function parseInputString(value: unknown): string {
  return typeof value === 'string' ? value : emptySalaryInputs.baseSalary
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
