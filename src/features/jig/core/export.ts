/**
 * 导出当前视图。
 *
 * ## 导出跟着「看到的」走
 *
 * 下钻时页签仍是透视页，但用户看到的是明细 —— 导出必须跟着看到的内容走，
 * 否则「导出全量透视」会导出看不见的表。同理，审查页切到「尺寸不匹配」
 * 后导出，拿到的就该是一张纯异常清单。
 *
 * ## 红色标记只落在需要的地方
 *
 * 尺寸不匹配的红色标记只在**查询结果页**和**审查页**写入，沿用旧版
 * `main_window.py` 里 `apply_style` 的判定条件。透视表与结果透视不标 ——
 * 那些格子里是计数，不是「对应尺寸」，标了也没有对应的单元格。
 */

import type { JigConfig } from './config'
import type { RedMark } from './excel'
import type { Row, Table } from './table'

/** 一个导出目标 */
export interface JigExportTarget {
  /** 要写进文件的表 */
  table: Table
  /** 文件名（不含扩展名） */
  name: string
  /** 红色标记；不需要时不传 */
  red?: RedMark
}

/**
 * 决定当前该导出什么。
 *
 * @param tab 当前页签
 * @param detail 查询结果表
 * @param detailFlags 查询结果表的标红标记
 * @param queryPivot 结果透视表
 * @param pivot 全量透视表
 * @param review 审查表（已按 P/N 与档位过滤）
 * @param reviewFlags 审查表的标红标记
 * @param drill 下钻状态；非 null 时导出的是明细
 * @param drillTable 下钻明细表
 * @param drillFlags 下钻明细的标红标记
 * @param config 业务配置
 */
export function pickExportTarget(input: {
  tab: 'detail' | 'queryPivot' | 'pivot' | 'review'
  detail: Table
  detailFlags: boolean[]
  queryPivot: Table
  pivot: Table
  review: Table
  reviewFlags: boolean[]
  drill: { crumbs: string[] } | null
  drillTable: Table
  drillFlags: boolean[]
  config: JigConfig
}): JigExportTarget | null {
  const {
    tab,
    detail,
    detailFlags,
    queryPivot,
    pivot,
    review,
    reviewFlags,
    drill,
    drillTable,
    drillFlags,
    config
  } = input

  /**
   * 下钻明细单独走一条：此时页签仍是透视页，但用户看到的是明细，
   * 导出必须跟着看到的内容走。
   */
  if (drill) {
    if (drillTable.rows.length === 0) return null
    return {
      table: drillTable,
      name: `透视明细_${drill.crumbs.slice(1).join('_')}`,
      red: { rows: drillFlags, column: '对应尺寸' }
    }
  }

  switch (tab) {
    case 'detail':
      if (detail.rows.length === 0) return null
      return {
        table: detail,
        name: '查询结果',
        red: { rows: detailFlags, column: '对应尺寸' }
      }
    case 'queryPivot':
      if (queryPivot.rows.length === 0) return null
      return { table: queryPivot, name: '结果透视表' }
    case 'pivot':
      if (pivot.rows.length === 0) return null
      return { table: pivot, name: '全量透视表' }
    default:
      if (review.rows.length === 0) return null
      return {
        table: review,
        name: '审查数据',
        red: { rows: reviewFlags, column: '对应尺寸' }
      }
  }
}

/**
 * 判定哪些行要标红。
 *
 * 表里没有「对应尺寸」列时返回空数组（不是全 false）——
 * 返回空数组表示「这张表不适用尺寸审查」，返回全 false 会被当成
 * 「审过了，全都没问题」，两者语义完全不同。
 */
export function mismatchFlagsOf(
  table: Table,
  isMismatch: (row: Row) => boolean
): boolean[] {
  if (!table.columns.includes('对应尺寸')) return []
  return table.rows.map(isMismatch)
}
