/**
 * 全量透视的显示范围与可用性筛选。
 *
 * 原项目把这些逻辑写在 App.tsx 里（`pivotScope` / `pivotAvail` / `pivotCountRows` /
 * `pivotBaseRows` / `currentPivot` 一堆 useMemo），散在组件里。本项目把它收成一个
 * 纯函数模块，原因有三：
 *
 *   1. **口径必须与原项目逐值一致** —— 计数与透视表得对得上，分段按钮上的数字
 *      得等于透视表总计行的和。收在一处才有一个唯一真相。
 *   2. **可交叉验证** —— 纯函数能被原项目与移植后的代码同时调用、逐值比对。
 *   3. **组件只管渲染** —— App.tsx 已经够长了。
 *
 * ## 口径（原项目口径，不擅自改动）
 *
 * - **显示范围**（`PivotScope`）：`all` 全部数据 / `prod` 生产中 / `pn:<P/N>` 单个型号。
 *   选具体 P/N 时**不再叠加**「生产中」筛选 —— 两个条件互斥却挤在一个单选框里，
 *   用户会判断不出当前生效了哪个。
 * - **可用性筛选**（`StageCategory`）：分类对象是**工程（透视表的列）**，不是 P/N。
 *   「可用」只保留五道可用工序的列与计数，「非可用」只保留其余工序。
 * - **计数口径**：分段按钮上的数字先按「显示范围」取行，再分两档，
 *   所以它等于当前透视表总计行的和。
 */

import { filterActive } from './active'
import type { JigConfig } from './config'
import {
  countStageCategories,
  filterRowsByStageCategory,
  generatePivot,
  preparePivotRows,
  SUMMARY_CST,
  type StageCategory
} from './pivot'
import type { Row, Table } from './table'

/**
 * 全量透视的显示范围。
 *
 * P/N 与「全部/生产中」共用同一个下拉框：选某个 P/N 时就不再叠加
 * 「生产中」筛选，否则两个条件互斥却挤在一个单选框里，用户无法判断
 * 当前到底生效了哪个。
 */
export type PivotScope = 'all' | 'prod' | `pn:${string}`

/** 可用性筛选的档位与标签 */
export const PIVOT_AVAIL_OPTIONS: ReadonlyArray<{
  id: StageCategory
  label: string
}> = [
  { id: 'all', label: '全部' },
  { id: 'available', label: '可用' },
  { id: 'unavailable', label: '非可用' }
]

/** 从 scope 里取出 P/N（非 P/N 范围时为空串） */
export function pivotScopePn(scope: PivotScope): string {
  return scope.startsWith('pn:') ? scope.slice(3) : ''
}

/** scope 是否要求只保留「生产中」的 P/N */
export function isProdScope(scope: PivotScope): boolean {
  return scope === 'prod'
}

/** 一个 scope 的显示名（用于下拉与提示） */
export function pivotScopeLabel(scope: PivotScope): string {
  if (scope === 'all') return '全部数据'
  if (scope === 'prod') return '生产中'
  return pivotScopePn(scope)
}

/**
 * 显示范围的计算结果。
 *
 * `rows` 是「生产中」过滤后的源行 —— 全量透视的所有口径都从它出发。
 */
export interface PivotScopeResult {
  /** 当前显示范围下的透视表 */
  table: Table
  /** 分段按钮上的三档计数 */
  availCounts: Record<StageCategory, number>
  /** 下拉框的 P/N 候选项（取自透视小计行，顺序与表格一致） */
  pnOptions: string[]
  /**
   * 当前范围内的源行（已按 P/N 与可用性筛过）。
   * 工序轨道与下钻明细都从它取数 —— 必须与透视表同源，否则数字对不上。
   */
  rows: Row[]
}

/**
 * 按显示范围与可用性算出透视表。
 *
 * @param sourceRows 源数据行（未经「生产中」过滤）
 * @param scope 显示范围
 * @param avail 可用性筛选档位
 * @param cfg 业务配置
 */
export function computePivotScope(
  sourceRows: ReadonlyArray<Row>,
  scope: PivotScope,
  avail: StageCategory,
  cfg: JigConfig
): PivotScopeResult {
  // 底数据：源数据按 Jig 状态过滤后的行。
  // 单独算一份，供 P/N 范围与下钻复用 —— 两处必须拿到同一批行。
  const activeRows = filterActive(sourceRows, cfg)

  const pn = pivotScopePn(scope)

  /**
   * 分段按钮上的计数：先按「显示范围」取行（生产中 / 单个 P/N），再分两档。
   * 用 preparePivotRows 与透视表保持同一口径（CST 回填 / 生产中筛选 /
   * 工序黑名单），所以计数等于当前透视表总计行的总和。
   */
  const countRows = (() => {
    const prepared = preparePivotRows(activeRows, isProdScope(scope), cfg)
    return pn ? prepared.filter((r) => r['P/N'] === pn) : prepared
  })()

  const availCounts = countStageCategories(countRows, cfg)

  /**
   * 当前透视实际使用的行：P/N 范围 + 工程可用性。
   * 透视表与下钻共用这批行，所以单元格计数与明细行数保持一致。
   */
  const baseRows = filterRowsByStageCategory(
    pn ? activeRows.filter((r) => r['P/N'] === pn) : activeRows,
    avail,
    cfg
  )

  const table = generatePivot(baseRows, isProdScope(scope), cfg)

  /**
   * 当前范围内真正参与透视的源行。
   *
   * 这里必须再走一遍 preparePivotRows —— 透视表**内部**会做同一套预处理
   * （CST 回填 / 生产中筛选 / 工序黑名单），所以「参与透视的行」不等于
   * 「按 P/N 与可用性筛过的行」：选了「生产中」范围时，两者的差别就是
   * 生产中筛选掉的那部分。
   *
   * 这一层预处理是幂等的（CST 已回填、已筛过的再筛一遍结果不变），
   * 所以先做再做与只做一次等价，但返回值与表格口径对齐了。
   */
  const pivotRows = preparePivotRows(baseRows, isProdScope(scope), cfg)

  /**
   * 下拉框的 P/N 候选项：取透视小计行的 P/N，顺序与表格一致。
   *
   * 候选项取自**全部范围**的透视表，不受当前 scope 影响 —— 否则选了某个 P/N 之后，
   * 下拉里就只剩那一个，其它型号再也选不回来了。
   */
  const pnOptions = (() => {
    const all = generatePivot(activeRows, false, cfg)
    const out: string[] = []
    for (const r of all.rows) {
      const p = r['P/N']
      if (r['CST ID'] === SUMMARY_CST && p && p !== cfg.keywordTotal) out.push(p)
    }
    return out
  })()

  return { table, availCounts, pnOptions, rows: pivotRows }
}
