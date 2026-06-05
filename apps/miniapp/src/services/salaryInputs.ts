import Taro from '@tarojs/taro'
import { emptySalaryInputs, type SalaryInputValues } from '../utils/salary'

export type SalaryInputRecords = Record<string, SalaryInputValues>

const salaryInputsStorageKey = 'shift-scheduler:salary-inputs:v1'

export function getSalaryInputKey(personName: string, month: string): string {
  return `${personName}::${month}`
}

export function readSalaryInputsFromStorage(): SalaryInputRecords {
  try {
    return parseSalaryInputRecords(Taro.getStorageSync(salaryInputsStorageKey))
  } catch {
    return {}
  }
}

export function writeSalaryInputsToStorage(records: SalaryInputRecords) {
  try {
    Taro.setStorageSync(salaryInputsStorageKey, records)
  } catch {
    // Salary inputs are local-only convenience data and should not block rendering.
  }
}

export async function loadSalaryInputs(): Promise<SalaryInputRecords> {
  return readSalaryInputsFromStorage()
}

export async function syncSalaryInputs(records: SalaryInputRecords): Promise<void> {
  writeSalaryInputsToStorage(records)
}

export async function saveSalaryInput(key: string, values: SalaryInputValues): Promise<void> {
  const records = readSalaryInputsFromStorage()
  writeSalaryInputsToStorage({
    ...records,
    [key]: values
  })
}

function parseSalaryInputRecords(value: unknown): SalaryInputRecords {
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
