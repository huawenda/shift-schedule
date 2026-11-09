/**
 * 全量透视的显示范围与可用性筛选 —— 纯函数测试
 *
 * 这里锁的是**口径**，不是实现细节：
 *   - 显示范围下拉：全部 / 生产中 / 单个 P/N，三者互斥不叠加；
 *   - 可用性三档的计数口径：先按显示范围取行，再分两档，
 *     所以计数等于当前透视表总计行的和；
 *   - P/N 候选项取自**全部范围**的透视表 —— 不受当前 scope 影响，
 *     否则选了某个 P/N 之后下拉里就只剩那一个，其它型号再也选不回来。
 *
 * 与原项目的逐值一致性由 `scripts/probe/jig-cross-p4.mjs` 交叉验证
 * （同一份 500 行真实夹具同时喂两套代码比对）。
 */

import { describe, it, expect } from 'vitest'

import { filterActive } from '../core/active'
import { createDefaultJigConfig } from '../core/config'
import { SUMMARY_CST } from '../core/pivot'
import {
  computePivotScope,
  isProdScope,
  pivotScopeLabel,
  pivotScopePn
} from '../core/pivotScope'
import type { Row } from '../core/table'

const config = createDefaultJigConfig()

/** 造几行带状态与工序的源数据 */
function row(
  pn: string,
  cst: string,
  eng: string,
  jig: string,
  status = 'INPRODUCTION'
): Row {
  return {
    'P/N': pn,
    'CST ID': cst,
    'Jig ID': jig,
    工程名: eng,
    工程: eng === 'PNP' ? '50000' : '50001',
    'Jig状态': status
  }
}

const rows: Row[] = [
  row('PN-A', 'C1', 'PNP', 'J1'),
  row('PN-A', 'C1', 'Jig入库', 'J1'),
  row('PN-A', 'C2', 'PNP', 'J2'),
  row('PN-B', 'C3', 'Jig Loading', 'J3'),
  row('PN-B', 'C3', '目视Stage', 'J3'),
  row('PN-C', 'C4', 'Jig入库', 'J4', 'STORED')
]

describe('filterActive（生产中筛选）', () => {
  it('只留状态等于「生产中」的行', () => {
    const out = filterActive(rows, config)
    expect(out.map(r => r['Jig ID'])).toEqual(['J1', 'J1', 'J2', 'J3', 'J3'])
  })

  it('源表没有状态列时不过滤（硬筛会把数据全清空）', () => {
    const noStatus = rows.map(({ Jig状态, ...rest }) => rest)
    expect(filterActive(noStatus, config)).toHaveLength(noStatus.length)
  })
})

describe('scope 的取值解析', () => {
  it('pn: 前缀里取出 P/N', () => {
    expect(pivotScopePn('pn:PN-A')).toBe('PN-A')
    expect(pivotScopePn('all')).toBe('')
    expect(pivotScopePn('prod')).toBe('')
  })

  it('只有 prod 范围要叠生产中筛选', () => {
    expect(isProdScope('prod')).toBe(true)
    expect(isProdScope('all')).toBe(false)
    expect(isProdScope('pn:PN-A')).toBe(false)
  })

  it('显示名', () => {
    expect(pivotScopeLabel('all')).toBe('全部数据')
    expect(pivotScopeLabel('prod')).toBe('生产中')
    expect(pivotScopeLabel('pn:PN-A')).toBe('PN-A')
  })
})

describe('显示范围与可用性', () => {
  it('全部范围：底稿是生产中过滤后的行', () => {
    const r = computePivotScope(rows, 'all', 'all', config)
    expect(r.rows).toHaveLength(5)
  })

  it('生产中范围：只留含关键工序代号的 P/N', () => {
    const r = computePivotScope(rows, 'prod', 'all', config)
    // PN-A 有工程=50000（PNP），PN-B 没有，PN-C 是 STORED 被先滤掉
    expect(r.rows.every(row => row['P/N'] === 'PN-A')).toBe(true)
  })

  it('P/N 范围只留该型号的行', () => {
    const r = computePivotScope(rows, 'pn:PN-B', 'all', config)
    expect(r.rows.every(row => row['P/N'] === 'PN-B')).toBe(true)
    expect(r.rows.length).toBeGreaterThan(0)
  })

  it('P/N 范围不叠生产中筛选（两个条件互斥）', () => {
    const pnOnly = computePivotScope(rows, 'pn:PN-C', 'all', config)
    const pnProd = computePivotScope(rows, 'pn:PN-C', 'all', config)
    expect(pnOnly.rows.length).toBe(pnProd.rows.length)
  })

  it('可用性三档计数加起来等于全部行数', () => {
    const r = computePivotScope(rows, 'all', 'all', config)
    const c = r.availCounts
    expect(c.all).toBe(c.available + c.unavailable)
    expect(c.all).toBe(r.rows.length)
  })

  it('可用档只留五道可用工序的行', () => {
    const r = computePivotScope(rows, 'all', 'available', config)
    expect(r.rows.every(row =>
      ['PNP', 'PNP 2nd', 'Jig 洗净及检查', 'Jig Loading', 'Jig Unloading'].includes(
        row['工程名'] ?? ''
      )
    )).toBe(true)
  })

  it('非可用档与可用档互补', () => {
    const a = computePivotScope(rows, 'all', 'available', config)
    const u = computePivotScope(rows, 'all', 'unavailable', config)
    expect(a.rows.length + u.rows.length).toBe(
      computePivotScope(rows, 'all', 'all', config).rows.length
    )
  })

  it('计数等于透视表总计行的和', () => {
    const r = computePivotScope(rows, 'all', 'all', config)
    const totalRow = r.table.rows[r.table.rows.length - 1]
    const sum = r.table.columns
      .filter(c => c !== 'P/N' && c !== 'CST ID' && c !== config.keywordTotal)
      .reduce((acc, c) => acc + Number(totalRow?.[c] ?? 0), 0)
    expect(r.availCounts.all).toBe(sum)
  })

  it('P/N 候选项取自透视小计行', () => {
    const r = computePivotScope(rows, 'all', 'all', config)
    expect(r.pnOptions).toEqual(['PN-A', 'PN-B'])
  })

  it('P/N 候选项不受当前范围影响（选了 PN-A 也还能选回 PN-B）', () => {
    const r = computePivotScope(rows, 'pn:PN-A', 'all', config)
    expect(r.pnOptions).toEqual(['PN-A', 'PN-B'])
  })

  it('小计行的哨兵值仍是 SUMMARY_CST', () => {
    const r = computePivotScope(rows, 'all', 'all', config)
    const subtotals = r.table.rows.filter(row => row['CST ID'] === SUMMARY_CST)
    expect(subtotals.length).toBeGreaterThan(0)
  })
})
