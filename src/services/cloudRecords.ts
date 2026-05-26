import Taro from '@tarojs/taro'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  type OvertimeOverrides,
  type ShiftOverrides
} from './cloudRecordMaps'

export {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  type CloudDayRecord,
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
}> {
  const functionRecords = await callDayRecordsFunction('load')
  return cloudRecordsToOverrides(functionRecords)
}

export async function syncCloudOverrides(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  deletedKeys: string[] = []
): Promise<void> {
  const nextRecords = buildCloudDayRecords(shiftOverrides, overtimeOverrides)
  await callDayRecordsFunction('sync', nextRecords, deletedKeys)
}
