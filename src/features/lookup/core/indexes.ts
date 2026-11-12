/**
 * 速查索引：启动时建一次，之后所有查询都走 Map。
 *
 * 数据量很小（48 组 / 110 型号），不做防抖、不做虚拟滚动；
 * 但也别在渲染里反复线性扫 —— 索引建好后查询都是常数级。
 */

import { normalizeKey } from './normalize'
import type { Fspm, LookupGroup } from './types'

/** 一个 JIG 生产条件下的全部组合（同一 JIG 可能对应多个型号组） */
export interface JigEntry {
  jigPn: string
  recipe: string
  groups: readonly LookupGroup[]
  models: readonly string[]
  inches: readonly string[]
}

export interface LookupIndex {
  groups: readonly LookupGroup[]
  fspm: ReadonlyMap<string, Fspm>
  /** 型号（归一化）→ 唯一组合 */
  byModel: ReadonlyMap<string, LookupGroup>
  /** JIG P/N（归一化）→ 组合 */
  byJig: ReadonlyMap<string, readonly LookupGroup[]>
  /** Recipe（归一化）→ 组合 */
  byRecipe: ReadonlyMap<string, readonly LookupGroup[]>
  /** 英寸组合 → 同 INCH 的全部组合 */
  byInch: ReadonlyMap<string, readonly LookupGroup[]>
  /** 按 JIG P/N 聚合的入口，供反向查询 */
  jigs: readonly JigEntry[]
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const byId = (a: LookupGroup, b: LookupGroup) => a.id.localeCompare(b.id)

export function buildLookupIndex(
  groups: readonly LookupGroup[],
  fspmTable: Readonly<Record<string, Fspm>>,
): LookupIndex {
  const byModel = new Map<string, LookupGroup>()
  const byJig = new Map<string, LookupGroup[]>()
  const byRecipe = new Map<string, LookupGroup[]>()
  const byInch = new Map<string, LookupGroup[]>()

  for (const group of groups) {
    for (const model of group.models) {
      const key = normalizeKey(model)
      if (!key) continue
      // 生成脚本已断言型号唯一；这里兜底只留第一条，避免脏数据让整个页面打不开
      if (!byModel.has(key)) byModel.set(key, group)
    }
    push(byJig, normalizeKey(group.jigPn), group)
    push(byRecipe, normalizeKey(group.recipe), group)
    push(byInch, group.inch, group)
  }

  for (const list of byJig.values()) list.sort(byId)
  for (const list of byRecipe.values()) list.sort(byId)
  for (const list of byInch.values()) {
    list.sort((a, b) => a.jigPn.localeCompare(b.jigPn) || a.id.localeCompare(b.id))
  }

  const jigMap = new Map<
    string,
    { jigPn: string; recipe: string; groups: LookupGroup[]; models: string[]; inches: string[] }
  >()
  for (const group of groups) {
    const key = normalizeKey(group.jigPn)
    let entry = jigMap.get(key)
    if (!entry) {
      entry = {
        jigPn: group.jigPn,
        recipe: group.recipe,
        groups: [],
        models: [],
        inches: [],
      }
      jigMap.set(key, entry)
    }
    entry.groups.push(group)
    for (const model of group.models) {
      if (!entry.models.includes(model)) entry.models.push(model)
    }
    if (!entry.inches.includes(group.inch)) entry.inches.push(group.inch)
  }

  const jigs: JigEntry[] = [...jigMap.values()]
    .map(entry => ({ ...entry, groups: [...entry.groups].sort(byId) }))
    .sort((a, b) => a.jigPn.localeCompare(b.jigPn))

  return {
    groups,
    fspm: new Map(Object.entries(fspmTable)),
    byModel,
    byJig,
    byRecipe,
    byInch,
    jigs,
  }
}

export function findModel(index: LookupIndex, key: string): LookupGroup | undefined {
  return index.byModel.get(normalizeKey(key))
}

export function findJig(index: LookupIndex, key: string): JigEntry | undefined {
  const q = normalizeKey(key)
  return index.jigs.find(
    jig => normalizeKey(jig.jigPn) === q || normalizeKey(jig.recipe) === q,
  )
}

/** 0 = 完全相等，1 = 前缀，2 = 包含，-1 = 不匹配 */
function scoreOf(value: string, query: string): number {
  if (value === query) return 0
  if (value.startsWith(query)) return 1
  if (value.includes(query)) return 2
  return -1
}

export interface ModelHit {
  model: string
  group: LookupGroup
}

/** 型号建议：完全相等 > 前缀 > 子串；同分按字母序 */
export function searchModels(
  index: LookupIndex,
  query: string,
  limit = 8,
): ModelHit[] {
  const q = normalizeKey(query)
  if (!q) return []
  const hits: Array<{ hit: ModelHit; score: number }> = []
  for (const [model, group] of index.byModel) {
    const score = scoreOf(model, q)
    if (score < 0) continue
    hits.push({ hit: { model, group }, score })
  }
  return hits
    .sort((a, b) => a.score - b.score || a.hit.model.localeCompare(b.hit.model))
    .slice(0, limit)
    .map(item => item.hit)
}

/** JIG / Recipe 建议：JIG P/N 与 Recipe 任一命中即可 */
export function searchJigs(
  index: LookupIndex,
  query: string,
  limit = 8,
): JigEntry[] {
  const q = normalizeKey(query)
  if (!q) return []
  const hits: Array<{ entry: JigEntry; score: number }> = []
  for (const entry of index.jigs) {
    const scores = [
      scoreOf(normalizeKey(entry.jigPn), q),
      scoreOf(normalizeKey(entry.recipe), q),
    ].filter(score => score >= 0)
    if (scores.length === 0) continue
    hits.push({ entry, score: Math.min(...scores) })
  }
  return hits
    .sort((a, b) => a.score - b.score || a.entry.jigPn.localeCompare(b.entry.jigPn))
    .slice(0, limit)
    .map(item => item.entry)
}

/** 同 INCH 的全部组合；找不到时返回空数组 */
export function sameInchGroups(index: LookupIndex, inch: string): readonly LookupGroup[] {
  return index.byInch.get(inch) ?? []
}
