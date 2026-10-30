import { daysBetween, positiveModulo } from './dateUtils'
import { isShiftType, type ShiftType } from './shifts'

/**
 * 班序：**24 天循环**，所有班序共用同一个锚点。
 *
 * 分两层：
 *  - 内置 13 条（4F–4X）：原样照搬真实四班两倒节奏，**只读不可改**；
 *  - 自定义：用户照同样的 24 天格式新建，名字自定，可改可删。
 *
 * 两层在结构上完全一样，区别只在「能不能编辑」和「谁负责持久化」，
 * 所以推算逻辑走同一个 `resolvePatterns()` 解析器，不存在两套算法。
 *
 * ⚠️ 班次（白班/夜班/…，6 种）与班序（24 天循环）是两个概念，别混。
 */

export const PATTERN_CYCLE_LENGTH = 24
export const PATTERN_ANCHOR_DATE = '2026-06-07'
/** 自定义班序上限。纯粹是防下拉失控，不是技术限制 */
export const MAX_CUSTOM_PATTERNS = 10

/* ------------------------------------------------------------ 类型 */

export type BuiltinPatternId =
  | '4F' | '4G' | '4H' | '4I' | '4J' | '4K' | '4R'
  | '4S' | '4T' | '4U' | '4V' | '4W' | '4X'

export interface ShiftPattern {
  id: string
  /** 恰好 PATTERN_CYCLE_LENGTH 个 */
  shifts: ShiftType[]
}

export interface CustomPattern extends ShiftPattern {
  /** 用户起的名字，显示用；引用一律靠 id，改名不影响已挂的成员 */
  name: string
}

/* -------------------------------------------------------- 内置 13 条 */

const rawBuiltin: Array<[BuiltinPatternId, ShiftType[]]> = [
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

export const BUILTIN_PATTERNS: ShiftPattern[] = rawBuiltin.map(([id, shifts]) => ({ id, shifts }))
export const BUILTIN_PATTERN_IDS: BuiltinPatternId[] = rawBuiltin.map(([id]) => id)

const builtinIdSet = new Set<string>(BUILTIN_PATTERN_IDS)

export function isBuiltinPatternId(value: unknown): value is BuiltinPatternId {
  return typeof value === 'string' && builtinIdSet.has(value)
}

/* ---------------------------------------------------------- 自定义 */

export function createCustomPatternId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `cp-${Date.now().toString(36)}-${random}`
}

/** 新建时的初始序列：24 天全休息，避免出现半张表 */
export function createBlankCustomPattern(): CustomPattern {
  return {
    id: createCustomPatternId(),
    name: '',
    shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, () => '休息' as ShiftType)
  }
}

/** 24 格是否完整且每格都是合法班次 */
export function isValidPatternShifts(value: unknown): value is ShiftType[] {
  return Array.isArray(value) && value.length === PATTERN_CYCLE_LENGTH && value.every(isShiftType)
}

/**
 * 把任意来源的自定义班序收敛成合法数组，绝不抛异常。
 * 非法条目直接丢弃（缺 id/名字、格子不完整、id 或名字重复）。
 */
