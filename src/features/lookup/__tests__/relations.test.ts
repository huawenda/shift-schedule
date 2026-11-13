import { describe, expect, it } from 'vitest'

import { FSPM_TABLE, LOOKUP_GROUPS } from '../data/lookupData'
import { buildLookupIndex } from '../core/indexes'
import { relationsOf } from '../core/relations'

const index = buildLookupIndex(LOOKUP_GROUPS, FSPM_TABLE)

describe('关联查询', () => {
  it('型号 FY：7748G-01、同组 6 个型号、INCH 77/48', () => {
    const rel = relationsOf(index, { type: 'model', key: 'FY' })
    expect(rel.groups.map(group => group.id)).toEqual(['7748G-01'])
    expect(rel.models).toEqual(['CP', 'FS', 'FZ', 'FT', 'CU', 'FY'])
    expect(rel.jigs.map(entry => entry.jigPn)).toEqual(['7748G'])
    expect(rel.recipes).toEqual(['310(10)'])
    expect(rel.inches).toEqual(['77/48'])
  })

  it('INCH 7748（口语写法）：12 组 / 6 个 JIG', () => {
    const rel = relationsOf(index, { type: 'inch', key: '7748' })
    expect(rel.groups).toHaveLength(12)
    expect(rel.jigs.map(entry => entry.jigPn).sort()).toEqual([
      '7748B',
      '7748C',
      '7748D',
      '7748E',
      '7748F',
      '7748G',
    ])
    expect(rel.inches).toEqual(['77/48'])
  })

  it('INCH 的连字符写法与斜杠写法等价', () => {
    const dashed = relationsOf(index, { type: 'inch', key: '77-48' })
    const slash = relationsOf(index, { type: 'inch', key: '77/48' })
    expect(dashed.groups.map(group => group.id)).toEqual(slash.groups.map(group => group.id))
  })

  it('FSPM P467 被 5 个组合的 Main 引用', () => {
    const rel = relationsOf(index, { type: 'fspm', key: 'P467' })
    expect(rel.groups).toHaveLength(5)
    expect(rel.groups.map(group => group.id)).toContain('7727C-02')
    expect(index.byFspm.get('P467')).toContainEqual({
      id: 'P467',
      groupId: '7742C-01',
      part: 'main',
    })
  })

  it('FSPM P526 只在 3931C-01 的 Main 出现', () => {
    const rel = relationsOf(index, { type: 'fspm', key: 'P526' })
    expect(rel.groups.map(group => group.id)).toEqual(['3931C-01'])
    expect(index.byFspm.get('P526')).toEqual([
      { id: 'P526', groupId: '3931C-01', part: 'main' },
    ])
  })

  it('JIG 7748B 有 3 个组合', () => {
    const rel = relationsOf(index, { type: 'jig', key: '7748B' })
    expect(rel.groups).toHaveLength(3)
    expect(rel.inches).toEqual(['77/48'])
  })

  it('Recipe 310(10) 与 JIG 7748G 指向同一组', () => {
    const byRecipe = relationsOf(index, { type: 'recipe', key: '310(10)' })
    const byJig = relationsOf(index, { type: 'jig', key: '7748G' })
    expect(byRecipe.groups.map(group => group.id)).toEqual(byJig.groups.map(group => group.id))
  })

  it('组合 7748G-01 是单组详情', () => {
    const rel = relationsOf(index, { type: 'group', key: '7748G-01' })
    expect(rel.groups.map(group => group.id)).toEqual(['7748G-01'])
    expect(rel.models).toHaveLength(6)
  })

  it('未知实体返回六个空数组', () => {
    const rel = relationsOf(index, { type: 'model', key: 'NOPE' })
    expect(rel).toEqual({ groups: [], models: [], jigs: [], recipes: [], fspm: [], inches: [] })
  })

  it('92 个 FSPM 都能反查到组合', () => {
    for (const id of Object.keys(FSPM_TABLE)) {
      const rel = relationsOf(index, { type: 'fspm', key: id })
      expect(rel.groups.length, `${id} 没有关联组合`).toBeGreaterThan(0)
    }
  })
})
