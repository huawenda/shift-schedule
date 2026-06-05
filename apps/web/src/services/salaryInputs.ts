import { emptySalaryInputs, type SalaryInputValues } from '@shift-schedule/core'
import { isSupabaseConfigured } from './env'
import { getSupabaseClient } from './supabaseClient'
import {
  salaryEntryToSupabaseRow,
  supabaseSalaryRowsToRecords,
  type SalaryInputRecords,
  type SupabaseSalaryInputRow
} from './supabaseMaps'

const salaryInputsStorageKey = 'shift-scheduler:web:salary-inputs:v1'

export type { SalaryInputRecords }

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
    // Salary inputs are convenience data and should not block the page.
  }
}

export async function loadSalaryInputs(): Promise<SalaryInputRecords> {
  if (!isSupabaseConfigured()) return readSalaryInputsFromStorage()

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

export async function saveSalaryInput(key: string, values: SalaryInputValues): Promise<void> {
  const currentRecords = readSalaryInputsFromStorage()
  writeSalaryInputsToStorage({
    ...currentRecords,
    [key]: values
  })

  if (!isSupabaseConfigured()) return

  const supabase = getSupabaseClient()
  const row = salaryEntryToSupabaseRow(key, values)
  if (!row) return

  const { error } = await supabase
    .from('salary_inputs')
    .upsert(row, { onConflict: 'person_name,month' })

  if (error) throw error
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
