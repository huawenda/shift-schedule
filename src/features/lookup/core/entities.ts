/**
 * 实体候选：把 6 类可查询对象摊平成一张可搜索的表。
 *
 * v1 让用户先选「按型号 / 按 JIG」，等于要求他先知道自己手里的是哪类键。
 * 这里改成一张统一候选表：输入先匹配所有实体，再由类型优先级决定顺序，
 * 保证 `7748` 的首项是 INCH `77/48`（方案决策 1）。
 *
 * 纯函数、不碰 DOM；候选表按索引实例缓存 —— 索引只建一次，候选也只建一次。
 */

import type { LookupIndex } from './indexes'
import { matchScore, normalizeKey } from './normalize'
import type { EntityRef, EntityType } from './types'

/** 类型优先级：越小越靠前。INCH 必须最前，`7748` 才不会先落到 JIG。 */
const TYPE_PRIORITY: Record<EntityType, number> = {
  inch: 0,
  model: 1,
  fspm: 2,
  jig: 3,
  recipe: 4,
  group: 5,
}

/** 建议列表容量：每类最多 6 条、总数最多 18 条（方案 §6.2） */
export const PER_TYPE_LIMIT = 6
export const TOTAL_LIMIT = 18

/**
 * 组合 ID 的输入门槛。
 *
 * `7748` 会前缀命中 12 个组合 ID（7748G-01 等），把真正的 INCH / JIG 候选
 * 挤出屏幕。所以只有输入足够长（`7748G`）或带 `-` 时才纳入组合候选。
 */
const GROUP_MIN_QUERY = 5

export interface EntityCandidate {
  ref: EntityRef
  /** 候选列表第一行 */
  label: string
  /** 一行摘要，帮用户判断是不是他要的那个 */
  secondary: string
  /** 参与匹配的键（已归一化）；第一个是展示键 */
  keys: readonly string[]
}

export interface EntityHit extends EntityCandidate {
  /** 0 = 完全相等，1 = 前缀，2 = 包含 */
  score: number
}

/**
 * INCH 的紧凑键：`77/48` → `7748`。
 *
 * 现场口头和邮件里常把 77/48 写成 7748；NFKC 先收全角，再去掉所有分隔符。
 * **只用于 INCH** —— Recipe `31(10)` 紧凑后是 `3110`，会与别的键误撞。
 */
export function compactInchKey(input: string): string {
  return normalizeKey(input).replace(/[^0-9A-Z]/g, '')
}

function buildCandidates(index: LookupIndex): EntityCandidate[] {
  const out: EntityCandidate[] = []

  for (const [inch, groups] of index.byInch) {
    const models = new Set<string>()
    for (const group of groups) for (const model of group.models) models.add(model)
    out.push({
      ref: { type: 'inch', key: inch },
      label: inch,
      secondary: `${groups.length} 组合 · ${models.size} 型号`,
      keys: [normalizeKey(inch), compactInchKey(inch)],
    })
  }

  // 型号用原始写法做 label（FY 不写成 FY 之外的形式），重复型号只留第一条
  const seenModel = new Set<string>()
  for (const group of index.groups) {
    for (const model of group.models) {
      const key = normalizeKey(model)
      if (seenModel.has(key)) continue
      seenModel.add(key)
      out.push({
        ref: { type: 'model', key: model },
        label: model,
        secondary: `${group.inch} · ${group.jigPn} · Recipe ${group.recipe}`,
        keys: [key],
      })
    }
  }

  for (const entry of index.jigs) {
    out.push({
      ref: { type: 'jig', key: entry.jigPn },
      label: entry.jigPn,
      secondary: `Recipe ${entry.recipe} · ${entry.inches.join(' / ')} · ${entry.models.length} 型号`,
      keys: [normalizeKey(entry.jigPn)],
    })
  }

  // Recipe 单独成一类实体：JIG 候选只匹配 P/N，输入 recipe 时由这一类承接，
  // 避免同一个 JIG 在列表里出现两次
  const seenRecipe = new Set<string>()
  for (const entry of index.jigs) {
    const key = normalizeKey(entry.recipe)
    if (seenRecipe.has(key)) continue
    seenRecipe.add(key)
    out.push({
      ref: { type: 'recipe', key: entry.recipe },
      label: entry.recipe,
      secondary: `JIG ${entry.jigPn} · ${entry.inches.join(' / ')} · ${entry.models.length} 型号`,
      keys: [key],
    })
  }

  for (const [id, fspm] of index.fspm) {
    const refs = index.byFspm.get(normalizeKey(id)) ?? []
    const groups = new Set(refs.map(ref => ref.groupId))
    out.push({
      ref: { type: 'fspm', key: fspm.id },
      label: fspm.id,
      secondary: `${fspm.size}" · ${fspm.maker} · ${fspm.material} · ${groups.size} 组引用`,
      keys: [normalizeKey(id)],
    })
  }

  for (const group of index.groups) {
    out.push({
      ref: { type: 'group', key: group.id },
      label: group.id,
      secondary: `${group.inch} · ${group.jigPn} · ${group.models.length} 型号`,
      keys: [normalizeKey(group.id)],
    })
  }

  return out
}

