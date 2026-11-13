/**
 * 实体关联：给定一个实体，找出和它有关的所有项。
 *
 * 结果页的所有区块都从这里取数，不在组件里各拼一套：
 * - `groups` 决定「关联组合列表」；
 * - `models` / `jigs` / `recipes` / `inches` 是可点的 chips；
 * - `fspm` 是这些组合用到的全部 FSPM 引用（带 Main / Sub 位置）。
 *
 * FSPM 实体的「自身被引用位置」直接读 `index.byFspm`，不从 `fspm` 字段绕：
 * 对 FSPM 来说，那个字段是「相关组合用到的其它 FSPM」，语义必须与其它实体一致。
 */

import { compactInchKey } from './entities'
import { findJig, findModel } from './indexes'
import type { JigEntry, LookupIndex } from './indexes'
import { normalizeKey } from './normalize'
import type { EntityRef, FspmRef, LookupGroup } from './types'

export interface Relations {
  groups: readonly LookupGroup[]
  models: readonly string[]
  jigs: readonly JigEntry[]
  recipes: readonly string[]
  fspm: readonly FspmRef[]
  inches: readonly string[]
}

/** INCH 支持口语写法：先查原键，再按紧凑键兜底 */
function findInchGroups(index: LookupIndex, key: string): readonly LookupGroup[] {
  const exact = index.byInch.get(normalizeKey(key))
  if (exact) return exact

  const compact = compactInchKey(key)
  if (!compact) return []
  for (const [inch, groups] of index.byInch) {
    if (compactInchKey(inch) === compact) return groups
  }
  return []
}

function resolveGroups(index: LookupIndex, ref: EntityRef): readonly LookupGroup[] {
  switch (ref.type) {
    case 'inch':
      return findInchGroups(index, ref.key)
    case 'model': {
      const group = findModel(index, ref.key)
      return group ? [group] : []
    }
    case 'jig': {
      // findJig 同时认 JIG P/N 与 Recipe，旧深链 `#/lookup/jig/310(10)` 因此仍然有效
      const entry = findJig(index, ref.key)
      return entry?.groups ?? []
    }
    case 'recipe':
      return index.byRecipe.get(normalizeKey(ref.key)) ?? []
    case 'fspm': {
      const refs = index.byFspm.get(normalizeKey(ref.key)) ?? []
      return refs
        .map(item => index.byGroup.get(normalizeKey(item.groupId)))
        .filter((group): group is LookupGroup => Boolean(group))
    }
    case 'group': {
      const group = index.byGroup.get(normalizeKey(ref.key))
      return group ? [group] : []
    }
  }
  return []
}

/** 从一个组合集合里推导出全部关联项，六类实体共用这一段 */
function collect(index: LookupIndex, groups: readonly LookupGroup[]) {
  const jigByPn = new Map<string, JigEntry>(
    index.jigs.map(entry => [normalizeKey(entry.jigPn), entry] as const),
  )

  const models: string[] = []
  const jigs: JigEntry[] = []
  const recipes: string[] = []
  const fspm: FspmRef[] = []
  const inches: string[] = []

  const seenModel = new Set<string>()
  const seenJig = new Set<string>()
  const seenRecipe = new Set<string>()
  const seenInch = new Set<string>()

  for (const group of groups) {
    for (const model of group.models) {
      const key = normalizeKey(model)
      if (seenModel.has(key)) continue
      seenModel.add(key)
      models.push(model)
    }

    const jigKey = normalizeKey(group.jigPn)
    if (!seenJig.has(jigKey)) {
      seenJig.add(jigKey)
      const entry = jigByPn.get(jigKey)
      if (entry) jigs.push(entry)
    }

    if (!seenRecipe.has(group.recipe)) {
      seenRecipe.add(group.recipe)
      recipes.push(group.recipe)
    }

    if (!seenInch.has(group.inch)) {
      seenInch.add(group.inch)
      inches.push(group.inch)
    }

    for (const id of group.mainFspm) {
      fspm.push({ id, groupId: group.id, part: 'main' })
    }
    for (const id of group.subFspm) {
      fspm.push({ id, groupId: group.id, part: 'sub' })
    }
  }

  jigs.sort((a, b) => a.jigPn.localeCompare(b.jigPn))
  recipes.sort((a, b) => a.localeCompare(b))
  inches.sort((a, b) => a.localeCompare(b))
  fspm.sort((a, b) => a.groupId.localeCompare(b.groupId) || a.part.localeCompare(b.part))

  return { models, jigs, recipes, fspm, inches }
}

/**
 * 关联查询的唯一入口。
 *
 * 找不到实体时返回六个空数组，而不是抛错或返回 null —— 结果页可以直接
 * 按「没找到」渲染，不用在每个调用点区分 undefined。
 */
export function relationsOf(index: LookupIndex, ref: EntityRef): Relations {
  // 组合统一按 ID 排序：结果页与单测都拿到稳定顺序，不依赖 byInch 的 JIG 排序
  const groups = [...resolveGroups(index, ref)].sort((a, b) => a.id.localeCompare(b.id))
  return { groups, ...collect(index, groups) }
}
