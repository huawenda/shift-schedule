/**
 * 班次词汇表。
 *
 * 六个班次是产品的固定语义（不提供增删改），用户能自定义的是「谁上哪个班序」。
 * 这里集中放：类型、简称、色调类名、班次时段假设。
 */

export type ShiftType = '白班' | '夜班' | '休息' | '白特' | '夜特' | '事假'

export const SHIFT_TYPES: readonly ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']

export interface ShiftMeta {
  /** 全称，弹层与图例里用 */
  label: ShiftType
  /** 矩阵格子里单字显示；两字在 22–24px 列宽下会换行 */
  short: string
  /** 对应 SCSS 里的 .t-{tone} */
  tone: string
  /** 班次起点小时（24h），仅有工时的班次才有 */
  startHour?: number
  /** 时长（小时） */
  hours?: number
}

export const SHIFT_META: Record<ShiftType, ShiftMeta> = {
  白班: { label: '白班', short: '白', tone: 'day', startHour: 8, hours: 12 },
  夜班: { label: '夜班', short: '夜', tone: 'night', startHour: 20, hours: 12 },
  休息: { label: '休息', short: '休', tone: 'rest' },
  白特: { label: '白特', short: '特', tone: 'dayx', startHour: 8, hours: 12 },
  夜特: { label: '夜特', short: '特', tone: 'nightx', startHour: 20, hours: 12 },
  事假: { label: '事假', short: '假', tone: 'leave' }
}

export function isShiftType(value: unknown): value is ShiftType {
  return typeof value === 'string' && (SHIFT_TYPES as readonly string[]).includes(value)
}

/** 有工时的班次（白/夜/白特/夜特）；休息与事假不算出勤 */
export function isWorkShift(shift: ShiftType): boolean {
  return shift !== '休息' && shift !== '事假'
}

export function shiftToneClass(shift: ShiftType): string {
  return `t-${SHIFT_META[shift].tone}`
}
