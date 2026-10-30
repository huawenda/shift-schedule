/**
 * 加班与法定标记的规则。
 *
 * 规则抄自 core（`utils/schedule.ts` 的 `normalizeOvertimeHours` 与
 * `utils/legalOvertime.ts`，预设档位在 miniapp 的 `shiftEditRules`），
 * 但本地版不 import core —— 这里是按同一口径重写的一份。
 *
 * 一句话：只有**有工时的班次**才能记加班、才能标法定；休息与事假不能。
 */

import { isWorkShift, type ShiftType } from './shifts'

/** 加班上限：一天 24 小时封顶，超出按 24 算（防手误输入三位数） */
export const MAX_OVERTIME_HOURS = 24

/** 最小步长（小时） */
export const OVERTIME_STEP = 0.5

/** 能否记加班：白班 / 夜班 / 白特 / 夜特 */
export function canRecordOvertime(shift: ShiftType): boolean {
  return isWorkShift(shift)
}

/** 能否标法定：与加班同一口径 */
export function canMarkLegal(shift: ShiftType): boolean {
  return isWorkShift(shift)
}

/**
 * 预设档位。
 *
 * - 白/夜 + 法定、白特/夜特 → `[10, 11, 11.5]`（整天特勤）
 * - 白/夜 普通 → `[2, 3, 3.5]`（班后加班）
 * - 休息 / 事假 → 空数组（不产生加班）
 */
export function getOvertimePresets(shift: ShiftType, isLegal: boolean): number[] {
  if (!canRecordOvertime(shift)) return []
  if (isLegal || shift === '白特' || shift === '夜特') return [10, 11, 11.5]
  return [2, 3, 3.5]
}

/**
 * 把任意输入收敛成合法小时数：非法/负数 → 0，否则向下取到 0.5 的整数倍并封顶 24。
 * 与 core 的 `normalizeOvertimeHours` 行为一致（2.7 → 2.5、0.4 → 0）。
 */
export function normalizeOvertimeHours(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0

  const snapped = Math.floor(parsed * 2) / 2
  return Math.min(snapped, MAX_OVERTIME_HOURS)
}

/** `2 → "2h"`、`3.5 → "3.5h"`；日历格子与提示文案共用 */
export function formatOvertimeHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

/**
 * 一条日记录的加班/法定是否「有效」。
 * 班次不支持时一律视为没有 —— 宁可少记，也不留「休息 + 3h」这种脏数据。
 */
export function sanitizeOvertime(shift: ShiftType, hours?: number, isLegal?: boolean): {
  overtimeHours?: number
  isLegal?: boolean
} {
  if (!canRecordOvertime(shift)) return {}

  const normalized = hours === undefined ? 0 : normalizeOvertimeHours(hours)
  const legal = canMarkLegal(shift) && isLegal === true ? true : undefined

  return {
    overtimeHours: normalized > 0 ? normalized : undefined,
    isLegal: legal
  }
}
