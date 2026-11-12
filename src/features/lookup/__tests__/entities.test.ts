import { describe, expect, it } from 'vitest'

import { FSPM_TABLE, LOOKUP_GROUPS } from '../data/lookupData'
import { buildLookupIndex } from '../core/indexes'
import {
  PER_TYPE_LIMIT,
  TOTAL_LIMIT,
  compactInchKey,
  entityCandidates,
  parseEntityQuery,
  searchEntities,
} from '../core/entities'
import type { EntityType } from '../core/types'

const index = buildLookupIndex(LOOKUP_GROUPS, FSPM_TABLE)
const candidates = entityCandidates(index)
const countOf = (type: EntityType) => candidates.filter(c => c.ref.type === type).length

describe('INCH 紧凑键', () => {
  it('口语、连字符、空格、全角都归一到同一键', () => {
    expect(compactInchKey('77/48')).toBe('7748')
    expect(compactInchKey('77-48')).toBe('7748')
    expect(compactInchKey('77 48')).toBe('7748')
    expect(compactInchKey('７７／４８')).toBe('7748')
    expect(compactInchKey('7748')).toBe('7748')
  })

  it('不用于 Recipe：31(10) 的紧凑形式与 INCH 不撞', () => {
    expect(compactInchKey('31(10)')).toBe('3110')
    expect(candidates.some(c => c.ref.type === 'inch' && c.keys.includes('3110'))).toBe(false)
  })
})

describe('实体候选', () => {
  it('覆盖六类实体的全部条目', () => {
    expect(countOf('inch')).toBe(6)
    expect(countOf('model')).toBe(110)
    expect(countOf('jig')).toBe(24)
    expect(countOf('recipe')).toBe(24)
    expect(countOf('fspm')).toBe(92)
    expect(countOf('group')).toBe(48)
  })

  it('候选表按索引实例缓存', () => {
    expect(entityCandidates(index)).toBe(candidates)
  })

  it('FSPM 候选带被引用组数', () => {
    const p467 = candidates.find(c => c.ref.type === 'fspm' && c.ref.key === 'P467')
    expect(p467?.secondary).toContain('5 组引用')
  })
})

describe('command 搜索', () => {
  it('7748 的首项是 INCH 77/48', () => {
    const hits = searchEntities(index, '7748')
    expect(hits[0]?.ref).toEqual({ type: 'inch', key: '77/48' })
  })

  it('7748 并列给出 7748B~G 六个 JIG 候选', () => {
    const jigs = searchEntities(index, '7748')
      .filter(hit => hit.ref.type === 'jig')
      .map(hit => hit.ref.key)
      .sort()
    expect(jigs).toEqual(['7748B', '7748C', '7748D', '7748E', '7748F', '7748G'])
  })

  it('7748 不把组合 ID 塞进候选，7748G 才出现', () => {
    expect(searchEntities(index, '7748').some(hit => hit.ref.type === 'group')).toBe(false)
    expect(searchEntities(index, '7748G').some(hit => hit.ref.type === 'group')).toBe(true)
  })

  it('完整 JIG P/N 的完全匹配排在 INCH 之前', () => {
    const hits = searchEntities(index, '7748G')
    expect(hits[0]?.ref).toEqual({ type: 'jig', key: '7748G' })
  })

  it('Recipe 走完整键，能命中 recipe 实体', () => {
    const hits = searchEntities(index, '31(10)')
    expect(hits.some(hit => hit.ref.type === 'recipe' && hit.ref.key === '31(10)')).toBe(true)
  })

  it('型号完全匹配排最前', () => {
    expect(searchEntities(index, 'fy')[0]?.ref).toEqual({ type: 'model', key: 'FY' })
  })

  it('每类最多 6 条、总数最多 18 条', () => {
    const hits = searchEntities(index, '7')
    expect(hits.length).toBeLessThanOrEqual(TOTAL_LIMIT)
    for (const type of ['inch', 'model', 'jig', 'recipe', 'fspm', 'group'] as EntityType[]) {
      expect(hits.filter(hit => hit.ref.type === type).length).toBeLessThanOrEqual(PER_TYPE_LIMIT)
    }
  })

  it('空查询返回空', () => {
    expect(searchEntities(index, '')).toEqual([])
    expect(searchEntities(index, '   ')).toEqual([])
  })
})

describe('类型前缀', () => {
  it('解析前缀与查询文字', () => {
    expect(parseEntityQuery('fspm:P467')).toEqual({ type: 'fspm', query: 'P467' })
    expect(parseEntityQuery('inch : 7748')).toEqual({ type: 'inch', query: '7748' })
    expect(parseEntityQuery('FY')).toEqual({ type: null, query: 'FY' })
    expect(parseEntityQuery('foo:bar')).toEqual({ type: null, query: 'foo:bar' })
  })

  it('只返回前缀指定的类型', () => {
    const hits = searchEntities(index, 'fspm:P467')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.ref).toEqual({ type: 'fspm', key: 'P467' })
  })

  it('前缀让 7748 只落到 INCH，不掺 JIG', () => {
    const hits = searchEntities(index, 'inch:7748')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.ref).toEqual({ type: 'inch', key: '77/48' })
  })

  it('前缀后的小写键也能命中', () => {
    expect(searchEntities(index, 'model:fy')[0]?.ref).toEqual({ type: 'model', key: 'FY' })
  })

  it('前缀 + 空查询返回空', () => {
    expect(searchEntities(index, 'fspm:')).toEqual([])
  })
})
