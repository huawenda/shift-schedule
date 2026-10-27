import { daysBetween, positiveModulo } from './dateUtils'
import type { ShiftType } from './shifts'

/**
 * 班序模板：**固定不可编辑**。
 *
 * 13 条 24 天循环，来自真实的四班两倒节奏（原项目的 4F–4X 班组规律），
 * 原样照搬：不增、不删、不改周期、不改序列。用户能做的只是「把人挂到哪一条上」。
 *
 * 每条 24 天的序列从锚点日 `2026-06-07` 起算，向前向后都能推算，
 * 所以不需要预生成任何日期区间。
 */

export const PATTERN_CYCLE_LENGTH = 24
export const PATTERN_ANCHOR_DATE = '2026-06-07'

export type PatternId =
  | '4F' | '4G' | '4H' | '4I' | '4J' | '4K' | '4R'
  | '4S' | '4T' | '4U' | '4V' | '4W' | '4X'

export interface ShiftPattern {
  id: PatternId
  shifts: ShiftType[]
}

const raw: Array<[PatternId, ShiftType[]]> = [
  ['4F', ['夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息']],
  ['4G', ['休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息']],
  ['4H', ['休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班']],
  ['4I', ['白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班']],
  ['4J', ['白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班']],
  ['4K', ['白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班']],
  ['4R', ['白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息']],
  ['4S', ['休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息']],
  ['4T', ['休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班']],
  ['4U', ['夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班']],
  ['4V', ['夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班']],
  ['4W', ['夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班']],
  ['4X', ['夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息']]
]

export const PATTERNS: ShiftPattern[] = raw.map(([id, shifts]) => ({ id, shifts }))

export const PATTERN_IDS: PatternId[] = PATTERNS.map(pattern => pattern.id)

const byId = new Map<string, ShiftPattern>(PATTERNS.map(pattern => [pattern.id, pattern]))

export function getPattern(id: string): ShiftPattern | undefined {
  return byId.get(id)
}

export function isPatternId(value: unknown): value is PatternId {
  return typeof value === 'string' && byId.has(value)
}

/**
 * 某条班序在指定日期的班次。
 * 锚点之前的日期同样成立（负偏移取正模），因此前后任意年份都能算。
 */
export function getPatternShift(patternId: string, dateKey: string): ShiftType | null {
  const pattern = byId.get(patternId)
  if (!pattern) return null

  const offset = daysBetween(PATTERN_ANCHOR_DATE, dateKey)
  return pattern.shifts[positiveModulo(offset, PATTERN_CYCLE_LENGTH)]
}

/**
 * 同一班序上的人是否会在同一天拿到同样的班次 —— 由模板决定，天然成立。
 * 这个函数只用于测试与设置页的预览。
 */
export function getPatternPreview(patternId: string, dateKeys: string[]): ShiftType[] {
  return dateKeys
    .map(dateKey => getPatternShift(patternId, dateKey))
    .filter((shift): shift is ShiftType => shift !== null)
}
