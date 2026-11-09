/**
 * 透视可用性筛选 —— 纯函数测试
 *
 * 口径: 按**工程列**分类。PNP / PNP 2nd / Jig 洗净及检查 / Jig Loading /
 * Jig Unloading 这五道工序算"可用", 其余工序算"非可用"。
 */

import { describe, it, expect } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import {
  AVAILABLE_STAGES,
  countStageCategories,
  filterRowsByStageCategory,
} from '../core/pivot'
import type { Row } from '../core/table'

const config = createDefaultJigConfig()

const rows: Row[] = [
  { 'P/N': 'PN-A', 工程名: 'PNP', 'Jig ID': 'J1' },
  { 'P/N': 'PN-A', 工程名: 'PNP 2nd', 'Jig ID': 'J1' },
  { 'P/N': 'PN-B', 工程名: 'Jig入库', 'Jig ID': 'J2' },
  { 'P/N': 'PN-C', 工程名: 'Jig Loading', 'Jig ID': 'J3' },
  { 'P/N': 'PN-C', 工程名: 'Jig入库', 'Jig ID': 'J3' },
  { 'P/N': 'PN-D', 工程名: '目视Stage', 'Jig ID': 'J4' },
]

describe('可用性口径', () => {
  it('可用集合包含现场指定的五道工序', () => {
    expect([...AVAILABLE_STAGES]).toEqual([
      'PNP',
      'PNP 2nd',
      'Jig 洗净及检查',
      'Jig Loading',
      'Jig Unloading',
    ])
  })

  it('「可用」只保留可用工序的行', () => {
    const out = filterRowsByStageCategory(rows, 'available', config)
    expect(out.map((r) => r['工程名'])).toEqual(['PNP', 'PNP 2nd', 'Jig Loading'])
  })

  it('「非可用」只保留其余工序的行', () => {
    const out = filterRowsByStageCategory(rows, 'unavailable', config)
    expect(out.map((r) => r['工程名'])).toEqual(['Jig入库', 'Jig入库', '目视Stage'])
  })

  it('「全部」原样返回, 不做过滤', () => {
    expect(filterRowsByStageCategory(rows, 'all', config)).toHaveLength(rows.length)
  })
})

describe('分段按钮计数', () => {
  it('按 JIG 记录数统计, 全部 = 可用 + 非可用', () => {
    expect(countStageCategories(rows, config)).toEqual({
      all: 6,
      available: 3,
      unavailable: 3,
    })
  })

  it('未知工序归入非可用', () => {
    const extra: Row[] = [
      ...rows,
      { 'P/N': 'PN-E', 工程名: '未配置工序', 'Jig ID': 'J5' },
    ]
    expect(countStageCategories(extra, config)).toEqual({
      all: 7,
      available: 3,
      unavailable: 4,
    })
  })
})
