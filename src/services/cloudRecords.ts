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
