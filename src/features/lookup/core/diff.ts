/**
 * 同 INCH 换型对比。
 *
 * 对比的是**组合**，不是型号：同组型号完全等同，换型号不变；
 * 跨组才可能出现「JIG/Recipe 变、主料变、副料变」。
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
  if (level === 'same') return `${noun}不变`
  return level === 'all' ? `${noun}全换` : `${noun}部分换`
}

/** 对比表右侧的标签，最多 2–3 枚 */
export function changeBadges(current: LookupGroup, target: LookupGroup): ChangeBadge[] {
  if (current.id === target.id) {
    return [{ key: 'current', text: '当前', tone: 'neutral' }]
  }

  const diff = compareGroups(current, target)
  const jigChanged = diff.jigChanged || diff.recipeChanged
  const mainChanged = diff.main.level !== 'same'
  const subChanged = diff.sub.level !== 'same'

  if (!jigChanged && !mainChanged && !subChanged) {
    return [{ key: 'same', text: '条件不变', tone: 'neutral' }]
  }

  const badges: ChangeBadge[] = [
    {
      key: 'jig',
      text: jigChanged ? 'Recipe 变' : 'Recipe 同',
      tone: jigChanged ? 'warning' : 'neutral',
    },
  ]

  if (mainChanged && subChanged) {
    badges.push({ key: 'both', text: 'Main/Sub都换', tone: 'warning' })
  } else if (mainChanged) {
    badges.push({ key: 'main', text: levelText(diff.main.level, '主料'), tone: 'warning' })
  } else if (subChanged) {
    badges.push({ key: 'sub', text: levelText(diff.sub.level, '副料'), tone: 'warning' })
  } else {
    badges.push({ key: 'fspm', text: 'FSPM 不变', tone: 'neutral' })
  }

  return badges
}

function formatIds(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join('、') : '—'
}

/** 展开行里的完整说明；一句一块，UI 只负责排版 */
export function describeChange(current: LookupGroup, target: LookupGroup): string[] {
  if (current.id === target.id) return ['当前组合']

  const diff = compareGroups(current, target)
  const lines: string[] = []

  const moved: string[] = []
  if (diff.jigChanged) moved.push(`JIG ${current.jigPn} → ${target.jigPn}`)
  if (diff.recipeChanged) moved.push(`Recipe ${current.recipe} → ${target.recipe}`)
  lines.push(moved.length > 0 ? moved.join('，') : 'Recipe 不变')

  for (const [label, change] of [
    ['主料', diff.main],
    ['副料', diff.sub],
  ] as const) {
    if (change.level === 'same') {
      lines.push(`${label}不变`)
    } else {
      lines.push(
        `${levelText(change.level, label)}（移除 ${formatIds(change.removed)}；新增 ${formatIds(change.added)}）`,
      )
    }
  }

  return lines
}
