import { describe, expect, it } from 'vitest'

import { LOOKUP_GROUPS } from '../data/lookupData'
import { changeBadges, compareGroups, describeChange, diffSets } from '../core/diff'

function group(id: string) {
  const found = LOOKUP_GROUPS.find(item => item.id === id)
  if (!found) throw new Error(`测试组合不存在：${id}`)
  return found
}

describe('diffSets', () => {
  it('顺序不同但内容相同 = same', () => {
    expect(diffSets(['P342', 'P405'], ['P405', 'P342'])).toEqual({
      level: 'same',
      added: [],
      removed: [],
    })
  })

  it('有交集但有增删 = partial', () => {
    expect(diffSets(['P342', 'P405', 'P436'], ['P342', 'P436'])).toEqual({
      level: 'partial',
      added: [],
      removed: ['P405'],
    })
  })

  it('无交集 = all', () => {
    expect(diffSets(['P342'], ['P343', 'P437'])).toEqual({
      level: 'all',
      added: ['P343', 'P437'],
      removed: ['P342'],
    })
  })
})

describe('同 INCH 组合对比', () => {
  it('8348B-01 → 8348B-02：JIG/Recipe 不变，主副都部分换', () => {
    const diff = compareGroups(group('8348B-01'), group('8348B-02'))
    expect(diff.jigChanged).toBe(false)
    expect(diff.recipeChanged).toBe(false)
    expect(diff.main.level).toBe('partial')
    expect(diff.main.removed).toEqual(['P405'])
    expect(diff.sub.level).toBe('partial')
    expect(diff.sub.removed).toEqual(['P414', 'P434'])
    expect(changeBadges(group('8348B-01'), group('8348B-02')).map(b => b.text))
      .toEqual(['Recipe 同', 'Main 部分换', 'Sub 部分换'])
  })

  it('8348B-01 → 8348C-01：Recipe 变，Main 全换、Sub 部分换，各一枚徽标', () => {
    const diff = compareGroups(group('8348B-01'), group('8348C-01'))
    expect(diff.jigChanged).toBe(true)
    expect(diff.recipeChanged).toBe(true)
    expect(diff.main.level).toBe('all')
    expect(diff.sub.level).toBe('partial')
    expect(changeBadges(group('8348B-01'), group('8348C-01')).map(b => b.text))
      .toEqual(['Recipe 变', 'Main 全换', 'Sub 部分换'])
  })

  it('7748B-01 → 7748B-02：JIG/Recipe 同，但主副 FSPM 都全换', () => {
    const diff = compareGroups(group('7748B-01'), group('7748B-02'))
    expect(diff.jigChanged).toBe(false)
    expect(diff.recipeChanged).toBe(false)
    expect(diff.main.level).toBe('all')
    expect(diff.sub.level).toBe('all')
    expect(changeBadges(group('7748B-01'), group('7748B-02')).map(b => b.text))
      .toEqual(['Recipe 同', 'Main/Sub 全换'])
    // 全换只留结论，不逐项罗列
    expect(describeChange(group('7748B-01'), group('7748B-02')))
      .toEqual(['Recipe 不变', 'Main 全换', 'Sub 全换'])
  })

  it('同一组合 = 全 same，标签为“当前”', () => {
    const diff = compareGroups(group('8348B-01'), group('8348B-01'))
    expect(diff.main.level).toBe('same')
    expect(diff.sub.level).toBe('same')
    expect(changeBadges(group('8348B-01'), group('8348B-01')).map(b => b.text))
      .toEqual(['当前'])
  })

  it('JIG/Recipe 不变且 FSPM 不变：Main / Sub 各有一枚「不变」徽标', () => {
    const sameJig = group('8348B-01')
    const other = { ...sameJig, id: 'TEST-01' }
    expect(changeBadges(sameJig, other).map(b => b.text))
      .toEqual(['Recipe 同', 'Main 不变', 'Sub 不变'])
  })
})
