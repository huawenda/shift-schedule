/**
 * JIG 页的四个工作视图 —— 与原项目（JIG Data Finder）一一对应。
 *
 * 为什么是「一个侧栏入口 + 页内四段」而不是四个侧栏入口：
 * 四视图共享**同一份源数据**（同一个 Excel 文件），切换时不需要重新读文件，
 * 本质上是一个工作台的四个视角。铺成四个侧栏项会把侧栏撑长，
 * 还会让人误以为它们是彼此独立的页面。
 *
 * 子页进 hash（`#/jig/pivot`），这样刷新后仍停在原来那一段，
 * 也能把链接直接发给同事。
 */

/** 子页 id：与原项目的 TabId 同名，便于对照 */
export type JigTabId = 'detail' | 'queryPivot' | 'pivot' | 'review'

/** 标签文案：页签、窗口标题、导出按钮共用同一份，避免三处漂移 */
export const JIG_TAB_LABELS: Record<JigTabId, string> = {
  detail: '查询结果',
  queryPivot: '结果透视',
  pivot: '全量透视',
  review: '数据审查'
}

/** 页签的展示顺序 */
export const JIG_TAB_ORDER: readonly JigTabId[] = ['detail', 'queryPivot', 'pivot', 'review']

/** 子页 id ↔ hash 片段。hash 用短横线小写（`query-pivot`），比驼峰更适合出现在地址栏里 */
const TAB_SLUG: Record<JigTabId, string> = {
  detail: 'detail',
  queryPivot: 'query-pivot',
  pivot: 'pivot',
  review: 'review'
}

const SLUG_TAB: Record<string, JigTabId> = {
  detail: 'detail',
  'query-pivot': 'queryPivot',
  pivot: 'pivot',
  review: 'review'
}

/** 子页 id → hash 片段 */
export function jigTabToSlug(tab: JigTabId): string {
  return TAB_SLUG[tab]
}

/** hash 片段 → 子页 id；认不出来时回落到「查询结果」 */
export function jigTabFromSlug(slug: string | undefined): JigTabId {
  if (!slug) return 'detail'
  return SLUG_TAB[slug] ?? 'detail'
}
