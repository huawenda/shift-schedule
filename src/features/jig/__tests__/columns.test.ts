/**
 * 表格列宽计算 —— 行为测试
 *
 * 锁的是**口径**：
 *   - 每列宽度只由该列内容决定，与窗口宽度无关（表格要么刚好放下，
 *     要么整体横向滚动）；
 *   - 表头与内容按各自字号量（当前两者同字号，表头另计字重与字距）；
 *   - 宽度有下限与上限（超长内容不能把整张表撑到几千像素宽）。
 *
 * jsdom 下没有 canvas 2d 上下文，测量走「按字符数估」的兜底路径 ——
 * 测的是**算法结构**（夹紧、逐列独立、按最长内容定宽），
 * 真实渲染宽度由 scripts/probe 的一次性测量脚本核对。
 */

import { describe, it, expect } from 'vitest'

import { computeColumnWidths } from '../core/columns'
import type { Row } from '../core/table'

const MIN_COL_W = 68
const MAX_COL_W = 360

describe('computeColumnWidths', () => {
  it('每列宽度独立：内容长的列更宽', () => {
    const rows: Row[] = [
      { A: 'x', B: '一个很长的内容占满整列' },
      { A: 'x', B: '短' }
    ]
    const widths = computeColumnWidths(['A', 'B'], rows)
    expect(widths).toHaveLength(2)
    expect(widths[1]).toBeGreaterThan(widths[0])
  })

  it('宽度不与行数有关：同样内容，表格加行不改宽度', () => {
    const one: Row[] = [{ A: 'abc' }]
    const many: Row[] = [{ A: 'abc' }, { A: 'abc' }, { A: 'abc' }]
    expect(computeColumnWidths(['A'], many)).toEqual(
      computeColumnWidths(['A'], one)
    )
  })

  it('宽度不与其它列有关：加一列不影响原列', () => {
    const rows: Row[] = [{ A: 'abc', B: 'x'.repeat(50) }]
    const withB = computeColumnWidths(['A', 'B'], rows)
    const onlyA = computeColumnWidths(['A'], rows)
    expect(withB[0]).toBe(onlyA[0])
  })

  it('短内容不低于下限', () => {
    const widths = computeColumnWidths(['A'], [{ A: 'x' }])
    expect(widths[0]).toBeGreaterThanOrEqual(MIN_COL_W)
  })

  it('超长内容不超过上限', () => {
    const widths = computeColumnWidths(['A'], [{ A: 'x'.repeat(2000) }])
    expect(widths[0]).toBeLessThanOrEqual(MAX_COL_W)
  })

  it('没有列时返回空数组', () => {
    expect(computeColumnWidths([], [])).toEqual([])
  })

  it('缺值的单元格不撑宽列', () => {
    const withMissing = computeColumnWidths(['A'], [{ B: 'x'.repeat(30) }])
    const empty = computeColumnWidths(['A'], [{ A: '' }])
    expect(withMissing[0]).toBe(empty[0])
  })
})
