import { useCallback, useMemo, useState } from 'react'
import { currentMonthKey, getPeriod, shiftMonth, type MonthKey } from '../data/period'

/** 结算月导航：当前月份、对应周期、翻月与回到本月 */
export function useMonthNavigation() {
  const [monthKey, setMonthKey] = useState<MonthKey>(() => currentMonthKey())
  const period = useMemo(() => getPeriod(monthKey), [monthKey])

  const goMonth = useCallback((delta: number) => {
    setMonthKey(current => shiftMonth(current, delta))
  }, [])

  const goToday = useCallback(() => setMonthKey(currentMonthKey()), [])

  const today = currentMonthKey()
  const atCurrentMonth = monthKey.year === today.year && monthKey.month === today.month

  return { monthKey, period, goMonth, goToday, atCurrentMonth }
}
