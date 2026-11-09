/**
 * 数据审查的分类与筛选 —— 每行归入「尺寸匹配 / 不匹配」两态。
 *
 * ## 为什么还要这一层
 *
 * 判定规则本身在 `validate.ts`, 这层只做两件很薄的事:
 *
 *   1. **行 -> 分类**: 从 Row 里取 P/N 与「对应尺寸」两列, 交给
 *      validateSizeMatch, 转成 `ok | mismatch`。调用方(查询结果页、
 *      审查页、导出)都不必自己拼字段, 也不会各写一份取法。
 *   2. **分类 -> 筛选**: `isFlagged` 把分类折成布尔(表格标红用),
 *      `matchesScope` 按视野筛行(审查页两档用)。
 *
 * 一开始它是为三档审查(所有对象/尺寸不匹配/仅例外)而建的, 例外功能下线后
 * 只剩两态 —— 但分层本身仍然成立: 一张表只判一次, 标红与筛选都基于同一份
 * 结果, 不会出现"表格标红用的是 A 规则、筛选用的是 B 规则"这种错位。
 *
 * ## 缺列时返回空数组
 *
 * 表里没有「对应尺寸」列(例如透视表)时 `classifyReviewTable` 返回**空数组**,
 * 而不是全 `ok`。调用方据此判断"这张表不适用尺寸审查"; 返回全 ok 会被当成
 * "审过了, 全都没问题", 两者语义完全不同。
 */

import type { Row, Table } from './table'
import type { SizeValidationRules } from './validate'
import { validateSizeMatch } from './validate'

/** 一行的审查归类 */
export type ReviewKind = 'ok' | 'mismatch'

/**
 * 审查页的视野。
 *
 *   all       所有对象 —— 不筛
 *   mismatch  尺寸不匹配 —— 只留标红的行
 */
export type ReviewScope = 'all' | 'mismatch'

/** 分档按钮的标签与顺序, 供 UI 直接遍历 */
export const REVIEW_SCOPES: ReadonlyArray<{ id: ReviewScope; label: string }> = [
  { id: 'all', label: '所有对象' },
  { id: 'mismatch', label: '尺寸不匹配' },
]

/**
 * 判定单行。
 *
 * 取值为空(P/N 太短、型号不在映射表 -> 尺寸空串)时 validateSizeMatch 视为
 * 匹配, 这是既有约定: 静默不标红, 宁可漏报也不误报。
 */
export function classifyReviewRow(
  row: Row,
  rules: SizeValidationRules,
): ReviewKind {
  const pn = row['P/N'] ?? ''
  return validateSizeMatch(pn, row['对应尺寸'] ?? '', rules) ? 'ok' : 'mismatch'
}

/**
 * 整表判定。
 *
 * 没有「对应尺寸」列时返回空数组, 原因见文件头。
 */
export function classifyReviewTable(
  table: Table,
  rules: SizeValidationRules,
): ReviewKind[] {
  if (!table.columns.includes('对应尺寸')) return []
  return table.rows.map((r) => classifyReviewRow(r, rules))
}

/** 该行是否要标红 */
export function isFlagged(kind: ReviewKind): boolean {
  return kind !== 'ok'
}

/** 该行是否属于某一档 */
export function matchesScope(kind: ReviewKind, scope: ReviewScope): boolean {
  if (scope === 'all') return true
  return kind !== 'ok'
}
