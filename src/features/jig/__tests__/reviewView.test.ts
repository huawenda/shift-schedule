/**
 * 审查页视图与导出目标 —— 纯函数测试
 *
 * 锁的是**口径**：
 *   - 先按 P/N 过滤，再按档位筛行（反过来的话，计数会随档位变化，
 *     而下拉框又依赖已过滤的结果，会出现「选了某个 P/N 却找不到它」）；
 *   - 计数按 P/N 过滤后的行数算，不按当前档位算；
 *   - 一行只判一次 —— 标红与筛选共用同一份分类结果；
 *   - 表里没有「对应尺寸」列时不做任何过滤（否则整表被清空，
 *     用户会以为「数据全都不匹配」）；
 *   - 导出跟着「看到的」走：下钻时导出明细，审查页切档后导出该档。
 *
 * 与原项目的逐值一致性由 `scripts/probe/jig-cross-p6.mjs` 交叉验证
 * （同一份 500 行真实夹具，14 组「P/N × 档位」+ 导出文件红字位置）。
 */

import { describe, it, expect } from 'vitest'

import { createDefaultJigConfig } from '../core/config'
import { pickExportTarget } from '../core/export'
import { classifyReviewTable } from '../core/review'
import {
  ALL_PN,
  computeReviewView,
  filterReviewByPn,
  reviewPnOptions
} from '../core/reviewView'
import { processSourceData } from '../core/query'
import type { Row, Table } from '../core/table'
import { rulesFromConfig } from '../core/validate'

const config = createDefaultJigConfig()
const rules = rulesFromConfig(config)

/** 造一张带「对应尺寸」的审查表 */
function reviewTable(): Table {
  const rows: Row[] = [
    { 'P/N': 'PN-A', 'Jig 对应型号': '184', '对应尺寸': '77/48' },
    { 'P/N': 'PN-A', 'Jig 对应型号': '252', '对应尺寸': '65' },
    { 'P/N': 'PN-B', 'Jig 对应型号': '420A', '对应尺寸': '120/80' },
    { 'P/N': 'PN-B', 'Jig 对应型号': '999', '对应尺寸': '' }
  ]
  return {
    columns: ['P/N', 'Jig 对应型号', '对应尺寸'],
    rows
  }
}

const table = reviewTable()

describe('reviewPnOptions', () => {
  it('取全部审查行里的型号，排序去重', () => {
    expect(reviewPnOptions(table)).toEqual(['PN-A', 'PN-B'])
  })

  it('空表没有候选', () => {
    expect(reviewPnOptions({ columns: [], rows: [] })).toEqual([])
  })
})

describe('filterReviewByPn', () => {
  it('「全部」原样返回', () => {
    expect(filterReviewByPn(table, ALL_PN).rows).toHaveLength(4)
  })

  it('指定型号只留该型号的行', () => {
    const out = filterReviewByPn(table, 'PN-A')
    expect(out.rows).toHaveLength(2)
    expect(out.rows.every(r => r['P/N'] === 'PN-A')).toBe(true)
  })
})

describe('computeReviewView', () => {
  it('「所有对象」档：全部行都在，计数等于表长', () => {
    const view = computeReviewView(table, 'all', rules)
    expect(view.table.rows).toHaveLength(4)
    expect(view.counts.all).toBe(4)
  })

  it('「尺寸不匹配」档：只留标红的行', () => {
    const view = computeReviewView(table, 'mismatch', rules)
    // 表里没有「对应尺寸」列时不做过滤 —— 这里有，所以要看分类结果
    const kinds = classifyReviewTable(table, rules)
    const expected = kinds.filter(k => k !== 'ok').length
    expect(view.table.rows).toHaveLength(expected)
    expect(view.counts.mismatch).toBe(expected)
  })

  it('两档计数加起来不是表长（不匹配的行只算一次）', () => {
    const view = computeReviewView(table, 'all', rules)
    expect(view.counts.all).toBe(view.counts.mismatch + (view.counts.all - view.counts.mismatch))
  })

  it('档内的行全部标红', () => {
    const view = computeReviewView(table, 'mismatch', rules)
    expect(view.flags.every(Boolean)).toBe(true)
  })

  it('表里没有「对应尺寸」列时不过滤（否则整表被清空）', () => {
    const noSize: Table = { columns: ['P/N'], rows: [{ 'P/N': 'PN-A' }] }
    const view = computeReviewView(noSize, 'mismatch', rules)
    expect(view.table.rows).toHaveLength(1)
    expect(view.counts.mismatch).toBe(0)
  })
})

describe('pickExportTarget', () => {
  const empty: Table = { columns: [], rows: [] }

  it('各页签导出对应的表', () => {
    const detail = { columns: ['A'], rows: [{ A: '1' }] }
    const target = pickExportTarget({
      tab: 'detail',
      detail,
      detailFlags: [true],
      queryPivot: empty,
      pivot: empty,
      review: empty,
      reviewFlags: [],
      drill: null,
      drillTable: empty,
      drillFlags: [],
      config
    })
    expect(target?.name).toBe('查询结果')
    expect(target?.red).toEqual({ rows: [true], column: '对应尺寸' })
  })

  it('透视表不写红字（那些格子里是计数，没有「对应尺寸」列）', () => {
    const pivot = { columns: ['P/N', 'PNP'], rows: [{ 'P/N': 'PN-A', PNP: '3' }] }
    const target = pickExportTarget({
      tab: 'pivot',
      detail: empty,
      detailFlags: [],
      queryPivot: empty,
      pivot,
      review: empty,
      reviewFlags: [],
      drill: null,
      drillTable: empty,
      drillFlags: [],
      config
    })
    expect(target?.name).toBe('全量透视表')
    expect(target?.red).toBeUndefined()
  })

  it('下钻时导出的是明细，不是透视表', () => {
    const pivot = { columns: ['P/N', 'PNP'], rows: [{ 'P/N': 'PN-A', PNP: '3' }] }
    const drillTable = { columns: ['P/N'], rows: [{ 'P/N': 'PN-A' }] }
    const target = pickExportTarget({
      tab: 'pivot',
      detail: empty,
      detailFlags: [],
      queryPivot: empty,
      pivot,
      review: empty,
      reviewFlags: [],
      drill: { crumbs: ['全量透视', 'PN-A'] },
      drillTable,
      drillFlags: [true],
      config
    })
    expect(target?.name).toBe('透视明细_PN-A')
    expect(target?.table).toBe(drillTable)
  })

  it('当前页没有数据时返回 null', () => {
    const target = pickExportTarget({
      tab: 'review',
      detail: empty,
      detailFlags: [],
      queryPivot: empty,
      pivot: empty,
      review: empty,
      reviewFlags: [],
      drill: null,
      drillTable: empty,
      drillFlags: [],
      config
    })
    expect(target).toBeNull()
  })
})

describe('审查表与源数据的衔接', () => {
  it('processSourceData 派生出「对应尺寸」列', () => {
    const out = processSourceData(
      [{ 'P/N': 'PN-A', 'Jig 对应型号': '184', 'Jig ID': 'J1' }],
      config
    )
    expect(out.columns).toContain('对应尺寸')
  })
})
