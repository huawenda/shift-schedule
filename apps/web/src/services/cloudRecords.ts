import {
  type CloudDayRecord,
  cloudRecordsToOverrides,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '@shift-schedule/core'
import { isSupabaseConfigured } from './env'
import { getSupabaseClient } from './supabaseClient'
import {
  cloudDayRecordToSupabaseRows,
  mergeSupabaseDayRecordRows,
  type SupabasePrivateDayRecordRow,
  type SupabaseShiftOverrideRow
} from './supabaseMaps'

export interface CloudOverrides {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
  leaveDurationOverrides: LeaveDurationOverrides
}

export type { CloudDayRecord }

export async function loadCloudOverrides(): Promise<CloudOverrides> {
  if (!isSupabaseConfigured()) return emptyCloudOverrides()

  const records = await loadSupabaseDayRecords()
  return cloudRecordsToOverrides(records)
}

export async function saveCloudDayRecord(record: CloudDayRecord): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = getSupabaseClient()
  const { shiftRow, privateRow } = cloudDayRecordToSupabaseRows(record)

  if (shiftRow) {
    const { error } = await supabase
      .from('day_shift_overrides')
      .upsert(shiftRow, { onConflict: 'person_name,record_date' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('day_shift_overrides')
      .delete()
      .eq('person_name', record.personName)
      .eq('record_date', record.date)
    if (error) throw error
  }

  if (privateRow) {
    const { error } = await supabase
      .from('day_private_records')
      .upsert(privateRow, { onConflict: 'person_name,record_date' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('day_private_records')
      .delete()
      .eq('person_name', record.personName)
      .eq('record_date', record.date)
    if (error) throw error
  }
}

export async function deleteCloudDayRecord(personName: string, date: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const supabase = getSupabaseClient()
  const [{ error: shiftError }, { error: privateError }] = await Promise.all([
    supabase
      .from('day_shift_overrides')
      .delete()
      .eq('person_name', personName)
      .eq('record_date', date),
    supabase
      .from('day_private_records')
      .delete()
      .eq('person_name', personName)
      .eq('record_date', date)
  ])

  if (shiftError) throw shiftError
  if (privateError) throw privateError
}

function emptyCloudOverrides(): CloudOverrides {
  return {
    shiftOverrides: {},
    overtimeOverrides: {},
    legalOverrides: {},
    leaveDurationOverrides: {}
  }
}

async function loadSupabaseDayRecords() {
  const supabase = getSupabaseClient()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []

  const [
    { data: shiftRows, error: shiftError },
    { data: privateRows, error: privateError }
  ] = await Promise.all([
    supabase
      .from('day_shift_overrides')
      .select('id, person_name, record_date, shift_override, created_at_ms, created_at_text, updated_at_ms, updated_at_text')
      .order('person_name', { ascending: true })
      .order('record_date', { ascending: true }),
    supabase
      .from('day_private_records')
      .select('id, person_name, record_date, overtime_hours, is_legal_overtime, leave_duration, updated_at_ms, updated_at_text')
      .order('person_name', { ascending: true })
      .order('record_date', { ascending: true })
  ])

  if (shiftError) throw shiftError
  if (privateError) throw privateError

  return mergeSupabaseDayRecordRows(
    (shiftRows || []) as SupabaseShiftOverrideRow[],
    (privateRows || []) as SupabasePrivateDayRecordRow[]
  )
}
