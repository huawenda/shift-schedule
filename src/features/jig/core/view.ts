import type { JigTabId } from '../components/jigTabs'
import type { JigData } from '../hooks/useJigData'

/**
 * 「当前这一页显示多少行」的统一口径。
 *
 * 底部状态轨与页签徽标都要这个数 —— 两处各算一遍必然漂移
 * （一个算的是下钻明细、另一个算的是透视表，用户会看到对不上的两个数）。
 */
export interface ViewCounts {
  /** 各页签的行数（页签徽标用） */
  byTab: Record<JigTabId, number>
  /** 某个页签此刻显示的行数（下钻中算明细，否则算该页自己的表） */
  current: number
}

/**
 * 按页签算出行数。
 *
 * **下钻优先**：下钻时用户看到的是明细表，行数就是明细的行数 ——
 * 底栏显示「当前 12 行」而表格里有 12 行才对得上。
 */
export function computeViewCounts(data: JigData, currentTab: JigTabId): ViewCounts {
  const byTab: Record<JigTabId, number> = {
    detail: data.tables.detail.rows.length,
    queryPivot: data.tables.queryPivot.rows.length,
    pivot: data.pivot.table.rows.length,
    review: data.review.table.rows.length
  }

  const drilled = data.drill !== null && data.drill.from === currentTab

  return {
    byTab,
    current: drilled ? data.drillTable.rows.length : byTab[currentTab]
  }
}
