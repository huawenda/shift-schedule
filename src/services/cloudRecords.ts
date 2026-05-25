import Taro from '@tarojs/taro'
import {
  buildCloudDayRecords,
  cloudRecordsToOverrides,
  getOverrideKey,
  isCloudDayRecord,
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

interface CloudCollection {
  get: () => Promise<{ data: unknown[] }>
  add: (options: { data: Record<string, unknown> }) => Promise<unknown>
  doc: (id: string) => {
    remove: () => Promise<unknown>
    update: (options: { data: Record<string, unknown> }) => Promise<unknown>
  }
  limit: (limit: number) => CloudCollection
}

interface DayRecordsFunctionResponse {
  records?: unknown[]
}

function getCollection(): CloudCollection {
  return Taro.cloud.database().collection(collectionName) as unknown as CloudCollection
}

async function callDayRecordsFunction(
  action: 'load' | 'sync',
  records?: unknown[],
  deletedKeys?: string[]
): Promise<unknown[] | null> {
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
    return Array.isArray(result?.records) ? result.records : null
  } catch (error) {
    console.warn('云函数 dayRecords 调用失败', error)
    return null
  }
}

export async function loadCloudOverrides(): Promise<{
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
}> {
  const functionRecords = await callDayRecordsFunction('load')
  if (functionRecords) return cloudRecordsToOverrides(functionRecords)

  const response = await getCollection().limit(1000).get()
  return cloudRecordsToOverrides(response.data)
}

export async function syncCloudOverrides(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  deletedKeys: string[] = []
): Promise<void> {
  const nextRecords = buildCloudDayRecords(shiftOverrides, overtimeOverrides)
  const syncedRecords = await callDayRecordsFunction('sync', nextRecords, deletedKeys)
  if (syncedRecords) return

  const collection = getCollection()
  const existingResponse = await collection.limit(1000).get()
  const existingRecords = existingResponse.data.filter(isCloudDayRecord)
  const existingByKey = new Map(existingRecords.map(record => [
    getOverrideKey(record.personName, record.date),
    record
  ]))
  const nextKeys = new Set(nextRecords.map(record => getOverrideKey(record.personName, record.date)))
  const updatedAt = Date.now()

  await Promise.all(nextRecords.map(record => {
    const key = getOverrideKey(record.personName, record.date)
    const existing = existingByKey.get(key)
    const data = {
      personName: record.personName,
      date: record.date,
      shiftOverride: record.shiftOverride ?? null,
      overtimeHours: record.overtimeHours ?? 0,
      updatedAt
    }

    if (existing?._id) {
      return collection.doc(existing._id).update({ data })
    }

    return collection.add({ data })
  }))

  await Promise.all(existingRecords
    .filter(record => (
      record._id &&
      (
        deletedKeys.includes(getOverrideKey(record.personName, record.date)) ||
        !nextKeys.has(getOverrideKey(record.personName, record.date))
      )
    ))
    .map(record => collection.doc(record._id as string).remove()))
}
