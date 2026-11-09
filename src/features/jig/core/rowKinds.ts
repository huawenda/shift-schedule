/**
 * 表格的行分类判定。
 *
 * 抽成纯函数是为了能测 —— 之前 `isTotal` 直接读 `row['P/N']`，
 * 传进来 undefined 就抛 `Cannot read properties of undefined`，
 * 整个页面白屏。而这个判定在**空表**时必然遇到 undefined
 * （`rows[rows.length - 1]` 在空数组上是 undefined）。
 *
 * 放 core 而不是组件里：判定口径是业务规则（哪一行是小计、哪一行是总计），
 * 组件只管渲染。
 */

import { SUMMARY_CST } from './pivot'
import type { Row } from './table'

/**
 * 判断一行是否为小计行（CST ID == "--"）。
 *
 * 透视表里每个 P/N 下各 CST 的合计行用它标记。
 */
export function isSubtotalRow(row: Row | undefined): boolean {
  return row !== undefined && row['CST ID'] === SUMMARY_CST
}

/**
 * 判断一行是否为总计行（P/N == "总计"）。
 *
 * @param row 那一行；undefined（空表）返回 false
 * @param keywordTotal 总计列的表头文字
 */
export function isTotalRow(
  row: Row | undefined,
  keywordTotal: string
): boolean {
  return row !== undefined && row['P/N'] === keywordTotal
}

/**
 * 找出总计行的行下标；没有总计行返回 -1。
 *
 * **空表必须返回 -1** —— `rows[rows.length - 1]` 在空数组上是 undefined，
 * 直接拿去判断会抛错。
 */
export function findTotalRowIndex(
  rows: ReadonlyArray<Row>,
  keywordTotal: string
): number {
  if (rows.length === 0) return -1
  const last = rows[rows.length - 1]
  return isTotalRow(last, keywordTotal) ? rows.length - 1 : -1
}
