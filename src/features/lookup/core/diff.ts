/**
 * 同 INCH 换型对比。
 *
 * 对比的是**组合**，不是型号：同组型号完全等同，换型号不变；
 * 跨组才可能出现「Recipe 变、Main 变、Sub 变」。
 */

import type { LookupGroup } from './types'

export type ChangeLevel = 'same' | 'partial' | 'all'

export interface SetChange {
  level: ChangeLevel
  /** 目标有、当前没有 */
  added: string[]
  /** 当前有、目标没有 */
  removed: string[]
}

export interface GroupDiff {
  jigChanged: boolean
  recipeChanged: boolean
  main: SetChange
  sub: SetChange
}

export interface ChangeBadge {
  key: string
  text: string
  tone: 'neutral' | 'warning'
}

/** 集合对比：有交集但有增删 = partial，完全无交集 = all */
export function diffSets(
  current: readonly string[],
  target: readonly string[],
): SetChange {
  const cur = new Set(current)
  const tgt = new Set(target)
  const added = target.filter(id => !cur.has(id))
  const removed = current.filter(id => !tgt.has(id))
  const level: ChangeLevel =
    added.length === 0 && removed.length === 0
      ? 'same'
      : target.some(id => cur.has(id))
        ? 'partial'
        : 'all'
  return { level, added, removed }
}

export function compareGroups(current: LookupGroup, target: LookupGroup): GroupDiff {
  return {
    jigChanged: current.jigPn !== target.jigPn,
    recipeChanged: current.recipe !== target.recipe,
    main: diffSets(current.mainFspm, target.mainFspm),
    sub: diffSets(current.subFspm, target.subFspm),
  }
}

function levelText(level: ChangeLevel, noun: string): string {
  if (level === 'same') return `${noun} 不变`
  return level === 'all' ? `${noun} 全换` : `${noun} 部分换`
}

/**
 * 对比表右侧的标签。
 *
 * 只把「Main 与 Sub 都全换」合并成 `Main/Sub 全换`；其余情况 Main / Sub 各一枚，
 * 保证每一枚都带明确等级，不会分不出部分换还是全换、也分不出是谁换。
 */
export function changeBadges(current: LookupGroup, target: LookupGroup): ChangeBadge[] {
  if (current.id === target.id) {
    return [{ key: 'current', text: '当前', tone: 'neutral' }]
  }

  const diff = compareGroups(current, target)
  const jigChanged = diff.jigChanged || diff.recipeChanged

  const badges: ChangeBadge[] = [
    {
      key: 'jig',
      text: jigChanged ? 'Recipe 变' : 'Recipe 同',
      tone: jigChanged ? 'warning' : 'neutral',
    },
  ]

  if (diff.main.level === 'all' && diff.sub.level === 'all') {
    badges.push({ key: 'both', text: 'Main/Sub 全换', tone: 'warning' })
    return badges
  }

  for (const [key, noun, change] of [
    ['main', 'Main', diff.main],
    ['sub', 'Sub', diff.sub],
  ] as const) {
    badges.push({
      key,
      text: levelText(change.level, noun),
      tone: change.level === 'same' ? 'neutral' : 'warning',
    })
  }

  return badges
}

/** 展开行里的完整说明；一句一块，UI 只负责排版 */
export function describeChange(current: LookupGroup, target: LookupGroup): string[] {
  if (current.id === target.id) return ['当前组合']

  const diff = compareGroups(current, target)
  const lines: string[] = []

  const moved: string[] = []
  if (diff.jigChanged) moved.push(`${current.jigPn} → ${target.jigPn}`)
  if (diff.recipeChanged) moved.push(`${current.recipe} → ${target.recipe}`)
  lines.push(moved.length > 0 ? moved.join('，') : 'Recipe 不变')

  for (const [label, change] of [
    ['Main', diff.main],
    ['Sub', diff.sub],
  ] as const) {
    // 全换是整套替换，逐项罗列没有意义，只留结论
    if (change.level !== 'partial') {
      lines.push(levelText(change.level, label))
      continue
    }
    const removed = change.removed.length > 0
      ? `移除 ${change.removed.join('、')}`
      : '移除 —'
    const added = change.added.length > 0
      ? `新增 ${change.added.join('、')}`
      : '无新增'
    lines.push(`${levelText(change.level, label)}（${removed}；${added}）`)
  }

  return lines
}
