import { describe, expect, it } from 'vitest'

import { computeViewCounts } from '../core/view'
import type { JigData } from '../hooks/useJigData'

/**
 * 造一份够用的 JigData —— 只有行数与下钻这两处被用到。
 */
function makeData(
  counts: Record<string, number>,
  drill: { from: string; rows: number } | null
): JigData {
  const table = (n: number) => ({ columns: [], rows: Array.from({ length: n }, () => ({})) })

  return {
    tables: {
      detail: table(counts.detail ?? 0),
      queryPivot: table(counts.queryPivot ?? 0)
    },
    pivot: { table: table(counts.pivot ?? 0) } as unknown as JigData['pivot'],
    review: { table: table(counts.review ?? 0) } as unknown as JigData['review'],
    drillTable: table(drill?.rows ?? 0),
    drill: drill ? ({ from: drill.from } as JigData['drill']) : null
  } as unknown as JigData
}

describe('computeViewCounts', () => {
  it('各页签的行数各自独立', () => {
    const data = makeData(
      { detail: 10, queryPivot: 20, pivot: 30, review: 40 },
      null
    )
    const counts = computeViewCounts(data, 'detail')
    expect(counts.byTab).toEqual({
      detail: 10,
      queryPivot: 20,
      pivot: 30,
      review: 40
    })
  })

  it('当前页的行数就是该页自己的行数', () => {
    const data = makeData(
      { detail: 10, queryPivot: 20, pivot: 30, review: 40 },
      null
    )
    expect(computeViewCounts(data, 'pivot').current).toBe(30)
    expect(computeViewCounts(data, 'review').current).toBe(40)
  })

  it('下钻时当前行数是明细的行数，不是底表', () => {
    const data = makeData(
      { detail: 10, queryPivot: 20, pivot: 30, review: 40 },
      { from: 'pivot', rows: 3 }
    )
    const counts = computeViewCounts(data, 'pivot')
    expect(counts.current).toBe(3)
    // 徽标仍是各页自己的行数 —— 下钻不改页签上的数字
    expect(counts.byTab.pivot).toBe(30)
  })

  it('下钻属于别的页时不生效', () => {
    const data = makeData(
      { detail: 10, queryPivot: 20, pivot: 30, review: 40 },
      { from: 'pivot', rows: 3 }
    )
    expect(computeViewCounts(data, 'review').current).toBe(40)
  })
})