export function normalizeCustomPatterns(value: unknown): CustomPattern[] {
  if (!Array.isArray(value)) return []

  const result: CustomPattern[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  value.forEach(item => {
    if (result.length >= MAX_CUSTOM_PATTERNS) return
    if (typeof item !== 'object' || item === null) return

    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''

    if (!id || !name) return
    // 撞内置代号会让界面无法区分，一律拒绝
    if (builtinIdSet.has(id) || builtinIdSet.has(name)) return
    if (ids.has(id) || names.has(name)) return
    if (!isValidPatternShifts(record.shifts)) return

    ids.add(id)
    names.add(name)
    result.push({ id, name, shifts: [...record.shifts] })
  })

  return result
}

export interface CustomPatternDraft {
  /** 编辑已有班序时带上 id，用于重名判断时排除自己 */
  id?: string
  name: string
  shifts: ShiftType[]
}

/**
 * 校验一条自定义班序草稿。返回中文错误文案，空数组表示通过。
 * `existing` 是当前已有的自定义班序（校验重名与数量上限要用）。
 */
export function validateCustomPattern(
  draft: CustomPatternDraft,
  existing: CustomPattern[]
): string[] {
  const errors: string[] = []
  const name = draft.name.trim()
  const isNew = !draft.id

  if (!name) {
    errors.push('班序需要起个名字')
  } else if (builtinIdSet.has(name)) {
    errors.push(`「${name}」是内置班序的代号，换一个名字`)
  } else if (existing.some(pattern => pattern.id !== draft.id && pattern.name === name)) {
    errors.push(`已经有一条叫「${name}」的班序了`)
  }

  if (!isValidPatternShifts(draft.shifts)) {
    errors.push(`班序必须是完整的 ${PATTERN_CYCLE_LENGTH} 天`)
  }

  if (isNew && existing.length >= MAX_CUSTOM_PATTERNS) {
    errors.push(`自定义班序最多 ${MAX_CUSTOM_PATTERNS} 条，删掉一条再加`)
  }

  return errors
}

/* ------------------------------------------------------ 解析器 */

export interface PatternLookup {
  has(id: string): boolean
  get(id: string): ShiftPattern | undefined
  /** 某条班序在指定日期的班次；锚点之前同样成立（负偏移取正模） */
  getShift(id: string, dateKey: string): ShiftType | null
  /** 显示名：内置是代号本身，自定义是用户起的名字 */
  labelOf(id: string): string
  readonly builtin: ShiftPattern[]
  readonly custom: CustomPattern[]
  /** 内置在前、自定义在后，下拉与列表都按这个顺序 */
  readonly all: ShiftPattern[]
}

/**
 * 把内置 13 条与当次的自定义班序合成一个查询器。
 *
 * 所有业务推算都应该走这里，而不是模块级的固定表 —— 否则自定义班序
 * 会被当成「未知 id」而算不出班次，成员在 normalizeRoster 里会被丢掉。
 */
export function resolvePatterns(customs: CustomPattern[] = []): PatternLookup {
  const byId = new Map<string, ShiftPattern>()
  const labelById = new Map<string, string>()

  BUILTIN_PATTERNS.forEach(pattern => {
    byId.set(pattern.id, pattern)
    labelById.set(pattern.id, pattern.id)
  })
  customs.forEach(pattern => {
    byId.set(pattern.id, pattern)
    labelById.set(pattern.id, pattern.name)
  })

  return {
    has: id => byId.has(id),
    get: id => byId.get(id),
    getShift(id, dateKey) {
      const pattern = byId.get(id)
      if (!pattern) return null
      const offset = daysBetween(PATTERN_ANCHOR_DATE, dateKey)
      return pattern.shifts[positiveModulo(offset, PATTERN_CYCLE_LENGTH)]
    },
    labelOf: id => labelById.get(id) ?? id,
    builtin: BUILTIN_PATTERNS,
    custom: customs,
    all: [...BUILTIN_PATTERNS, ...customs]
  }
}

/** 只含内置 13 条的查询器，给不需要自定义的场景（如向导首开）备用 */
export const builtinOnlyLookup = resolvePatterns([])

/* ---------------------------------------------- 兼容旧调用的窄接口 */

/**
 * 某条**内置**班序在指定日期的班次。
 * ⚠️ 只认 4F–4X；业务代码请用 `resolvePatterns(customs).getShift()`。
 */
export function getPatternShift(patternId: string, dateKey: string): ShiftType | null {
  return builtinOnlyLookup.getShift(patternId, dateKey)
}

/**
 * 某条**内置**班序在若干天的班次，仅用于测试与预览。
 * ⚠️ 同样不认自定义班序。
 */
export function getPatternPreview(patternId: string, dateKeys: string[]): ShiftType[] {
  return dateKeys
    .map(dateKey => builtinOnlyLookup.getShift(patternId, dateKey))
    .filter((shift): shift is ShiftType => shift !== null)
}

/**
 * 班序格子里能填的班次 —— **只有白班 / 夜班 / 休息**。
 *
 * 这三者是客观的排班节奏（谁上什么班、哪天休），一条班序必然由它们构成；
 * 白特、夜特、事假属于临时或人为决定的事，改班时单天设，不写进 24 格循环。
 * 数据层仍接受六种班次（旧数据、改班记录都用得到），这里限定的只是**录入入口**。
 */
export const PATTERN_SHIFT_OPTIONS: readonly ShiftType[] = ['白班', '夜班', '休息']
