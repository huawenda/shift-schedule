/**
 * 事假时长。
 *
 * 口径照搬 web/core（`types/schedule.ts` 的 `LeaveDuration`、
 * `utils/statistics.ts` 的 `getLeaveDurationHours`）：
 * **半天 = 4h、一天 = 8h，不指定时按一天算**。
 *
 * 为什么事假要单独记时长：薪资里的扣款是「时薪 × 请假小时」，
 * 只记「这天是事假」算不出钱 —— 4h 和 8h 差一倍。
 */

export type LeaveDuration = '4h' | '8h'

export const LEAVE_DURATIONS: readonly LeaveDuration[] = ['4h', '8h']

/** 4h / 8h 分别对应半天 / 一天 */
export const LEAVE_HOURS: Record<LeaveDuration, number> = {
  '4h': 4,
  '8h': 8
}

/** 事假没指定时长时的默认值（一天 = 8h，与 web 的 `?? '一天'` 一致） */
export const DEFAULT_LEAVE_DURATION: LeaveDuration = '8h'

export function isLeaveDuration(value: unknown): value is LeaveDuration {
  return typeof value === 'string' && (LEAVE_DURATIONS as readonly string[]).includes(value)
}

/** 时长 → 小时。传 undefined 表示「事假但没记时长」，按一天算 */
export function leaveHoursOf(duration?: LeaveDuration): number {
  return LEAVE_HOURS[duration ?? DEFAULT_LEAVE_DURATION]
}

/**
 * 只有事假才带时长；别的班次一律清掉。
 * 和 `sanitizeOvertime` 是同一个思路：宁可少记，也不留「白班 + 4h 事假」这种脏数据。
 */
export function sanitizeLeave(shift: string, duration?: unknown): LeaveDuration | undefined {
  if (shift !== '事假') return undefined
  return isLeaveDuration(duration) ? duration : DEFAULT_LEAVE_DURATION
}

/** 4h → "4h"，8h → "8h"；给日历标题与提示用 */
export function formatLeaveDuration(duration?: LeaveDuration): string {
  return duration ?? DEFAULT_LEAVE_DURATION
}
