/**
 * 下钻定位 —— 纯函数测试
 *
 * 锁的是**口径**：
 *   - 透视表里明细行的 P/N 是空串（视觉上属于上方小计行），总计行写「总计」，
 *     两者都不能直接当筛选条件用 —— 必须沿小计行上溯还原成真实型号；
 *   - 小计行与总计行代表整个分组，不下钻到单个 CST；
 *   - 点「总计」列对应「全部工序」；
 *   - 面包屑路径与原项目一致。
 *
 * 与原项目的逐值一致性由 `scripts/probe/jig-cross-p5.mjs` 交叉验证
 * （同一份 500 行真实夹具，逐格比对 462 个格子的定位键与面包屑）。
 */

import { describe, it, expect } from 'vitest'

import { createDefaultJigConfig } from '../core/config'
import { buildDrillTable, openDrill, resolvePivotPns } from '../core/drill'
import { generatePivot, SUMMARY_CST } from '../core/pivot'
import type { Row } from '../core/table'

const config = createDefaultJigConfig()

const rows: Row[] = [
  { 'P/N': 'PN-A', 'CST ID': 'C1', 'Jig ID': 'J1', 工程名: 'PNP', 工程: '50000' },
  { 'P/N': 'PN-A', 'CST ID': 'C1', 'Jig ID': 'J1', 工程名: 'Jig入库', 工程: '50001' },
  { 'P/N': 'PN-A', 'CST ID': 'C2', 'Jig ID': 'J2', 工程名: 'PNP', 工程: '50000' },
  { 'P/N': 'PN-B', 'CST ID': 'C3', 'Jig ID': 'J3', 工程名: 'Jig Loading', 工程: '50001' }
]

const pivot = generatePivot(rows, false, config)
const viewPns = resolvePivotPns(pivot, config.keywordTotal)

/** 对某个格子下钻 */
function drillAt(rowIndex: number, column: string) {
  return openDrill({
    rowIndex,
    column,
    from: 'pivot',
    table: pivot,
    viewPns,
    scopePn: '',
    scopeIsProd: false,
    config
  })
}

describe('resolvePivotPns', () => {
  it('明细行的 P/N 沿上方小计行上溯', () => {
    // 第 0 行是小计行（PN-A），第 1 行是它下面的明细行
    expect(pivot.rows[0]['CST ID']).toBe(SUMMARY_CST)
    expect(pivot.rows[1]['P/N']).toBe('')
    expect(viewPns[1]).toBe('PN-A')
  })

  it('总计行的 P/N 归一为空', () => {
    const last = pivot.rows.length - 1
    expect(pivot.rows[last]['P/N']).toBe(config.keywordTotal)
    expect(viewPns[last]).toBe('')
  })
})

describe('openDrill', () => {
  it('点工序列：定位到 P/N + CST + 工序', () => {
    const d = drillAt(1, 'PNP')
    expect(d?.key.pn).toBe('PN-A')
    expect(d?.key.cst).toBe('C1')
    expect(d?.key.eng).toBe('PNP')
  })

  it('面包屑：全量透视 › P/N › CST › 工序', () => {
    expect(drillAt(1, 'PNP')?.crumbs).toEqual(['全量透视', 'PN-A', 'C1', 'PNP'])
  })

  it('点小计行：不下钻到单个 CST，用「全部 CST」', () => {
    const d = drillAt(0, 'PNP')
    expect(d?.key.cst).toBeUndefined()
    expect(d?.crumbs).toContain('全部 CST')
  })

  it('点总计列：对应「全部工序」', () => {
    const d = drillAt(1, config.keywordTotal)
    expect(d?.key.eng).toBeUndefined()
    expect(d?.crumbs).toContain('全部工序')
  })

  it('点总计行的某一工序列：定位到该工序的全部型号', () => {
    const last = pivot.rows.length - 1
    const d = drillAt(last, 'PNP')
    // 总计行的 P/N 是「总计」，不作为筛选条件 —— 但工序列仍是有效定位
    expect(d?.key.pn).toBeUndefined()
    expect(d?.key.eng).toBe('PNP')
    expect(d?.crumbs).toEqual(['全量透视', 'PNP'])
  })

  it('点总计行的「总计」列：定位到全表', () => {
    const last = pivot.rows.length - 1
    const d = drillAt(last, config.keywordTotal)
    expect(d?.key.pn).toBeUndefined()
    expect(d?.key.eng).toBeUndefined()
    expect(d?.crumbs).toEqual(['全量透视', '全表'])
  })

  it('P/N 范围下点总计行仍沿用该 P/N', () => {
    const d = openDrill({
      rowIndex: pivot.rows.length - 1,
      column: 'PNP',
      from: 'pivot',
      table: pivot,
      viewPns,
      scopePn: 'PN-A',
      scopeIsProd: false,
      config
    })
    expect(d?.key.pn).toBe('PN-A')
  })

  it('生产中范围的面包屑带「· 生产中」', () => {
    const d = openDrill({
      rowIndex: 1,
      column: 'PNP',
      from: 'pivot',
      table: pivot,
      viewPns,
      scopePn: '',
      scopeIsProd: true,
      config
    })
    expect(d?.crumbs[0]).toBe('全量透视 · 生产中')
    expect(d?.filterProduction).toBe(true)
  })

  it('结果透视的面包屑起点是「结果透视」', () => {
    const d = openDrill({
      rowIndex: 1,
      column: 'PNP',
      from: 'queryPivot',
      table: pivot,
      viewPns,
      scopePn: '',
      scopeIsProd: false,
      config
    })
    expect(d?.crumbs[0]).toBe('结果透视')
    expect(d?.filterProduction).toBe(false)
  })

  it('行下标越界返回 null', () => {
    expect(drillAt(999, 'PNP')).toBeNull()
  })
})

describe('buildDrillTable', () => {
  it('下钻明细的行数等于该格子的计数', () => {
    const d = drillAt(1, 'PNP')
    const table = buildDrillTable(d, rows, config)
    const cell = pivot.rows[1]['PNP'] ?? ''
    expect(table.rows).toHaveLength(Number(cell))
  })

  it('没有下钻时返回空表', () => {
    expect(buildDrillTable(null, rows, config).rows).toHaveLength(0)
  })
})
