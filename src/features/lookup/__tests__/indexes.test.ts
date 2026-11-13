import { describe, expect, it } from 'vitest'

import { FSPM_TABLE, LOOKUP_GROUPS } from '../data/lookupData'
import {
  buildLookupIndex,
  findJig,
  findModel,
  sameInchGroups,
  searchJigs,
  searchModels,
} from '../core/indexes'
import { normalizeKey } from '../core/normalize'

const index = buildLookupIndex(LOOKUP_GROUPS, FSPM_TABLE)

describe('查询键归一化', () => {
  it('全角、空格、大小写都收成同一键', () => {
    expect(normalizeKey('ｆｙ')).toBe('FY')
    expect(normalizeKey(' 7748 g ')).toBe('7748G')
    expect(normalizeKey('310（10）')).toBe('310(10)')
  })
})

describe('索引', () => {
  it('同 INCH 77/48 有 12 组，按 JIG P/N 升序', () => {
    const groups = sameInchGroups(index, '77/48')
    expect(groups).toHaveLength(12)
    const jigs = groups.map(g => g.jigPn)
    expect(jigs).toEqual([...jigs].sort((a, b) => a.localeCompare(b)))
  })

  it('未知型号 / JIG 返回空', () => {
    expect(findModel(index, 'NOPE')).toBeUndefined()
    expect(findJig(index, 'NOPE')).toBeUndefined()
    expect(searchModels(index, 'NOPE')).toEqual([])
    expect(searchJigs(index, 'NOPE')).toEqual([])
  })

  it('型号搜索：完全匹配排最前', () => {
    const hits = searchModels(index, 'fy')
    expect(hits[0]?.model).toBe('FY')
    expect(hits[0]?.group.id).toBe('7748G-01')
  })

  it('JIG 搜索：JIG P/N 与 Recipe 都能命中', () => {
    expect(searchJigs(index, '7748g')[0]?.jigPn).toBe('7748G')
    expect(searchJigs(index, '310(10)')[0]?.jigPn).toBe('7748G')
    expect(findJig(index, '310（10）')?.jigPn).toBe('7748G')
  })

  it('byFspm 覆盖 92 个 FSPM，引用位置与组合数据一致', () => {
    expect(index.byFspm.size).toBe(92)
    for (const group of LOOKUP_GROUPS) {
      for (const id of group.mainFspm) {
        expect(index.byFspm.get(id), `${id} 缺少 Main 引用`).toContainEqual({
          id,
          groupId: group.id,
          part: 'main',
        })
      }
      for (const id of group.subFspm) {
        expect(index.byFspm.get(id), `${id} 缺少 Sub 引用`).toContainEqual({
          id,
          groupId: group.id,
          part: 'sub',
        })
      }
    }
  })

  it('byGroup 覆盖 48 个组合', () => {
    expect(index.byGroup.size).toBe(48)
    expect(index.byGroup.get('7748G-01')?.models).toHaveLength(6)
  })
})
