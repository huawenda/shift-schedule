/**
 * 透视下钻 —— 逐格校验
 *
 * 核心不变量: 点某个计数格筛出的明细行数, 必须等于格子上写的数字。
 * 这条最容易在 CST 回填 / 生产中筛选 / 工序黑名单这三步上悄悄失配,
 * 所以测试直接遍历透视表的每一个非空计数格, 而不是只挑几个代表。
 */

import { describe, it, expect } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import { buildDetailTable } from '../core/query'
import {
  drillPivotRows,
  generatePivot,
  SUMMARY_CST,
  type PivotDrillKey,
} from '../core/pivot'
import type { Row, Table } from '../core/table'

const config = createDefaultJigConfig()
const KEY_TOTAL = config.keywordTotal

const sampleSource: Row[] = [
  {
    'P/N': 'PN-A',
    'CST ID': 'CST1',
    工程: '8400',
    工程名: 'PNP',
    'Jig ID': 'J1',
    'Jig 对应型号': '184',
  },
  {
    'P/N': 'PN-A',
    'CST ID': 'CST1',
    工程: '8400',
    工程名: 'PNP',
    'Jig ID': 'J2',
    'Jig 对应型号': '184',
  },
  {
    'P/N': 'PN-A',
    'CST ID': 'CST2',
    工程: '9000',
    工程名: 'Jig Loading',
    'Jig ID': 'J3',
    'Jig 对应型号': '184',
  },
  {
    'P/N': 'PN-B',
    'CST ID': '',
    'Lot ID': 'LOT9',
    工程: '50000',
    工程名: 'Jig 搬出待机',
    'Jig ID': 'J4',
    'Jig 对应型号': '184',
  },
]

/**
 * 解析每一行所属的 P/N。
 *
 * 透视里明细行的 P/N 是空串 (视觉上挂在上方小计行), 总计行的 P/N 是「总计」。
 * App 的点击处理必须做同样的上溯, 这里用独立实现做对照。
 */
function resolvePns(table: Table): string[] {
  const out: string[] = []
  let current = ''
  for (const r of table.rows) {
    if (r['CST ID'] === SUMMARY_CST) current = r['P/N'] ?? ''
    out.push(r['P/N'] === KEY_TOTAL ? '' : r['P/N'] || current)
  }
  return out
}

/** 把某行某列翻译成下钻定位键, 与 App 中 openDrill 的规则一致 */
function keyOf(row: Row, column: string, pn: string): PivotDrillKey {
  const key: PivotDrillKey = {}
  if (pn !== '') key.pn = pn
  // 小计行 (CST = "--") 不下钻到某个 CST
  if (pn !== '' && row['CST ID'] !== SUMMARY_CST) key.cst = row['CST ID']
  if (column !== KEY_TOTAL) key.eng = column
  return key
}

function expectEveryCellMatches(
  base: Row[],
  filterProduction: boolean,
  cfg = config,
) {
  const pivot = generatePivot(base, filterProduction, cfg)
  const pns = resolvePns(pivot)
  for (let i = 0; i < pivot.rows.length; i++) {
    const row = pivot.rows[i]
    for (const col of pivot.columns) {
      if (col === 'P/N' || col === 'CST ID') continue
      const raw = row[col] ?? ''
      if (raw === '') continue
      const key = keyOf(row, col, pns[i])
      const drilled = drillPivotRows(base, key, filterProduction, cfg)
      expect(drilled.length, `行 ${i} 列 ${col} (${raw})`).toBe(Number(raw))
    }
  }
}

describe('透视下钻 —— 行数等于单元格计数', () => {
  it('全部数据', () => {
    expectEveryCellMatches(sampleSource, false)
  })

  it('生产中范围', () => {
    expectEveryCellMatches(sampleSource, true)
  })

  it('排除工序黑名单后仍成立', () => {
    const cfg = createDefaultJigConfig()
    cfg.pivotExcludeNames = ['PNP']
    expectEveryCellMatches(sampleSource, false, cfg)
  })

  it('只显示某个 P/N 时仍成立', () => {
    const base = sampleSource.filter((r) => r['P/N'] === 'PN-A')
    expectEveryCellMatches(base, false)
  })

  it('CST ID 由 Lot ID 回填的格可以下钻', () => {
    const rows = drillPivotRows(
      sampleSource,
      { pn: 'PN-B', cst: 'LOT9' },
      false,
      config,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]['Jig ID']).toBe('J4')
  })

  it('总计行只按工序下钻, 不受 P/N 与 CST 限制', () => {
    const rows = drillPivotRows(sampleSource, { eng: 'PNP' }, false, config)
    expect(rows).toHaveLength(2)
  })

  it('全表下钻返回全部预处理后的行', () => {
    expect(drillPivotRows(sampleSource, {}, false, config)).toHaveLength(4)
  })
})

describe('透视明细 —— 列与尺寸', () => {
  it('明细列沿用查询结果的输出列序, 且包含对应尺寸', () => {
    const rows = drillPivotRows(sampleSource, { pn: 'PN-A', eng: 'PNP' }, false, config)
    const table = buildDetailTable(rows, config)
    const cols = table.columns
    expect(cols).toContain('对应尺寸')
    expect(cols.indexOf('对应尺寸')).toBe(cols.indexOf('Jig 对应型号') + 1)
    expect(table.rows[0]['对应尺寸']).toBe('65/55')
  })

  it('明细不做 Jig 状态过滤 (结果透视的底数据可能含非 INPRODUCTION)', () => {
    const rows: Row[] = [
      ...sampleSource,
      {
        'P/N': 'PN-C',
        'CST ID': 'CST3',
        工程: '8400',
        工程名: 'PNP',
        'Jig ID': 'J5',
        'Jig状态': 'WAITING',
      },
    ]
    const table = buildDetailTable(rows, config)
    expect(table.rows.some((r) => r['Jig ID'] === 'J5')).toBe(true)
  })
})
