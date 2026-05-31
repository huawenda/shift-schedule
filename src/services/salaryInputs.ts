import Taro from '@tarojs/taro'
import { apiRequest, hasWebAuthToken } from './apiClient'
import { isH5Runtime } from './runtime'
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
  if (isH5Runtime && hasWebAuthToken()) {
    const response = await apiRequest<{ records?: unknown }>('/salary-inputs')
    return parseSalaryInputRecords(response.records)
  }

  return readSalaryInputsFromStorage()
}

export async function syncSalaryInputs(records: SalaryInputRecords): Promise<void> {
  if (isH5Runtime && hasWebAuthToken()) {
    await apiRequest<{ records?: unknown }>('/salary-inputs', {
      method: 'PUT',
      body: { records }
    })
    return
  }

  writeSalaryInputsToStorage(records)
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
