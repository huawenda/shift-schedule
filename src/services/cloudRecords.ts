import Taro from '@tarojs/taro'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type CloudDayRecord,
  type ShiftOverrides
} from './cloudRecordMaps'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import {
  cloudDayRecordToSupabaseRows,
  mergeSupabaseDayRecordRows,
  type SupabasePrivateDayRecordRow,
  type SupabaseShiftOverrideRow
} from './supabaseMaps'
import {
  leaveDurationOverridesFileName,
  leaveDurationOverridesStorageKey,
  overtimeOverridesFileName,
  overtimeOverridesStorageKey,
  readLeaveDurationOverridesFromStorage,
  readLegalOverridesFromStorage,
  readOvertimeOverridesFromStorage,
  readShiftOverridesFromStorage,
  shiftOverridesFileName,
  shiftOverridesStorageKey,
  legalOverridesFileName,
  legalOverridesStorageKey,
  writePersistence
} from './localOverrides'
import { isH5Runtime } from './runtime'

export {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  type CloudDayRecord,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from './cloudRecordMaps'

const collectionName = 'user_day_records'

interface DayRecordsFunctionResponse {
  records?: unknown[]
}

async function callDayRecordsFunction(
  action: 'load' | 'sync',
  records?: unknown[],
  deletedKeys?: string[]
): Promise<unknown[]> {
  try {
    const response = await Taro.cloud.callFunction({
      name: 'dayRecords',
      data: {
        action,
        ...(records ? { records } : {}),
        ...(deletedKeys?.length ? { deletedKeys } : {})
      }
    })
    const result = response.result as DayRecordsFunctionResponse | undefined
    if (!Array.isArray(result?.records)) {
      throw new Error(`${collectionName} 云函数返回格式异常`)
    }

    return result.records
  } catch (error) {
    console.warn('云函数 dayRecords 调用失败', error)
    throw error
  }
}

export async function loadCloudOverrides(): Promise<{
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
  leaveDurationOverrides: LeaveDurationOverrides
}> {
  if (isH5Runtime) {
    if (isSupabaseConfigured()) {
      const records = await loadSupabaseDayRecords()
      return cloudRecordsToOverrides(records)
    }

    return {
      shiftOverrides: readShiftOverridesFromStorage(),
      overtimeOverrides: readOvertimeOverridesFromStorage(),
      legalOverrides: readLegalOverridesFromStorage(),
      leaveDurationOverrides: readLeaveDurationOverridesFromStorage()
    }
  }

  const functionRecords = await callDayRecordsFunction('load')
  return cloudRecordsToOverrides(functionRecords)
}

export async function syncCloudOverrides(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  legalOverrides: LegalOverrides,
  leaveDurationOverrides: LeaveDurationOverrides,
  deletedKeys: string[] = []
): Promise<void> {
  if (isH5Runtime) {
    if (isSupabaseConfigured()) {
      await syncSupabaseDayRecords(
        buildCloudDayRecords(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides),
        deletedKeys
      )
      return
    }

    writePersistence(shiftOverridesStorageKey, shiftOverridesFileName, shiftOverrides)
    writePersistence(overtimeOverridesStorageKey, overtimeOverridesFileName, overtimeOverrides)
    writePersistence(legalOverridesStorageKey, legalOverridesFileName, legalOverrides)
    writePersistence(leaveDurationOverridesStorageKey, leaveDurationOverridesFileName, leaveDurationOverrides)
    return
  }

  const nextRecords = buildCloudDayRecords(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides)
  await callDayRecordsFunction('sync', nextRecords, deletedKeys)
}

export async function saveCloudDayRecord(record: CloudDayRecord): Promise<void> {
  if (isH5Runtime) {
    if (isSupabaseConfigured()) {
      await saveSupabaseDayRecord(record)
      return
    }

    return
  }

  const existingOverrides = await loadCloudOverrides()
  const key = getOverrideKey(record.personName, record.date)
  await syncCloudOverrides(
    {
      ...existingOverrides.shiftOverrides,
      ...(record.shiftOverride ? { [key]: record.shiftOverride } : {})
    },
    {
      ...existingOverrides.overtimeOverrides,
      ...(record.overtimeHours && record.overtimeHours > 0 ? { [key]: record.overtimeHours } : {})
    },
    {
      ...existingOverrides.legalOverrides,
      ...(record.isLegalOvertime ? { [key]: true } : {})
    },
    {
      ...existingOverrides.leaveDurationOverrides,
      ...(record.leaveDuration ? { [key]: record.leaveDuration } : {})
    }
  )
}

export async function deleteCloudDayRecord(personName: string, date: string): Promise<void> {
  if (isH5Runtime) {
    if (isSupabaseConfigured()) {
      await deleteSupabaseDayRecord(personName, date)
      return
    }

    return
  }

  const key = getOverrideKey(personName, date)
  const existingOverrides = await loadCloudOverrides()
  const { [key]: _deletedShift, ...shiftOverrides } = existingOverrides.shiftOverrides
  const { [key]: _deletedOvertime, ...overtimeOverrides } = existingOverrides.overtimeOverrides
  const { [key]: _deletedLegal, ...legalOverrides } = existingOverrides.legalOverrides
  const { [key]: _deletedLeaveDuration, ...leaveDurationOverrides } = existingOverrides.leaveDurationOverrides

  await syncCloudOverrides(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides, [key])
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

async function syncSupabaseDayRecords(records: ReturnType<typeof buildCloudDayRecords>, deletedKeys: string[]) {
  await Promise.all(records.map(saveSupabaseDayRecord))
  await Promise.all(deletedKeys.map(async key => {
    const [personName, date, ...rest] = key.split('::')
    if (!personName || !date || rest.length > 0) return
    await deleteSupabaseDayRecord(personName, date)
  }))
}

async function saveSupabaseDayRecord(record: CloudDayRecord) {
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

async function deleteSupabaseDayRecord(personName: string, date: string) {
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
