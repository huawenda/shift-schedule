import Taro from '@tarojs/taro'
import { apiRequest, hasWebAuthToken } from './apiClient'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from './cloudRecordMaps'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import {
  cloudDayRecordToSupabaseRow,
  supabaseDayRecordToCloudRecord,
  type SupabaseDayRecordRow
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

    if (hasWebAuthToken()) {
      const response = await apiRequest<DayRecordsFunctionResponse>('/day-records')
      if (Array.isArray(response.records)) return cloudRecordsToOverrides(response.records)
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

    if (hasWebAuthToken()) {
      const nextRecords = buildCloudDayRecords(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides)
      await apiRequest<DayRecordsFunctionResponse>('/day-records/sync', {
        method: 'POST',
        body: {
          records: nextRecords,
          deletedKeys
        }
      })
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

async function loadSupabaseDayRecords() {
  const supabase = getSupabaseClient()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []

  const { data, error } = await supabase
    .from('day_records')
    .select('id, person_name, record_date, shift_override, overtime_hours, is_legal_overtime, leave_duration, created_at_ms, created_at_text, updated_at_ms, updated_at_text')
    .order('person_name', { ascending: true })
    .order('record_date', { ascending: true })

  if (error) throw error
  return (data || []).map(row => supabaseDayRecordToCloudRecord(row as SupabaseDayRecordRow))
}

async function syncSupabaseDayRecords(records: ReturnType<typeof buildCloudDayRecords>, deletedKeys: string[]) {
  const supabase = getSupabaseClient()
  const rows = records.map(cloudDayRecordToSupabaseRow)
  if (rows.length > 0) {
    const { error } = await supabase
      .from('day_records')
      .upsert(rows, { onConflict: 'person_name,record_date' })
    if (error) throw error
  }

  await Promise.all(deletedKeys.map(async key => {
    const [personName, date, ...rest] = key.split('::')
    if (!personName || !date || rest.length > 0) return

    const { error } = await supabase
      .from('day_records')
      .delete()
      .eq('person_name', personName)
      .eq('record_date', date)
    if (error) throw error
  }))
}
