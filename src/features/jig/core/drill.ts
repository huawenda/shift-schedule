/**
 * 透视表的下钻。
 *
 * 原项目把下钻写在 App.tsx 里（一堆 useMemo + useCallback），本项目收成
 * 纯函数模块，理由与 `pivotScope.ts` 一样：口径要能与原项目逐值比对，
 * 且组件只该管渲染。
 *
 * ## 下钻是什么
 *
 * 透视表每一格是一个计数（「这个 P/N 的这块板，有 18 块走到 PNP 这道工序」）。
 * 点这个数字，看到的就是**构成这个数字的那些源行** —— 这就是下钻。
 *
 * 定位一个格子要三个键：
 *   - `pn`  —— 哪个型号（P/N）
 *   - `cst` —— 哪一块板（CST ID）
 *   - `eng` —— 哪道工序
 *
 * 三者都缺省表示「全表」。
 *
 * ## 一处容易错的地方
 *
 * 透视表里**明细行的 P/N 是空串**（视觉上属于上方的小计行），总计行的 P/N
 * 写「总计」。两者都不能直接当筛选条件用 —— 直接读 `row['P/N']` 会得到
 * 「明细行全都变成空 P/N」。必须像 `resolvePivotPns` 那样沿小计行上溯，
 * 把每一行还原成它真正所属的型号。
 */

import type { JigConfig } from './config'
import { buildDetailTable } from './query'
import {
  drillPivotRows,
  ORIGINAL_CST_KEY,
  SUMMARY_CST,
  type PivotDrillKey
} from './pivot'
import type { Row, Table } from './table'

/** 下钻的来源页 */
export type DrillFrom = 'pivot' | 'queryPivot'

/** 下钻状态 */
export interface DrillState {
  /** 从哪一页下钻的 */
  from: DrillFrom
  /** 定位键 */
  key: PivotDrillKey
  /** 面包屑：从「全量透视」到具体格子的路径 */
  crumbs: string[]
  /**
   * 该透视表构建时是否开了「生产中」筛选，下钻必须用同一个口径。
   *
   * 口径不一致的后果：表格上的数字是生产中口径的，下钻却按全部数据筛，
   * 筛出来的行数与格子上的数字对不上。
   */
  filterProduction: boolean
}

/**
 * 解析透视表每一行所属的 P/N。
 *
 * 明细行的 P/N 是空串（视觉上属于上方小计行），总计行的 P/N 是「总计」，
 * 两者都不能直接当筛选条件用，所以下钻前先还原成真实的 P/N。
 */
export function resolvePivotPns(table: Table, keywordTotal: string): string[] {
  const out: string[] = []
  let current = ''
  for (const r of table.rows) {
    if (r['CST ID'] === SUMMARY_CST) current = r['P/N'] ?? ''
    out.push(r['P/N'] === keywordTotal ? '' : r['P/N'] || current)
  }
  return out
}

/** 下钻的入参 */
export interface OpenDrillInput {
  /** 点的是哪一行（透视表行下标） */
  rowIndex: number
  /** 点的是哪一列（列名） */
  column: string
  /** 当前页签 */
  from: DrillFrom
  /** 当前显示的透视表 */
  table: Table
  /** 透视表每一行所属的 P/N */
  viewPns: string[]
  /** 当前锁定的 P/N（显示范围选了某个型号时有值） */
  scopePn: string
  /** 显示范围是不是「生产中」 */
  scopeIsProd: boolean
  /** 业务配置 */
  config: JigConfig
}

/**
 * 由一次点击算出下钻状态。
 *
 * 返回 null 表示这次点击不该进入下钻。
 */
export function openDrill(input: OpenDrillInput): DrillState | null {
  const { rowIndex, column, from, table, viewPns, scopePn, scopeIsProd, config } = input

  const row = table.rows[rowIndex]
  if (!row) return null

  const isTotalRow = row['P/N'] === config.keywordTotal
  const isSub = row['CST ID'] === SUMMARY_CST

  /**
   * P/N 范围下，总计行的行内没有 P/N，但当前视图只覆盖一个 P/N，
   * 点击它必须沿用该 P/N；否则会被解释成「全表」，筛出其它 P/N 的行。
   */
  const pn = scopePn || (isTotalRow ? '' : viewPns[rowIndex] ?? '')

  const key: PivotDrillKey = {}
  if (pn) key.pn = pn
  // 只有 CST 明细行才下钻到单个 CST —— 小计行与总计行代表整个分组
  if (!isTotalRow && !isSub) key.cst = row['CST ID']
  // 「总计」列不代表某道工序，对应「全部工序」
  if (column !== config.keywordTotal) key.eng = column

  const base = from === 'pivot' ? (scopeIsProd ? '全量透视 · 生产中' : '全量透视') : '结果透视'

  const crumbs = [base]
  if (key.pn) crumbs.push(key.pn)
  if (key.cst) crumbs.push(key.cst)
  else if (key.pn) crumbs.push('全部 CST')
  if (key.eng) crumbs.push(key.eng)
  else if (key.pn) crumbs.push('全部工序')
  if (!key.pn && !key.cst && !key.eng) crumbs.push('全表')

  return {
    from,
    key,
    crumbs,
    filterProduction: from === 'pivot' && scopeIsProd
  }
}

/**
 * 由下钻状态算出明细表。
 *
 * `baseRows` 必须与当前显示的透视表**用同一批行** ——
 * 全量透视传透视的底稿，结果透视传本次查询命中的行（快照）。
 * 底稿不同，筛出的行数就与格子上的数字对不上。
 *
 * ## CST ID 还原
 *
 * 透视表用 Lot ID 回填了空的 CST ID（那是分组键，必须有值）。
 * 但下钻明细是**原样展示源数据**的地方 —— 那块板就是没编 CST 号，
 * 显示成 Lot ID 会让人以为它有 CST 号。
 *
 * 所以这里按 `ORIGINAL_CST_KEY` 记下的原值还原。**筛选仍用回填后的值** ——
 * 定位键（key.cst）来自透视表，用原值就与格子的口径对不上了。
 */
export function buildDrillTable(
  drill: DrillState | null,
  baseRows: ReadonlyArray<Row>,
  config: JigConfig
): Table {
  if (!drill) return { columns: [], rows: [] }
  const rows = drillPivotRows(baseRows, drill.key, drill.filterProduction, config)

  // 还原 CST ID 的原值（回填过的行才需要）
  const restored = rows.map(r =>
    ORIGINAL_CST_KEY in r
      ? { ...r, 'CST ID': r[ORIGINAL_CST_KEY] ?? '' }
      : r
  )

  return buildDetailTable(restored, config)
}
