import Taro from '@tarojs/taro'
import { isH5Runtime } from './runtime'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import {
  salaryEntryToSupabaseRow,
  supabaseSalaryRowsToRecords,
  type SupabaseSalaryInputRow
} from './supabaseMaps'
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
  if (isH5Runtime && isSupabaseConfigured()) {
    return loadSupabaseSalaryInputs()
  }

  return readSalaryInputsFromStorage()
}

export async function syncSalaryInputs(records: SalaryInputRecords): Promise<void> {
  if (isH5Runtime && isSupabaseConfigured()) {
    await syncSupabaseSalaryInputs(records)
    return
  }

  writeSalaryInputsToStorage(records)
}

export async function saveSalaryInput(key: string, values: SalaryInputValues): Promise<void> {
  if (isH5Runtime && isSupabaseConfigured()) {
    await saveSupabaseSalaryInput(key, values)
    return
  }

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

async function loadSupabaseSalaryInputs(): Promise<SalaryInputRecords> {
  const supabase = getSupabaseClient()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return readSalaryInputsFromStorage()

  const { data, error } = await supabase
    .from('salary_inputs')
    .select('person_name, month, base_salary, performance_allowance, position_allowance, other_deductions')
    .order('person_name', { ascending: true })
    .order('month', { ascending: true })

  if (error) throw error
  return supabaseSalaryRowsToRecords((data || []) as SupabaseSalaryInputRow[])
}

async function syncSupabaseSalaryInputs(records: SalaryInputRecords): Promise<void> {
  const supabase = getSupabaseClient()
  const rows = Object.entries(records)
    .map(([key, values]) => salaryEntryToSupabaseRow(key, values))
    .filter((row): row is SupabaseSalaryInputRow => Boolean(row))

  if (rows.length === 0) return

  const { error } = await supabase
    .from('salary_inputs')
    .upsert(rows, { onConflict: 'person_name,month' })

  if (error) throw error
}

async function saveSupabaseSalaryInput(key: string, values: SalaryInputValues): Promise<void> {
  const supabase = getSupabaseClient()
  const row = salaryEntryToSupabaseRow(key, values)
  if (!row) return

  const { error } = await supabase
    .from('salary_inputs')
    .upsert(row, { onConflict: 'person_name,month' })

  if (error) throw error
}
