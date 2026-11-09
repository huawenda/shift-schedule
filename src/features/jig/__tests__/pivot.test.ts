/**
 * 透视表生成 —— 结构与数值测试
 *
 * 全部用自造小样本驱动, 不依赖任何外部快照文件。
 * 样本刻意覆盖了透视表的四个易错点:
 *   1. 同一 P/N 的多个 Jig 要汇总成小计行
 *   2. CST ID 为空时由 Lot ID 回填
 *   3. 某 CST 没有的工序必须写空串, 不能写 0
 *   4. 末行是全表总计, P/N 固定为 "总计"
 */

import { describe, it, expect } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import { generatePivot, SUMMARY_CST } from '../core/pivot'
import type { Row } from '../core/table'

const config = createDefaultJigConfig()

const sampleSource: Row[] = [
  { 'P/N': 'PN-A', 'CST ID': 'CST1', '工程': '8400', '工程名': 'PNP', 'Jig ID': 'J1' },
  { 'P/N': 'PN-A', 'CST ID': 'CST1', '工程': '8400', '工程名': 'PNP', 'Jig ID': 'J2' },
  { 'P/N': 'PN-A', 'CST ID': 'CST2', '工程': '9000', '工程名': 'Jig Loading', 'Jig ID': 'J3' },
  { 'P/N': 'PN-B', 'CST ID': '', 'Lot ID': 'LOT9', '工程': '50000', '工程名': 'Jig 搬出待机', 'Jig ID': 'J4' },
]

describe('透视表 —— 结构不变量', () => {
  const pivot = generatePivot(sampleSource, false, config)

  it('列序为 [P/N, CST ID, ...工程列(按order), 总计]', () => {
    expect(pivot.columns).toEqual(['P/N', 'CST ID', 'PNP', 'Jig Loading', 'Jig 搬出待机', '总计'])
  })

  it('工程列按 engineeringConfig.order 排序 (PNP=10 先于 Jig搬出待机=80)', () => {
    const idxPnp = pivot.columns.indexOf('PNP')
    const idxWait = pivot.columns.indexOf('Jig 搬出待机')
    expect(idxPnp).toBeLessThan(idxWait)
  })

  it('空 CST ID 由 Lot ID 回填', () => {
    const detail = pivot.rows.find((r) => r['CST ID'] === 'LOT9')
    expect(detail).toBeDefined()
  })

  it('小计行使用 "--" 作为 CST ID', () => {
    const summary = pivot.rows.find(
      (r) => r['P/N'] === 'PN-A' && r['CST ID'] === SUMMARY_CST,
    )
    expect(summary).toBeDefined()
    expect(summary!['PNP']).toBe('2') // 两个 Jig 在 PNP
    expect(summary!['总计']).toBe('3')
  })

  it('0 值写成空字符串', () => {
    const detail = pivot.rows.find((r) => r['CST ID'] === 'CST1')
    expect(detail!['Jig Loading']).toBe('') // 该 CST 没有 Loading 工序
  })

  it('末行为全表总计, P/N = "总计"', () => {
    const last = pivot.rows[pivot.rows.length - 1]
    expect(last['P/N']).toBe('总计')
    expect(last['总计']).toBe('4')
  })

  it('小计之和等于全表总计', () => {
    const total = pivot.rows[pivot.rows.length - 1]
    const sum = pivot.rows
      .filter((r) => r['CST ID'] === SUMMARY_CST)
      .reduce((acc, r) => acc + Number(r['总计']), 0)
    expect(Number(total['总计'])).toBe(sum)
  })
})

describe('透视表 —— 生产中筛选', () => {
  it('只保留含关键工程代码(50000)的 P/N', () => {
    const prod = generatePivot(sampleSource, true, config)
    // PN-B 含工程 50000 => 保留; PN-A 不含 => 剔除
    expect(prod.rows.some((r) => r['P/N'] === 'PN-B')).toBe(true)
    expect(prod.rows.some((r) => r['P/N'] === 'PN-A')).toBe(false)
  })

  it('无生产中数据时返回空表', () => {
    const noProd: Row[] = [
      { 'P/N': 'X', 'CST ID': 'C', '工程': '8400', '工程名': 'PNP', 'Jig ID': 'J' },
    ]
    const prod = generatePivot(noProd, true, config)
    expect(prod.rows).toHaveLength(0)
    expect(prod.columns).toHaveLength(0)
  })
})