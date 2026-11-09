/**
 * 查询与审查数据处理 —— 行为测试
 *
 * 全部用自造源数据驱动, 不依赖外部快照文件。
 */

import { describe, it, expect } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import {
  queryData,
  processSourceData,
  firstModel,
  buildOutputColumns,
  NOT_FOUND,
} from '../core/query'
import type { Row } from '../core/table'

const config = createDefaultJigConfig()

const source: Row[] = [
  {
    'P/N': 'PN-A',
    'Lot ID': 'L1',
    'CST ID': 'C1',
    'Slot No': '2',
    'Jig ID': 'CJJ349000910',
    'Jig 对应型号': '252 252',
    'Glass判定': 'G',
    '工程名': 'PNP',
    'Jig状态': 'INPRODUCTION',
  },
  {
    'P/N': 'PN-A',
    'Lot ID': 'L1',
    'CST ID': 'C1',
    'Slot No': '10',
    'Jig ID': 'CJJ349000919',
    'Jig 对应型号': 'A01 A01',
    'Glass判定': 'G',
    '工程名': 'Jig Loading',
    'Jig状态': 'INPRODUCTION',
  },
  {
    'P/N': 'PN-B',
    'Lot ID': 'L2',
    'CST ID': 'C2',
    'Slot No': '1',
    'Jig ID': 'CJJ349000920',
    'Jig 对应型号': '256 256',
    'Glass判定': 'N',
    '工程名': 'PNP',
    'Jig状态': 'OUT',
  },
]

describe('型号提取', () => {
  it('取第一个型号', () => {
    expect(firstModel('184 184')).toBe('184')
    expect(firstModel('  252  252 ')).toBe('252')
  })

  it('空值返回空串', () => {
    expect(firstModel('')).toBe('')
    expect(firstModel('   ')).toBe('')
  })
})

describe('输出列序', () => {
  it('"对应尺寸" 插到 "Jig 对应型号" 之后', () => {
    const cols = buildOutputColumns(config)
    const iModel = cols.indexOf('Jig 对应型号')
    const iSize = cols.indexOf('对应尺寸')
    expect(iSize).toBe(iModel + 1)
  })

  it('配置里没有型号列时, 对应尺寸追加到末尾', () => {
    const cols = buildOutputColumns({ ...config, outputColumns: ['P/N', 'Jig ID'] })
    expect(cols).toEqual(['P/N', 'Jig ID', '对应尺寸'])
  })

  it('不重复插入', () => {
    const once = buildOutputColumns(config)
    const twice = buildOutputColumns({ ...config, outputColumns: once })
    expect(twice.filter((c) => c === '对应尺寸')).toHaveLength(1)
  })
})

describe('查询', () => {
  it('列序严格等于 outputColumns + 对应尺寸', () => {
    const t = queryData(source, ['CJJ349000910'], config)
    expect(t.columns).toEqual([
      'P/N',
      'Lot ID',
      'CST ID',
      'Slot No',
      'Jig ID',
      '工程名',
      'Glass判定',
      'Jig 对应型号',
      '对应尺寸',
    ])
  })

  it('生成对应尺寸映射', () => {
    const t = queryData(source, ['CJJ349000910', 'CJJ349000919'], config)
    const byId = new Map(t.rows.map((r) => [r['Jig ID'], r]))
    expect(byId.get('CJJ349000910')!['对应尺寸']).toBe('65/55_77/27_77/42_77/48_83/48')
    expect(byId.get('CJJ349000919')!['对应尺寸']).toBe('') // A01 不在映射表
  })

  it('未命中填 【未找到】, 但型号/尺寸列留空', () => {
    const t = queryData(source, ['NOTEXIST0001'], config)
    expect(t.rows).toHaveLength(1)
    const r = t.rows[0]
    expect(r['Jig ID']).toBe('NOTEXIST0001')
    expect(r['P/N']).toBe(NOT_FOUND)
    expect(r['工程名']).toBe(NOT_FOUND)
    expect(r['Jig 对应型号']).toBe('')
    expect(r['对应尺寸']).toBe('')
  })

  it('Slot No 数值排序: 2 在 10 之前', () => {
    const t = queryData(source, ['CJJ349000910', 'CJJ349000919'], config)
    expect(t.rows.map((r) => r['Slot No'])).toEqual(['2', '10'])
  })

  it('保留输入顺序作为稳定次序 (同 P/N 同 CST 时)', () => {
    const t = queryData(source, ['CJJ349000919', 'CJJ349000910'], config)
    // 同 P/N、同 CST ID, 按 Slot No 数值排序后仍应是 2, 10
    expect(t.rows.map((r) => r['Slot No'])).toEqual(['2', '10'])
  })

  it('空输入返回空表', () => {
    expect(queryData(source, [], config).rows).toHaveLength(0)
  })
})

describe('审查页数据', () => {
  it('只保留 INPRODUCTION 状态', () => {
    const t = processSourceData(source, config)
    const pns = t.rows.map((r) => r['P/N'])
    expect(pns).toContain('PN-A')
    expect(pns).not.toContain('PN-B')
  })

  it('包含对应尺寸列并有映射值', () => {
    const t = processSourceData(source, config)
    expect(t.columns).toContain('对应尺寸')
    const row = t.rows.find((r) => r['Jig ID'] === 'CJJ349000910')
    expect(row!['对应尺寸']).toBe('65/55_77/27_77/42_77/48_83/48')
  })

  it('空源数据返回空表', () => {
    expect(processSourceData([], config).rows).toHaveLength(0)
  })
})