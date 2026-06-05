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
  const nextRecords = buildCloudDayRecords(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides)
  await callDayRecordsFunction('sync', nextRecords, deletedKeys)
}

export async function saveCloudDayRecord(record: CloudDayRecord): Promise<void> {
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
  const key = getOverrideKey(personName, date)
  const existingOverrides = await loadCloudOverrides()
  const { [key]: _deletedShift, ...shiftOverrides } = existingOverrides.shiftOverrides
  const { [key]: _deletedOvertime, ...overtimeOverrides } = existingOverrides.overtimeOverrides
  const { [key]: _deletedLegal, ...legalOverrides } = existingOverrides.legalOverrides
  const { [key]: _deletedLeaveDuration, ...leaveDurationOverrides } = existingOverrides.leaveDurationOverrides

  await syncCloudOverrides(shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides, [key])
}
