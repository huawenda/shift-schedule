import { describe, expect, it } from 'vitest'

import { FSPM_TABLE, LOOKUP_DATA_VERSION, LOOKUP_GROUPS } from '../data/lookupData'
import { buildLookupIndex } from '../core/indexes'

const index = buildLookupIndex(LOOKUP_GROUPS, FSPM_TABLE)

describe('速查数据完整性', () => {
  it('48 组 / 110 型号 / 92 个 FSPM', () => {
    expect(LOOKUP_GROUPS).toHaveLength(48)
    expect(index.byModel.size).toBe(110)
    expect(index.fspm.size).toBe(92)
    expect(LOOKUP_DATA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('型号 FY 落在 7748G-01，且同组 6 个型号', () => {
    const group = index.byModel.get('FY')
    expect(group?.id).toBe('7748G-01')
    expect(group?.models).toEqual(['CP', 'FS', 'FZ', 'FT', 'CU', 'FY'])
  })

  it('CR 落在新增的 7742D-03；7742C-04 为 CQ / RD', () => {
    expect(index.byModel.get('CR')?.id).toBe('7742D-03')
    expect(index.byModel.get('CQ')?.id).toBe('7742C-04')
    expect(index.byModel.get('RD')?.id).toBe('7742C-04')
    expect(index.byJig.get('7742D')).toHaveLength(3)
  })

  it('7748B 有 3 个组合', () => {
    expect(index.byJig.get('7748B')).toHaveLength(3)
  })

  it('Recipe 与 JIG P/N 一一对应', () => {
    expect(index.byRecipe.get('31(10)')?.map(g => g.id))
      .toEqual(index.byJig.get('7748G')?.map(g => g.id))
    const recipes = new Set(LOOKUP_GROUPS.map(g => g.recipe))
    const jigs = new Set(LOOKUP_GROUPS.map(g => g.jigPn))
    expect(recipes.size).toBe(24)
    expect(jigs.size).toBe(24)
  })

  it('每个组合的主/副 FSPM 都存在，且尺寸与主副尺寸一致', () => {
    for (const group of LOOKUP_GROUPS) {
      expect(group.mainFspm.length).toBeGreaterThan(0)
      expect(group.subFspm.length).toBeGreaterThan(0)
      for (const id of group.mainFspm) {
        expect(FSPM_TABLE[id], `${group.id} 缺少 ${id}`).toBeDefined()
        expect(FSPM_TABLE[id].size).toBe(group.mainSize)
      }
      for (const id of group.subFspm) {
        expect(FSPM_TABLE[id], `${group.id} 缺少 ${id}`).toBeDefined()
        expect(FSPM_TABLE[id].size).toBe(group.subSize)
      }
    }
  })
})
