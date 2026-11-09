/**
 * 数据审查页的 P/N 过滤与两档视野。
 *
 * 原项目把这些写在 App.tsx 里（`reviewByPn` / `reviewKinds` / `reviewCounts` /
 * `reviewFiltered` 四个 useMemo），本项目收成纯函数，理由与 `pivotScope.ts`
 * `drill.ts` 一样：口径要能与原项目逐值比对，组件只该管渲染。
 *
 * ## 两处口径不马虎
 *
 * **1. 审查页不过「标出尺寸不匹配」开关。**
 * 这一页的存在意义就是挑出对不上的 JIG —— 关掉标红，这页就没有内容了。
 * 开关只管查询结果页。
 *
 * **2. 计数按 P/N 过滤后的行数算，不按当前档位算。**
 * 反过来的话，计数会随档位变化，而下拉框本身又依赖已过滤的结果，
 * 会出现「选了某个 P/N 却在收窄后没有该 P/N」的自相矛盾。
 */

import { NOT_FOUND } from './query'
import {
  classifyReviewTable,
  isFlagged,
  matchesScope,
  type ReviewKind,
  type ReviewScope
} from './review'
import type { Row, Table } from './table'
import type { SizeValidationRules } from './validate'

/** P/N 过滤的「全部」哨兵值 */
export const ALL_PN = '全部'

/**
 * 审查页的 P/N 候选。
 *
 * 取自**全部**审查行（不受当前过滤影响），排序后返回 ——
 * 下拉里要能选回任意型号，否则选了某个 P/N 就再也换不回来。
 */
export function reviewPnOptions(table: Table): string[] {
  if (table.rows.length === 0) return []
  const set = new Set<string>()
  for (const r of table.rows) {
    const v = r['P/N']
    if (v && v !== NOT_FOUND) set.add(v)
  }
  return [...set].sort()
}

/**
 * 按 P/N 过滤审查表。
 *
 * 顺序很重要：**先按 P/N 过滤，再按审查范围过滤**（工具条的分段按钮）。
 * 反过来的话，计数会随档位变化，而下拉框本身又依赖已过滤的结果，
 * 会出现「选了某个 P/N 却在收窄后没有该 P/N」的自相矛盾。
 */
export function filterReviewByPn(table: Table, pn: string): Table {
  if (table.rows.length === 0) return { columns: [], rows: [] }
  if (pn === ALL_PN) return table
  return {
    columns: table.columns,
    rows: table.rows.filter((r) => r['P/N'] === pn)
  }
}

/** 审查页的结果 */
export interface ReviewView {
  /** 当前视野下的表 */
  table: Table
  /** 与 table.rows 同序的标红标记 */
  flags: boolean[]
  /** 两档的行数（给分段按钮显示）；all 用表长，不另算一遍 */
  counts: Record<ReviewScope, number>
}

/**
 * 算出审查页的完整视图：分类 → 计数 → 按档筛行。
 *
 * **一行只判一次** —— 标红与筛选共用同一份分类结果，
 * 不会出现「表格标红用的是 A 规则、筛选用的是 B 规则」这种错位。
 */
export function computeReviewView(
  all: Table,
  scope: ReviewScope,
  rules: SizeValidationRules
): ReviewView {
  const byPn = all

  // 完整分类（而不是立刻折成布尔）—— 两档视野要按它筛行
  const kinds: ReviewKind[] = classifyReviewTable(byPn, rules)
  const flags = kinds.map(isFlagged)

  const counts: Record<ReviewScope, number> = {
    all: byPn.rows.length,
    mismatch: flags.filter(Boolean).length
  }

  /*
   * 按档筛行。分类数组在这之前算好，所以这里只做过滤 —— 一行不重复判定。
   *
   * 表里没有「对应尺寸」列（kinds 为空）时不做任何过滤：否则会把整表
   * 清空，用户会以为「数据全都不匹配」。
   */
  if (scope === 'all' || kinds.length === 0) {
    return { table: byPn, flags, counts }
  }

  const rows: Row[] = []
  const scopedFlags: boolean[] = []
  byPn.rows.forEach((r, i) => {
    if (matchesScope(kinds[i], scope)) {
      rows.push(r)
      // 能进这一档的行一定标红，不必再查一次
      scopedFlags.push(true)
    }
  })

  return { table: { columns: byPn.columns, rows }, flags: scopedFlags, counts }
}
