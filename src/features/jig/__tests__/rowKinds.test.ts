/**
 * 表格的行分类判定 —— 纯函数测试
 *
 * 锁的是**空表不炸**：
 * 之前 `isTotal` 直接读 `row['P/N']`，传 undefined 就抛
 * `Cannot read properties of undefined`，整个页面白屏。
 * 而空表时 `rows[rows.length - 1]` 必然是 undefined —— 这条路径必然踩到。
 */

import { describe, it, expect } from 'vitest'

import {
  findTotalRowIndex,
  isSubtotalRow,
  isTotalRow
} from '../core/rowKinds'
import type { Row } from '../core/table'

const KW = '总计'

describe('行分类判定', () => {
  it('空表：findTotalRowIndex 返回 -1，不抛错', () => {
    expect(() => findTotalRowIndex([], KW)).not.toThrow()
    expect(findTotalRowIndex([], KW)).toBe(-1)
  })

  it('空表：isTotalRow(undefined) 返回 false，不抛错', () => {
    expect(() => isTotalRow(undefined, KW)).not.toThrow()
    expect(isTotalRow(undefined, KW)).toBe(false)
  })

  it('空表：isSubtotalRow(undefined) 返回 false，不抛错', () => {
    expect(() => isSubtotalRow(undefined)).not.toThrow()
    expect(isSubtotalRow(undefined)).toBe(false)
  })

  it('最后一行是总计：返回它的下标', () => {
    const rows: Row[] = [
      { 'P/N': 'PN-A', 'CST ID': 'C1' },
      { 'P/N': KW, 'CST ID': '--' }
    ]
    expect(findTotalRowIndex(rows, KW)).toBe(1)
  })

  it('最后一行不是总计：返回 -1', () => {
    const rows: Row[] = [{ 'P/N': 'PN-A', 'CST ID': 'C1' }]
    expect(findTotalRowIndex(rows, KW)).toBe(-1)
  })

  it('小计行：按 CST ID == "--" 判定', () => {
    expect(isSubtotalRow({ 'P/N': 'PN-A', 'CST ID': '--' })).toBe(true)
    expect(isSubtotalRow({ 'P/N': 'PN-A', 'CST ID': 'C1' })).toBe(false)
  })

  it('总计行：按 P/N == keywordTotal 判定', () => {
    expect(isTotalRow({ 'P/N': KW, 'CST ID': '--' }, KW)).toBe(true)
    expect(isTotalRow({ 'P/N': 'PN-A', 'CST ID': '--' }, KW)).toBe(false)
  })
})