const cache = new WeakMap<LookupIndex, readonly EntityCandidate[]>()

/** 候选表：首次调用时构建，之后按索引实例复用 */
export function entityCandidates(index: LookupIndex): readonly EntityCandidate[] {
  const cached = cache.get(index)
  if (cached) return cached
  const built = buildCandidates(index)
  cache.set(index, built)
  return built
}

/**
 * 查询里的类型前缀：`fspm:P467`、`inch:7748`。
 *
 * 所有实体的键里都不会出现冒号（型号 / JIG / Recipe / FSPM / 组合都没有），
 * 所以只在开头切一次，不会误伤 `31(10)` 这类键。认不出的前缀按普通查询处理。
 */
const TYPE_PREFIX = /^(inch|model|jig|recipe|fspm|group)\s*:\s*(.*)$/i

export interface EntityQuery {
  /** 前缀指定的类型；没写就是 null（搜全部） */
  type: EntityType | null
  /** 去掉前缀后的查询文字 */
  query: string
}

export function parseEntityQuery(input: string): EntityQuery {
  const match = TYPE_PREFIX.exec(input.trim())
  if (!match) return { type: null, query: input }
  return { type: match[1].toLowerCase() as EntityType, query: match[2] }
}

/** INCH 候选额外接受紧凑写法，其余类型只按原键匹配 */
function candidateScore(candidate: EntityCandidate, query: string, compact: string): number {
  const queries =
    candidate.ref.type === 'inch' && compact !== query ? [query, compact] : [query]
  let best = -1
  for (const key of candidate.keys) {
    for (const item of queries) {
      const score = matchScore(key, item)
      if (score >= 0 && (best < 0 || score < best)) best = score
    }
  }
  return best
}

export interface SearchOptions {
  /** 只搜某一类实体；`type:` 前缀优先于它 */
  type?: EntityType
  /** 最多返回多少条，默认 TOTAL_LIMIT */
  limit?: number
}

/**
 * 统一搜索：返回已按「匹配度 → 类型优先级 → 字母序」排好的候选。
 *
 * 排序先看 score 而不是类型：输入完整 JIG P/N 时，`7748G` 的完全匹配
 * 必须排在 INCH 的前缀匹配之前；类型优先级只在同分时决定顺序。
 */
export function searchEntities(
  index: LookupIndex,
  input: string,
  options: SearchOptions = {},
): EntityHit[] {
  const parsed = parseEntityQuery(input)
  const type = parsed.type ?? options.type ?? null
  const limit = options.limit ?? TOTAL_LIMIT

  const q = normalizeKey(parsed.query)
  if (!q) return []
  const compact = compactInchKey(parsed.query)

  const hits: EntityHit[] = []
  for (const candidate of entityCandidates(index)) {
    if (type && candidate.ref.type !== type) continue
    if (candidate.ref.type === 'group' && q.length < GROUP_MIN_QUERY && !q.includes('-')) {
      continue
    }
    const score = candidateScore(candidate, q, compact)
    if (score < 0) continue
    hits.push({ ...candidate, score })
  }

  hits.sort(
    (a, b) =>
      a.score - b.score ||
      TYPE_PRIORITY[a.ref.type] - TYPE_PRIORITY[b.ref.type] ||
      a.label.localeCompare(b.label),
  )

  // 按类型分别截断：某一类命中太多时不能把其它类全挤掉
  const counts = new Map<EntityType, number>()
  const capped: EntityHit[] = []
  for (const hit of hits) {
    const used = counts.get(hit.ref.type) ?? 0
    if (used >= PER_TYPE_LIMIT) continue
    counts.set(hit.ref.type, used + 1)
    capped.push(hit)
    if (capped.length >= limit) break
  }
  return capped
}
