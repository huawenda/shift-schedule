import { useMemo } from 'react'
import { currentMonthKey, getPeriod, type MonthKey } from '../data/period'

/**
 * 结算月导航：月份由路由（hash）持有，这里只负责派生周期与「是否当前月」。
 * 翻月 / 回到本月改的是 hash，由 App 的 navigate 统一处理 ——
 * 这样刷新、分享链接、切到设置再切回来都不会丢掉正在看的月份。
 */
export function useMonthNavigation(monthKey: MonthKey) {
  const period = useMemo(() => getPeriod(monthKey), [monthKey])
  const today = currentMonthKey()
  const atCurrentMonth = monthKey.year === today.year && monthKey.month === today.month

  return { period, atCurrentMonth }
}
