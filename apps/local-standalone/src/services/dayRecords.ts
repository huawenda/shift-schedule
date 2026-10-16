import {
  type CloudDayRecord,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '@local/core'
import {
  readLocalOverrides,
  removeLocalDayRecord,
  upsertLocalDayRecord
} from './localStore'

/**
 * 排班覆盖记录的读写入口。
 *
 * 原来是走 Supabase 的，这里换成本机 localStorage；函数签名保持异步，
 * 这样界面层的调用方式和以前完全一致，将来要接回云端也不用改调用点。
 */

export interface DayOverrides {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
  leaveDurationOverrides: LeaveDurationOverrides
}

/** 记录结构沿用 core 的命名（CloudDayRecord），本质是「某人某天的覆盖记录」。 */
export type { CloudDayRecord }

export const emptyDayOverrides: DayOverrides = {
  shiftOverrides: {},
  overtimeOverrides: {},
  legalOverrides: {},
  leaveDurationOverrides: {}
}

export async function loadDayOverrides(): Promise<DayOverrides> {
  return readLocalOverrides()
}

export async function saveDayRecord(record: CloudDayRecord): Promise<void> {
  upsertLocalDayRecord(record)
}

export async function deleteDayRecord(personName: string, date: string): Promise<void> {
  removeLocalDayRecord(personName, date)
}
