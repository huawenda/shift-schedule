import {
  cloudRecordsToOverrides,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '@shift-schedule/core'
import { isSupabaseConfigured } from './env'
import { getSupabaseClient } from './supabaseClient'
import {
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

export async function loadCloudOverrides(): Promise<CloudOverrides> {
  if (!isSupabaseConfigured()) return emptyCloudOverrides()

  const records = await loadSupabaseDayRecords()
  return cloudRecordsToOverrides(records)
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
